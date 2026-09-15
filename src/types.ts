/**
 * Content Telemetry — TypeScript types.
 *
 * Models the Content Telemetry standard and optional adapter extensions. JSON wire format uses
 * snake_case; these TypeScript types use camelCase with explicit mapping
 * in the client layer.
 *
 * Specification: https://contenttelemetry.org
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/**
 * Supported event types for telemetry tracking.
 *
 * The content lifecycle and conversation types are the Content Telemetry
 * standard's core set (spec 5.3). The commerce types are an OpenAttribution
 * extension: they are not in the standard's core event enum, and only
 * consumers that support the OA commerce profile accept them. The standard
 * recommends namespaced names for extension types; renaming the commerce
 * set is the commerce profile's decision and is tracked there.
 */
export type EventType =
  // Content lifecycle (Content Telemetry core)
  | "content_retrieved"
  | "content_grounded"
  | "content_presented"
  | "content_engaged"
  | "content_cited"
  // Conversation (Content Telemetry core)
  | "turn_started"
  | "turn_completed"
  // Commerce (OpenAttribution extension, not core)
  | "product_viewed"
  | "product_compared"
  | "cart_add"
  | "cart_remove"
  | "checkout_started"
  | "checkout_completed"
  | "checkout_abandoned";

/** Session outcome classifications. */
export type OutcomeType = "conversion" | "abandonment" | "browse";

/**
 * Privacy levels for conversation data sharing.
 * - `full`: Complete query and response text included.
 * - `summary`: LLM-generated summary of the conversation.
 * - `intent`: Only classified intent/topic, no raw text.
 * - `minimal`: Only metadata (token counts, content URLs).
 */
export type PrivacyLevel = "full" | "summary" | "intent" | "minimal";

/**
 * Intent categories for conversation classification.
 *
 * The first group is the Content Telemetry core set (spec 5.6). The second
 * group is commerce-profile extension values; consumers MUST tolerate
 * unknown values, so emitting them is conformant.
 */
export type IntentCategory =
  // Core (spec 5.6)
  | "question"
  | "explanation"
  | "comparison"
  | "how_to"
  | "troubleshooting"
  | "fact_check"
  | "analysis"
  | "opinion_seeking"
  | "creative"
  | "purchase_intent"
  | "chitchat"
  | "other"
  // Commerce extension
  | "product_research"
  | "general_question"
  | "price_check"
  | "availability_check"
  | "review_seeking";

/** Actor type for the session initiator. */
export type InitiatorType = "user" | "agent";

/**
 * Who is reporting a retrieval event.
 * - `origin`: Content owner's web server detected an AI agent/bot request.
 * - `edge`: CDN or edge network (Cloudflare, Fastly, etc.). An edge MISS still reports telemetry.
 * - `index`: Search index or content repository that served the content.
 * - `agent`: The AI agent itself, reporting content it fetched.
 */
export type SourceRole = "origin" | "edge" | "index" | "agent";

/**
 * How a cited piece of content was used in an agent response.
 * Use `unclassified` rather than forcing a classification when the agent
 * cannot confidently determine it (spec 6.5).
 */
export type CitationType =
  | "direct_quote"
  | "paraphrase"
  | "reference"
  | "contradiction"
  | "unclassified";

/** Prominence of cited content within a response. */
export type CitationPosition =
  | "primary"
  | "supporting"
  | "mentioned"
  | "unclassified";

/**
 * How the user acted on content (spec 6.7). `link_click` is the primary
 * clickthrough signal; `agent_navigate` is its agent-mediated counterpart.
 * Custom string values are permitted; consumers MUST tolerate unknown values.
 */
export type EngagementType =
  | "link_click"
  | "expand"
  | "copy"
  | "share"
  | "agent_navigate"
  | (string & {});

/**
 * Emitter capability tier (spec 5.7): each level proves the emitter
 * produces that event and everything below it. Informational on session
 * documents; the authoritative declaration lives in the emitter's manifest.
 */
export type ConformanceLevel = "retrieval" | "grounding" | "citation";

/**
 * Product surface or generation mode (spec 5.4.1). Custom string values
 * are permitted; consumers MUST tolerate unknown values.
 */
export type ResponseMode =
  | "standard"
  | "deep_research"
  | "search"
  | "code_generation"
  | (string & {});

/**
 * Classification of the access itself, not the bot (spec 6.2, "Access
 * purpose"). Open enum: custom string values are permitted and consumers
 * MUST tolerate unknown values. Replaces v0.1's `bot_category`.
 */
export type AccessPurpose =
  | "training"
  | "inference"
  | "search"
  | "advertising"
  | (string & {});

/**
 * What a `content_presented` event made perceivable (spec 6.6):
 * source content itself (`content`) or a credit, link, card, or other
 * reference to the source (`source_reference`).
 */
export type PresentationKind = "content" | "source_reference";

