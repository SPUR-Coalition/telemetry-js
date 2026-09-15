/**
 * @openattribution/telemetry
 *
 * TypeScript SDK for the Content Telemetry standard (TypeScript/JavaScript).
 * Track content attribution in AI agent interactions.
 *
 * Specification: https://contenttelemetry.org
 *
 * @example
 * ```ts
 * import { TelemetryClient, MCPSessionTracker, extractCitationUrls } from "@openattribution/telemetry";
 *
 * // Direct client usage
 * const client = new TelemetryClient({
 *   endpoint: "https://telemetry.example.com",
 *   apiKey: process.env.TELEMETRY_API_KEY,
 *   failSilently: false,
 *   defaultSourceRole: "agent",
 * });
 *
 * // MCP agent usage
 * const tracker = new MCPSessionTracker(client, "my-shopping-agent", { agentId: "my-shopping-agent" });
 * await tracker.trackRetrieved(sessionId, productUrls);
 *
 * // Extract citation URLs from AI response text
 * const urls = extractCitationUrls(assistantMessage);
 * await tracker.trackCited(sessionId, urls);
 * ```
 */

export { eventToWire, sessionToWire, standaloneEventToWire, eventBatchToWire } from "./wire.js";

export { TelemetryClient } from "./client.js";
export { MCPSessionTracker } from "./mcp.js";
export {
  extractCitationUrls,
  extractIndexedCitations,
  extractResultUrls,
  createTrackingUrl,
} from "./extract.js";
export { sessionToContentAttribution } from "./acp.js";
export { sessionToAttribution } from "./ucp.js";

export type {
  // Types
  TelemetryClientOptions,
  EventEnvelope,
  TelemetrySession,
  TelemetryEvent,
  SessionOutcome,
  StartSessionOptions,
  ConversationTurn,
  UserContext,
  Initiator,
  // Enumerations
  EventType,
  OutcomeType,
  PrivacyLevel,
  IntentCategory,
  InitiatorType,
  SourceRole,
  CitationType,
  CitationPosition,
  EngagementType,
  ConformanceLevel,
  ResponseMode,
  AccessPurpose,
  PresentationKind,
  PresentationType,
  CacheStatus,
  // Data profiles
  CitationData,
  PresentationData,
  EdgeEnrichment,
  OriginEnrichment,
} from "./types.js";

export type { ContentAttribution, ContentAttributionRetrieved, ContentAttributionCited } from "./acp.js";
export type { UCPAttribution } from "./ucp.js";
