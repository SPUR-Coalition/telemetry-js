/**
 * Content Telemetry — MCP session tracker.
 *
 * Provides session continuity across stateless MCP tool calls.
 * The calling agent passes a stable `sessionId` string; this module
 * maps it to an OA session UUID and reuses it across tool calls within
 * the same server process.
 *
 * Usage in an MCP tool:
 *
 * ```ts
 * import { TelemetryClient, MCPSessionTracker } from "@openattribution/telemetry";
 *
 * const client = new TelemetryClient({ endpoint: "...", apiKey: "..." });
 * const tracker = new MCPSessionTracker(client, "my-agent", { agentId: "my-agent" });
 *
 * // In your MCP tool handler:
 * server.tool("search_products", { query: z.string(), sessionId: z.string().optional() },
 *   async ({ query, sessionId }) => {
 *     const results = await searchProducts(query);
 *     await tracker.trackRetrieved(sessionId, results.map(r => r.url));
 *     return formatResults(results);
 *   }
 * );
 * ```
 */

import type {
  CitationPosition,
  CitationType,
  EngagementType,
  PresentationKind,
  PresentationType,
  TelemetryEvent,
  StartSessionOptions,
} from "./types.js";
import type { TelemetryClient } from "./client.js";

/**
 * Session tracker for MCP agents.
 *
 * Maintains an in-process mapping of external session IDs to OA session UUIDs.
 * Sessions are created on first use and reused across subsequent tool calls.
 *
 * The in-process registry works correctly for single-process MCP servers.
 * For multi-process or distributed deployments, session continuity must be
 * handled upstream — for example, include the OA session ID in your tool
 * response and pass it back as `externalSessionId` on subsequent calls.
 */
export class MCPSessionTracker {
  private readonly client: TelemetryClient;
  private readonly contentScope: string;
  private readonly registry = new Map<string, string | null>();

  /**
   * @param client - Configured TelemetryClient instance.
   * @param contentScope - Stable identifier for this agent's content scope
   *   (e.g. mix ID, manifest reference, or descriptive slug like "my-shopping-agent").
   */
  constructor(
    client: TelemetryClient,
    contentScope = "mcp-agent",
    private readonly sessionOptions: Omit<StartSessionOptions, "contentScope" | "externalSessionId"> = {},
  ) {
    this.client = client;
    this.contentScope = contentScope;
  }

  /**
   * Get or create an OA session for the given external session ID.
   *
   * If `externalSessionId` is undefined, a new anonymous session is created
   * on every call (no continuity across tool calls).
   *
   * @returns OA session ID string, or null on silent failure.
   */
  async getOrCreateSession(
    externalSessionId: string | undefined,
  ): Promise<string | null> {
    if (externalSessionId != null && this.registry.has(externalSessionId)) {
      return this.registry.get(externalSessionId) ?? null;
    }

    const sessionId = await this.client.startSession({
      ...this.sessionOptions,
      contentScope: this.contentScope,
      ...(externalSessionId != null && { externalSessionId }),
    });

    if (externalSessionId != null && sessionId != null) {
      this.registry.set(externalSessionId, sessionId);
    }

    return sessionId;
  }

  /**
   * Emit `content_retrieved` events for a list of URLs.
   *
   * Call this after fetching products, search results, or any content
   * that influenced the agent's response.
   *
   * @param externalSessionId - Caller-supplied conversation identifier.
   * @param urls - URLs of content retrieved during this tool call.
   */
  async trackRetrieved(
    externalSessionId: string | undefined,
    urls: string[],
  ): Promise<void> {
    if (urls.length === 0) return;
    const sessionId = await this.getOrCreateSession(externalSessionId);
    if (sessionId == null) return;

    const now = new Date().toISOString();
    const events: TelemetryEvent[] = urls.map((url) => ({
      id: crypto.randomUUID(),
      type: "content_retrieved" as const,
      timestamp: now,
      sourceRole: "agent" as const,
      contentUrl: url,
    }));

    await this.client.recordEvents(sessionId, events);
  }