/**
 * How a `content_presented` event made content or a source reference
 * perceivable (spec 6.6). Custom string values are permitted; consumers
 * MUST tolerate unknown values.
 */
export type PresentationType =
  | "link"
  | "snippet"
  | "inline_quote"
  | "card"
  | "detail_view"
  | "embed"
  | "spoken_credit"
  | (string & {});

/** Edge cache result for a retrieval event. */
export type CacheStatus = "hit" | "miss" | "bypass" | "dynamic";

// ---------------------------------------------------------------------------
// Data profiles (section 4 of the specification)
// ---------------------------------------------------------------------------

/**
 * Citation quality signals for `content_cited` events (spec 6.5).
 * Populate in the event's `data` field.
 */
export interface CitationData {
  /**
   * Required and schema-enforced in v1. Use `unclassified` rather than
   * omitting the field when the agent cannot classify the citation.
   */
  citation_type: CitationType;
  /** Token count of the excerpt used (agent-tokeniser units). */
  excerpt_tokens?: number;
  /**
   * Character count of the excerpt (Unicode code points). The portable
   * primary measurement; SHOULD accompany `excerpt_tokens` (spec 6.5).
   */
  excerpt_chars?: number;
  /** SHA-256 of the excerpt as produced in the response (`sha256:{hex}`). */
  excerpt_hash?: string;
  /** Prominence of the citation in the response. */
  position?: CitationPosition;
  /** SHA-256 hash matching the corresponding grounding event (`sha256:{hex}`). */
  content_hash?: string;
  /** Content medium: `text`, `image`, `video`, `audio`. Defaults to `text`. */
  media_type?: string;
  /** Whether the cited URL was verified to resolve to matching content. */
  url_verified?: boolean;
}

/**
 * Presentation data for `content_presented` events (spec 6.6).
 * Populate in the event's `data` field. Both fields below are required
 * and schema-enforced in v1.
 */
export interface PresentationData {
  /** What was made perceivable: content or a source reference. */
  presentation_kind: PresentationKind;
  /** How it was made perceivable. */
  presentation_type: PresentationType;
  /** Medium made perceivable: `text`, `image`, `video`, `audio`. Defaults to `text`. */
  media_type?: string;
}

/**
 * Edge enrichment data for `content_retrieved` events with `source_role: "edge"`.
 * CDN and edge network integrations SHOULD include these fields.
 * All fields are optional.
 */
export interface EdgeEnrichment {
  /** Request User-Agent header. */
  user_agent?: string;
  /** Classification of the access (spec 6.2). Replaces v0.1's `bot_category`. */
  purpose?: AccessPurpose;
  /** Whether the bot identity was cryptographically verified. */
  verified?: boolean;
  /** Edge cache result. */
  cache_status?: CacheStatus;
  /** HTTP response status code. */
  response_status?: number;
  /** Response body size in bytes. */
  response_bytes?: number;
  /** JA4 TLS client fingerprint. */
  ja4?: string;
  /** Client AS number. */
  asn?: number;
  /** Client AS organisation name. */
  asn_org?: string;
  /** ISO 3166-1 alpha-2 country code. */
  country?: string;
}

/**
 * Origin enrichment data for `content_retrieved` events with `source_role: "origin"`.
 * All fields are optional.
 */
export interface OriginEnrichment {
  /** Request User-Agent header. */
  user_agent?: string;
  /** Classification of the access (spec 6.2). */
  purpose?: AccessPurpose;
  /** HTTP response status code. */
  response_status?: number;
}

// ---------------------------------------------------------------------------
// Core models
// ---------------------------------------------------------------------------

/** Identity of the initiating agent (when initiator_type is "agent"). */
export interface Initiator {
  agentId?: string;
  manifestRef?: string;
  operatorId?: string;
}

/**
 * User context for segmentation and attribution.
 * Do not include PII — use hashed or synthetic identifiers.
 */
export interface UserContext {
  externalId?: string;
  segments?: string[];
  attributes?: Record<string, unknown>;
}

/**
 * Captured conversation turn with privacy controls.
 * Populate only the fields appropriate for your privacy level.
 */
export interface ConversationTurn {
  /** Required (spec 5.4). Fields above this level are stripped before sending. */
  privacyLevel: PrivacyLevel;
  // full / summary level
  queryText?: string;
  responseText?: string;
  // intent level
  queryIntent?: IntentCategory;
  responseType?: string;
  responseMode?: ResponseMode;
  topics?: string[];
  /** Whether advertising was displayed alongside the response (intent level and above). */
  adRendered?: boolean;
  // minimal level (always safe)
  contentUrlsRetrieved?: string[];
  contentUrlsCited?: string[];
  queryTokens?: number;
  responseTokens?: number;
  modelId?: string;
}

