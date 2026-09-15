import type {
  ConversationTurn, TelemetryEvent, Initiator, UserContext,
  SessionOutcome, TelemetrySession, EventEnvelope,
} from "./types.js";

/** Content Telemetry schema version emitted on wire documents (spec 7.1). */
const SCHEMA_VERSION = "1.0";

// ---------------------------------------------------------------------------
// Wire format helpers (camelCase → snake_case for the JSON body)
// ---------------------------------------------------------------------------

function turnToWire(turn: ConversationTurn): Record<string, unknown> {
  // An emitter MUST NOT include a field above the turn's declared
  // privacy_level (spec 5.5): query/response text is gated to full and
  // summary; intent, topics, response classification and platform
  // metadata are gated above minimal. Stripping here keeps a privacy
  // violation from ever reaching the wire. A missing level (possible
  // from untyped JS callers) fails closed to minimal.
  const level = turn.privacyLevel;
  const textAllowed = level === "full" || level === "summary";
  const aboveMinimal = textAllowed || level === "intent";
  return {
    // An absent or unrecognised level already strips as minimal above;
    // the wire value must follow, since privacy_level is required and
    // closed-enum on ConversationTurn.
    privacy_level: aboveMinimal || level === "minimal" ? level : "minimal",
    query_text: textAllowed ? turn.queryText : undefined,
    response_text: textAllowed ? turn.responseText : undefined,
    query_intent: aboveMinimal ? turn.queryIntent : undefined,
    response_type: aboveMinimal ? turn.responseType : undefined,
    response_mode: aboveMinimal ? turn.responseMode : undefined,
    topics: aboveMinimal ? turn.topics : undefined,
    ad_rendered: aboveMinimal ? turn.adRendered : undefined,
    content_urls_retrieved: turn.contentUrlsRetrieved,
    content_urls_cited: turn.contentUrlsCited,
    query_tokens: turn.queryTokens,
    response_tokens: turn.responseTokens,
    model_id: aboveMinimal ? turn.modelId : undefined,
  };
}

export function eventToWire(event: TelemetryEvent): Record<string, unknown> {
  return {
    id: event.id,
    type: event.type,
    timestamp: event.timestamp,
    source_role: event.sourceRole,
    turn_id: event.turnId,
    content_telemetry_id: event.contentTelemetryId,
    content_url: event.contentUrl,
    content_id: event.contentId,
    license_ref: event.licenseRef,
    terms_ref: event.termsRef,
    output_id: event.outputId,
    output_element_id: event.outputElementId,
    citation_id: event.citationId,
    presentation_id: event.presentationId,
    ctx_token: event.ctxToken,
    product_id: event.productId,
    turn: event.turn != null ? turnToWire(event.turn) : undefined,
    data: event.data ?? {},
  };
}

export function initiatorToWire(i: Initiator): Record<string, unknown> {
  return {
    agent_id: i.agentId,
    manifest_ref: i.manifestRef,
    operator_id: i.operatorId,
  };
}

export function userContextToWire(uc: UserContext): Record<string, unknown> {
  return {
    external_id: uc.externalId,
    segments: uc.segments ?? [],
    attributes: uc.attributes ?? {},
  };
}

export function outcomeToWire(o: SessionOutcome): Record<string, unknown> {
  return {
    type: o.type,
    value_amount: o.valueAmount ?? 0,
    currency: o.currency ?? "USD",
    products: o.products ?? [],
    metadata: o.metadata ?? {},
  };
}

export function sessionToWire(session: TelemetrySession): Record<string, unknown> {
  return {
    document_type: session.documentType ?? "session",
    schema_version: session.schemaVersion ?? SCHEMA_VERSION,
    session_id: session.sessionId,
    parent_session_id: session.parentSessionId,
    conformance_level: session.conformanceLevel,
    initiator_type: session.initiatorType,
    initiator:
      session.initiator != null ? initiatorToWire(session.initiator) : undefined,
    agent_id: session.agentId,
    content_scope: session.contentScope,
    manifest_ref: session.manifestRef,
    prior_session_ids: session.priorSessionIds ?? [],
    started_at: session.startedAt,
    ended_at: session.endedAt,
    user_context:
      session.userContext != null
        ? userContextToWire(session.userContext)
        : {},
    events: session.events.map(eventToWire),
    outcome:
      session.outcome != null ? outcomeToWire(session.outcome) : undefined,
    data: session.data,
  };
}

/** Shared standard envelope fields; no HTTP service binding is implied. */
function envelopeToWire(envelope: EventEnvelope): Record<string, unknown> {
  return {
    schema_version: SCHEMA_VERSION,
    session_id: envelope.sessionId,
    parent_session_id: envelope.parentSessionId,
    ctx_token: envelope.ctxToken,
    agent_id: envelope.agentId,
    started_at: envelope.startedAt,
    manifest_ref: envelope.manifestRef,
  };
}

/** Build a standard standalone event document for any agreed transport. */
export function standaloneEventToWire(
  event: TelemetryEvent,
  envelope: EventEnvelope = {},
): Record<string, unknown> {
  return { ...envelopeToWire(envelope), document_type: "event", event: eventToWire(event) };
}

/** Build a standard event batch; all events must share the envelope context. */
export function eventBatchToWire(
  events: TelemetryEvent[],
  envelope: EventEnvelope = {},
): Record<string, unknown> {
  return { ...envelopeToWire(envelope), document_type: "event_batch", events: events.map(eventToWire) };
}