  /**
   * Emit `content_cited` events for content explicitly referenced in a response.
   *
   * Call this when you know which content the agent cited — e.g. the top
   * search result, an editorial quote, or a product recommendation.
   *
   * V1 requires every citation to carry `id`, `output_id`, and
   * `data.citation_type` (spec 6.5). Ids are generated here; pass
   * `outputId` naming the response artifact when you have a stable one,
   * otherwise an opaque per-call identifier is generated. When no
   * `citationType` is given, `unclassified` is emitted rather than
   * omitting the field.
   *
   * @param externalSessionId - Caller-supplied conversation identifier.
   * @param urls - URLs of content cited in the agent's response.
   * @param options - Optional citation metadata.
   * @returns Locally assigned citation ids, or null if no session was created.
   * These are not delivery receipts; silent mode can suppress send failures.
   */
  async trackCited(
    externalSessionId: string | undefined,
    urls: string[],
    options: {
      citationType?: CitationType;
      position?: CitationPosition;
      /** Identifier of the response artifact the citations appear in. */
      outputId?: string;
    } = {},
  ): Promise<Record<string, string> | null> {
    if (urls.length === 0) return {};
    const sessionId = await this.getOrCreateSession(externalSessionId);
    if (sessionId == null) return null;

    const now = new Date().toISOString();
    const outputId = options.outputId ?? `response:${crypto.randomUUID()}`;
    const ids: Record<string, string> = {};
    const events: TelemetryEvent[] = urls.map((url) => {
      const id = crypto.randomUUID();
      ids[url] = id;
      return {
        id,
        type: "content_cited" as const,
        timestamp: now,
        sourceRole: "agent" as const,
        contentUrl: url,
        outputId,
        data: {
          citation_type: options.citationType ?? "unclassified",
          ...(options.position != null && { position: options.position }),
        },
      };
    });

    await this.client.recordEvents(sessionId, events);
    return ids;
  }

  /**
   * Emit `content_presented` events when content or source references
   * become perceivable in the response surface (spec 6.6).
   *
   * Call this when citation links, cards, or snippets render. Keep the
   * returned map: a later `trackEngaged` call needs the presentation id
   * of the exact surface occurrence the user acted on.
   *
   * @param externalSessionId - Caller-supplied conversation identifier.
   * @param urls - URLs presented.
   * @param options - Presentation metadata; `citationIds` is the map
   *   returned by `trackCited` when the presentations carry citations.
   * @returns Locally assigned presentation ids, or null if no session was created.
   * These are not delivery receipts; silent mode can suppress send failures.
   */
  async trackPresented(
    externalSessionId: string | undefined,
    urls: string[],
    options: {
      presentationKind?: PresentationKind;
      presentationType?: PresentationType;
      /** Identifier of the response artifact made perceivable. */
      outputId?: string;
      /** URL → `content_cited` event id, as returned by `trackCited`. */
      citationIds?: Record<string, string>;
    } = {},
  ): Promise<Record<string, string> | null> {
    if (urls.length === 0) return {};
    const sessionId = await this.getOrCreateSession(externalSessionId);
    if (sessionId == null) return null;

    const now = new Date().toISOString();
    const outputId = options.outputId ?? `response:${crypto.randomUUID()}`;
    const ids: Record<string, string> = {};
    const events: TelemetryEvent[] = urls.map((url) => {
      const id = crypto.randomUUID();
      ids[url] = id;
      return {
        id,
        type: "content_presented" as const,
        timestamp: now,
        sourceRole: "agent" as const,
        contentUrl: url,
        outputId,
        ...(options.citationIds?.[url] != null && {
          citationId: options.citationIds[url],
        }),
        data: {
          presentation_kind: options.presentationKind ?? "source_reference",
          presentation_type: options.presentationType ?? "link",
        },
      };
    });

    await this.client.recordEvents(sessionId, events);
    return ids;
  }

