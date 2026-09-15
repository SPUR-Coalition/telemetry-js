/**
 * Content Telemetry — HTTP client.
 *
 * Zero dependencies — uses native fetch (Node 20+, Deno, browsers, Edge).
 */

import type {
  EventEnvelope,
  EventType,
  SessionOutcome,
  SourceRole,
  StartSessionOptions,
  TelemetryClientOptions,
  TelemetryEvent,
  TelemetrySession,
} from "./types.js";

import {
  eventBatchToWire, standaloneEventToWire, sessionToWire,
  initiatorToWire, userContextToWire, outcomeToWire,
} from "./wire.js";

const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

// ---------------------------------------------------------------------------
// TelemetryClient
// ---------------------------------------------------------------------------

/**
 * Async client for recording Content Telemetry sessions and events.
 *
 * Works in Node.js ≥ 20, Deno, browsers, and Edge runtimes (Vercel, Cloudflare).
 *
 * @example
 * ```ts
 * const client = new TelemetryClient({
 *   endpoint: "https://telemetry.example.com",
 *   apiKey: "your-api-key",
 *   failSilently: false,
 *   defaultSourceRole: "agent",
 * });
 *
 * const sessionId = await client.startSession({ contentScope: "my-mix" });
 *
 * await client.recordEvents(sessionId, [
 *   { id: crypto.randomUUID(), type: "content_retrieved",
 *     timestamp: new Date().toISOString(), contentUrl: "https://..." }
 * ]);
 *
 * await client.endSession(sessionId, { type: "browse" });
 * ```
 */
export class TelemetryClient {
  private readonly endpoint: string;
  private readonly apiKey: string | undefined;
  private readonly failSilently: boolean;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly sessions = new Map<string, EventEnvelope>();
  private readonly defaultSourceRole: SourceRole | undefined;

