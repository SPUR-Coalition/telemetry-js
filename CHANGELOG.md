# Changelog

## 1.0.0 (unreleased)

Content Telemetry v1.0. Under the versioning policy below, 1.0.x implements [Content Telemetry 1.0](https://github.com/SPUR-Coalition/telemetry). Wire documents now declare `schema_version: "1.0"`; a v1 consumer rejects `"0.1"` documents and vice versa (spec 5.7.4), so upgrade the SDK and your consumer together.

Breaking, tracking the standard's v0.1 → v1 migration (spec 12.1):

- `content_displayed` → `content_presented`. Presentation events require `data.presentation_kind` (`content` | `source_reference`) and `data.presentation_type`; the old `display_type` field is gone. New `PresentationKind`, `PresentationType`, and `PresentationData` types.
- `content_cited` events require `id`, `output_id`, and `data.citation_type` (use `unclassified` rather than omitting). `CitationData.citation_type` is now required, and the interface gains `excerpt_chars`, `excerpt_hash`, `media_type`, and `url_verified` (spec 6.5).
- Agent-reported `content_engaged` events carry `presentation_id`, referencing the exact presentation acted on. New wire fields on `TelemetryEvent`: `outputId`, `outputElementId`, `citationId`, `presentationId`, `ctxToken` (destination-reported click-outs).
- Edge/origin retrieval profiles: `bot_category` → `purpose` (`AccessPurpose`, open enum, adds `advertising`; the `BotCategory` type is removed), and `ip_hash` is withdrawn (spec 9.1) — remove it from callers; the field is no longer typed and MUST NOT be populated.
- `TelemetryClient.recordEvent` now accepts the full event field set, always assigns an `id`, and returns it (previously `void`) so citation and presentation ids can be wired into later events.
- `MCPSessionTracker.trackCited` always emits `citation_type` and `output_id`, and returns a URL → citation-id map. New `trackPresented` returns a URL → presentation-id map; `trackEngaged` accepts `presentationIds` to bind clicks to presentations.

Added:

- Refresh development dependencies and their lockfile.
- SPUR repository stewardship; existing npm package name and Apache-2.0 attribution retained.
- Transport-independent builders for session, event and batch documents. OpenAttribution HTTP routes remain an optional adapter.
- `termsRef` preservation and envelope context including parent session and manifest references.
- Agent/session context on adapter batches; empty successful event responses supported; strict session start rejects a missing identifier.
- MCP engagements reject missing presentation references; failed session creation can be retried.
- Generated wire documents checked against a pinned standard revision using `test:wire`; examples await required reporting and distinguish local event ids from delivery receipts.

- `TelemetryClient.recordStandaloneEvent` — the standalone event envelope (spec 7.1) for session-less origin/edge retrievals and `ctx_token` click-out engagements, previously only possible with a hand-rolled POST.
- `TelemetrySession.data` — the session-scoped extension metadata container (spec 5.1.3).

## 0.1.3

Spec conformance fixes for `content_engaged`.

- Breaking: `trackEngaged` option `interactionType` → `engagementType`, emitted as `data.engagement_type` with the spec 6.7 values (`link_click`, `expand`, `copy`, `share`, `agent_navigate`, plus custom strings). The old `interaction_type` field and its `click`/`view` values were never in the standard, so consumers computing clickthrough from `engagement_type` saw nothing. There is no compatibility window - update callers passing `interactionType: "click"` to `engagementType: "link_click"`. A view without interaction is a `content_displayed` event, not an engagement.
- Export `EngagementType`, `ConformanceLevel`, and `ResponseMode` from the package root.
- Remove the vendored `schema.json`, which had drifted to the pre-standard OA-namespaced draft. The canonical schemas live in [SPUR-Coalition/telemetry](https://github.com/SPUR-Coalition/telemetry) and resolve at [contenttelemetry.org](https://contenttelemetry.org).
- Add CI (typecheck, tests, build).

## 0.1.2

Content Telemetry v0.1 alignment, and a version renumbering.

**Versioning policy:** from this release the SDK's major.minor tracks the version of the Content Telemetry standard it implements - 0.1.x implements [Content Telemetry 0.1](https://github.com/SPUR-Coalition/telemetry). 0.1.2 is the first release under this policy: 0.1.0 and 0.1.1 were consumed by early releases before the standard was published, and 0.2.0-0.4.0 predate the policy and remain on npm (their changes are included here).

- Events gain `turnId`, `contentId`, and `licenseRef` (spec 5.2); every content event must carry `contentUrl` or `contentId` (spec 5.7.5)
- `ConversationTurn` gains `responseMode` and `adRendered` (spec 5.4); wire serialisation enforces the privacy-level field gating (spec 5.5), so fields above the declared level never reach the wire
- `IntentCategory` carries the spec core set (spec 5.6); commerce values remain as documented extensions
- `CitationType` and `CitationPosition` gain `unclassified` (spec 6.5)
- New `ConformanceLevel` type; session documents can declare an informational `conformance_level` and emit `document_type: "session"` (spec 7.1)
- Event `id` is optional - the server generates one when absent (spec 5.2)

## 0.4.0

Breaking: rename correlation header and field to neutral name.

- HTTP header `OA-Telemetry-ID` → `Content-Telemetry-ID`
- Wire JSON field `oa_telemetry_id` → `content_telemetry_id`
- TypeScript field `oaTelemetryId` → `contentTelemetryId`

Migration: update any code passing `oaTelemetryId` to use `contentTelemetryId`. This is a hard rename with no compatibility window - the old name is no longer accepted.

## 0.3.1

Add `defaultSourceRole` option on `TelemetryClient`; `MCPSessionTracker` stamps `source_role=agent` by default.

## 0.3.0

Republish of 0.2.0 (which shipped with old singular session paths).

## 0.2.0

Pluralise session paths.

## 0.1.0

Initial release.