  /**
   * Emit `content_engaged` events when a user interacts with content.
   *
   * Call this when a user clicks a link, views an embedded product, or
   * otherwise actively engages with retrieved content. This is the
   * strongest attribution signal before a purchase event.
   *
   * V1 requires every agent-reported engagement to carry
   * `presentation_id`, referencing the exact `content_presented` event
   * the action occurred on (spec 6.7) - pass the map returned by
   * `trackPresented` as `presentationIds`.
   *
   * @param externalSessionId - Caller-supplied conversation identifier.
   * @param urls - URLs the user engaged with.
   * @param options - Optional engagement metadata.
   *
   * @example
   * ```ts
   * // In a redirect/tracking endpoint
   * await tracker.trackEngaged(sessionId, [productUrl], {
   *   engagementType: "link_click",
   *   presentationIds,
   * });
   * ```
   */
  async trackEngaged(
    externalSessionId: string | undefined,
    urls: string[],
    options: {
      engagementType?: EngagementType;
      /** URL → `content_presented` event id, as returned by `trackPresented`. */
      presentationIds?: Record<string, string>;
    } = {},
  ): Promise<void> {
    if (urls.length === 0) return;
    for (const url of urls) {
      if (!options.presentationIds?.[url]) {
        throw new Error(`Missing presentation id for engagement with ${url}`);
      }
    }
    const sessionId = await this.getOrCreateSession(externalSessionId);
    if (sessionId == null) return;

    const now = new Date().toISOString();
    const events: TelemetryEvent[] = urls.map((url) => ({
      id: crypto.randomUUID(),
      type: "content_engaged" as const,
      timestamp: now,
      sourceRole: "agent" as const,
      contentUrl: url,
      ...(options.presentationIds?.[url] != null && {
        presentationId: options.presentationIds[url],
      }),
      data: {
        ...(options.engagementType != null && {
          engagement_type: options.engagementType,
        }),
      },
    }));

    await this.client.recordEvents(sessionId, events);
  }

  /**
   * Record a checkout outcome and end the session.
   *
   * Call this when a user completes a purchase, abandons checkout, or
   * the conversation concludes with a clear commerce outcome.
   * Emits a `checkout_completed` or `checkout_abandoned` event then
   * ends the session with the appropriate outcome type.
   *
   * @param externalSessionId - Caller-supplied conversation identifier.
   * @param outcome - Purchase details.
   *
   * @example
   * ```ts
   * // User completed a purchase
   * await tracker.trackCheckout(sessionId, {
   *   type: "completed",
   *   valueAmount: 4999, // $49.99 in minor units (cents)
   *   currency: "USD",
   * });
   *
   * // User abandoned checkout
   * await tracker.trackCheckout(sessionId, { type: "abandoned" });
   * ```
   */
  async trackCheckout(
    externalSessionId: string | undefined,
    outcome: {
      type: "completed" | "abandoned" | "started";
      valueAmount?: number;
      currency?: string;
      products?: string[];
    },
  ): Promise<void> {
    const sessionId = externalSessionId != null
      ? (this.registry.get(externalSessionId) ?? null)
      : null;

    if (sessionId == null) return;

    // Emit the checkout event
    const eventType = outcome.type === "completed"
      ? "checkout_completed" as const
      : outcome.type === "abandoned"
      ? "checkout_abandoned" as const
      : "checkout_started" as const;

    await this.client.recordEvent(sessionId, eventType);

    // End the session with an outcome for completed/abandoned
    if (outcome.type === "completed" || outcome.type === "abandoned") {
      const outcomeType = outcome.type === "completed" ? "conversion" as const : "abandonment" as const;
      await this.client.endSession(sessionId, {
        type: outcomeType,
        ...(outcome.valueAmount != null && { valueAmount: outcome.valueAmount }),
        ...(outcome.currency != null && { currency: outcome.currency }),
        ...(outcome.products != null && { products: outcome.products }),
      });
      if (externalSessionId != null) {
        this.registry.delete(externalSessionId);
      }
    }
  }

  /**
   * End a session with an explicit outcome.
   *
   * Use `trackCheckout` for commerce outcomes. Use this for non-commerce
   * session endings (browse sessions, timeouts, explicit abandonment).
   */
  async endSession(
    externalSessionId: string | undefined,
    outcome: { type: "conversion" | "abandonment" | "browse"; valueAmount?: number; currency?: string },
  ): Promise<void> {
    const sessionId = externalSessionId != null
      ? (this.registry.get(externalSessionId) ?? null)
      : null;

    if (sessionId == null) return;

    await this.client.endSession(sessionId, {
      type: outcome.type,
      ...(outcome.valueAmount != null && { valueAmount: outcome.valueAmount }),
      ...(outcome.currency != null && { currency: outcome.currency }),
    });

    this.registry.delete(externalSessionId!);
  }

  /** Number of active sessions in the registry. */
  get sessionCount(): number {
    return this.registry.size;
  }
}