  constructor(options: TelemetryClientOptions) {
    this.endpoint = options.endpoint.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.failSilently = options.failSilently ?? true;
    this.timeout = options.timeout ?? 30_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.defaultSourceRole = options.defaultSourceRole;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey != null) h["X-API-Key"] = this.apiKey;
    return h;
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const url = `${this.endpoint}${path}`;
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (TRANSIENT_STATUS_CODES.has(res.status) && attempt < this.maxRetries) {
          const wait = 2 ** attempt * 1000 + Math.random() * 500;
          await sleep(wait);
          continue;
        }

        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText} from ${url}`);
        }

        const text = await res.text();
        return text.length === 0 ? {} : JSON.parse(text);
      } catch (err) {
        lastError = err;
        if (attempt < this.maxRetries && isTransientError(err)) {
          const wait = 2 ** attempt * 1000 + Math.random() * 500;
          await sleep(wait);
        } else {
          break;
        }
      } finally {
        clearTimeout(timer);
      }
    }

    if (this.failSilently) {
      return null;
    }
    throw lastError;
  }

  /**
   * Start a new telemetry session.
   *
   * @returns Session ID string, or null on silent failure.
   */
  async startSession(options: StartSessionOptions = {}): Promise<string | null> {
    const startedAt = new Date().toISOString();
    const result = await this.post("/sessions/start", {
      initiator_type: options.initiatorType,
      initiator:
        options.initiator != null ? initiatorToWire(options.initiator) : undefined,
      content_scope: options.contentScope,
      agent_id: options.agentId,
      external_session_id: options.externalSessionId,
      user_context:
        options.userContext != null
          ? userContextToWire(options.userContext)
          : {},
      manifest_ref: options.manifestRef,
      prior_session_ids: options.priorSessionIds ?? [],
    }) as { session_id?: string } | null;

    const sessionId = result?.session_id;
    if (!sessionId) {
      if (!this.failSilently) throw new Error("Session start did not return session_id");
      return null;
    }
    this.sessions.set(sessionId, {
      sessionId, startedAt,
      ...(options.agentId != null && { agentId: options.agentId }),
      ...(options.manifestRef != null && { manifestRef: options.manifestRef }),
    });
    return sessionId;
  }

  /**
   * Record a single telemetry event.
   *
   * A UUID `id` is generated when the caller does not supply one, so
   * `content_cited` and `content_presented` events always carry the `id`
   * v1 requires (spec 6.5, 6.6). The generated id is returned so callers
   * can wire it into later events (`citation_id`, `presentation_id`).
   *
   * @returns The locally assigned event id, or null when no session is active.
   * An id is not a delivery receipt: silent mode can suppress a send failure.
   */
  async recordEvent(
    sessionId: string | null,
    eventType: EventType,
    options: Omit<TelemetryEvent, "type" | "timestamp"> & {
      timestamp?: string;
    } = {},
  ): Promise<string | null> {
    if (sessionId == null) return null;
    const id = options.id ?? crypto.randomUUID();
    await this.recordEvents(sessionId, [
      {
        timestamp: new Date().toISOString(),
        ...options,
        id,
        type: eventType,
      },
    ]);
    return id;
  }

  /**
   * Record a batch of telemetry events.
   */
  async recordEvents(
    sessionId: string | null,
    events: TelemetryEvent[],
    envelope: Omit<EventEnvelope, "sessionId" | "ctxToken"> = {},
  ): Promise<void> {
    if (sessionId == null || events.length === 0) return;
    const defaultRole = this.defaultSourceRole;
    const stamped = defaultRole
      ? events.map((e) =>
          e.sourceRole == null ? { ...e, sourceRole: defaultRole } : e,
        )
      : events;
    await this.post("/events", eventBatchToWire(stamped, {
      ...this.sessions.get(sessionId), ...envelope, sessionId,
    }));
  }

  /**
   * Record a standalone event envelope (spec 7.1) - a single event with
   * no session context, or one carried by a `ctx_token` instead of a
   * session. This is the delivery format for origin- and edge-side
   * emitters observing a fetch, and for destination-reported click-out
   * engagements.
   *
   * At Grounding conformance and above the envelope must carry
   * `sessionId` (or `ctxToken` for click-out engagements) together with
   * `agentId` and `startedAt` (spec 5.7.2); a session-less origin or
   * edge retrieval omits all three.
   */
  async recordStandaloneEvent(
    event: TelemetryEvent,
    envelope: EventEnvelope = {},
  ): Promise<void> {
    const defaultRole = this.defaultSourceRole;
    const stamped =
      event.sourceRole == null && defaultRole != null
        ? { ...event, sourceRole: defaultRole }
        : event;
    await this.post("/events", standaloneEventToWire(stamped, envelope));
  }

  /**
   * End a session with an outcome.
   */
  async endSession(
    sessionId: string | null,
    outcome: SessionOutcome,
  ): Promise<void> {
    if (sessionId == null) return;
    await this.post("/sessions/end", {
      session_id: sessionId,
      outcome: outcomeToWire(outcome),
    });
    this.sessions.delete(sessionId);
  }

  /**
   * Upload a complete session in one request (bulk path).
   *
   * Useful for post-hoc reporting or when you've built the session
   * locally and want to submit it in one shot.
   *
   * @returns Server-assigned session ID, or null on silent failure.
   */
  async uploadSession(session: TelemetrySession): Promise<string | null> {
    const result = await this.post("/sessions/bulk", sessionToWire({
      ...session, events: session.events.map(event =>
        event.sourceRole == null && this.defaultSourceRole != null
          ? { ...event, sourceRole: this.defaultSourceRole } : event),
    })) as
      | { session_id?: string }
      | null;
    return result?.session_id ?? null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(err: unknown): boolean {
  if (err instanceof Error) {
    // AbortError (timeout), network errors
    return (
      err.name === "AbortError" ||
      err.name === "TypeError" ||
      err.message.includes("fetch")
    );
  }
  return false;
}