/** Single telemetry event within a session. */
export interface TelemetryEvent {
  /** Unique event identifier (UUID v4). Optional: the server generates one when absent (spec 5.2). */
  id?: string;
  type: EventType;
  /** UTC timestamp in ISO 8601 format. */
  timestamp: string;
  /** Who is reporting this event. Required on content_retrieved events. */
  sourceRole?: SourceRole;
  /** Associates this event with a conversation turn (spec 5.2.1). */
  turnId?: string;
  /** Correlation ID from Content-Telemetry-ID header for cross-observer deduplication. */
  contentTelemetryId?: string;
  /** Associated content URL, if applicable. */
  contentUrl?: string;
  /** Stable content identifier (CMS ID, DOI, ISCC, catalogue ID; spec 4.5). Every content event MUST carry contentUrl or contentId. */
  contentId?: string;
  /** Reference to the content access licence (spec 5.2.3). */
  licenseRef?: string;
  /** Governing terms reference; preserved unchanged on the wire (spec 5.2.4). */
  termsRef?: string;
  /**
   * Identifier of the output artifact this event concerns. Required on
   * `content_cited` and `content_presented` events (spec 6.5, 6.6).
   */
  outputId?: string;
  /** Stable identity of the cited or presented output element, when one exists. */
  outputElementId?: string;
  /**
   * On `content_presented` only: the `id` of the `content_cited` event this
   * presentation carries. Omit for uncited presentations (spec 6.6).
   */
  citationId?: string;
  /**
   * On `content_engaged` only: the `id` of the exact `content_presented`
   * event the action occurred on. Required on agent-reported engagements
   * (spec 6.7).
   */
  presentationId?: string;
  /**
   * On destination-reported `content_engaged` events only: the click-context
   * token carried across the redirect (spec 7.4). Mutually exclusive with
   * `presentationId` in practice - the destination cannot know the
   * presentation UUID.
   */
  ctxToken?: string;
  /** Associated product UUID, if applicable (OpenAttribution extension). */
  productId?: string;
  /** Conversation turn data for turn_started/turn_completed events. */
  turn?: ConversationTurn;
  /** Additional event-specific metadata. */
  data?: Record<string, unknown>;
}

/** Session outcome for attribution calculation. */
export interface SessionOutcome {
  type: OutcomeType;
  /** Monetary value in minor currency units (e.g. 4999 = $49.99). */
  valueAmount?: number;
  /** ISO 4217 currency code. Default: "USD". */
  currency?: string;
  /** Product UUIDs involved in the outcome. */
  products?: string[];
  metadata?: Record<string, unknown>;
}

/** Options for starting a new session. */
export interface StartSessionOptions {
  contentScope?: string;
  agentId?: string;
  externalSessionId?: string;
  userContext?: UserContext;
  manifestRef?: string;
  priorSessionIds?: string[];
  initiatorType?: InitiatorType;
  initiator?: Initiator;
}

/** Context shared by a standalone event or a batch (spec 7.1). */
export interface EventEnvelope {
  sessionId?: string;
  parentSessionId?: string;
  ctxToken?: string;
  agentId?: string;
  startedAt?: string;
  manifestRef?: string;
}

/** Complete telemetry session (for bulk upload). */
export interface TelemetrySession {
  /** Document discriminator; "session" on the wire (spec 7.1). */
  documentType?: "session";
  schemaVersion?: string;
  sessionId: string;
  parentSessionId?: string;
  /** Informational conformance level advertised by this emitter (spec 5.7). */
  conformanceLevel?: ConformanceLevel;
  initiatorType?: InitiatorType;
  initiator?: Initiator;
  agentId?: string;
  contentScope?: string;
  manifestRef?: string;
  priorSessionIds?: string[];
  startedAt: string;
  endedAt?: string;
  userContext?: UserContext;
  events: TelemetryEvent[];
  outcome?: SessionOutcome;
  /** Session-scoped extension metadata (spec 5.1.3). */
  data?: Record<string, unknown>;
}

/** Options for TelemetryClient. */
export interface TelemetryClientOptions {
  /** Base URL of a service supporting the OpenAttribution HTTP adapter routes. */
  endpoint: string;
  /** API key sent as X-API-Key header. */
  apiKey?: string;
  /**
   * If true, failed requests are swallowed rather than thrown (no logging).
   * Default: true.
   */
  failSilently?: boolean;
  /** Request timeout in milliseconds. Default: 30_000. */
  timeout?: number;
  /** Maximum retry attempts for transient errors. Default: 3. */
  maxRetries?: number;
  /**
   * Default `source_role` to stamp on every emitted event when the caller
   * does not set one explicitly. Agent SDKs should set this to `"agent"`,
   * CDN/edge integrations to `"edge"`, origin instrumentation to `"origin"`.
   *
   * Per-event `sourceRole` always wins when provided.
   */
  defaultSourceRole?: SourceRole;
}
