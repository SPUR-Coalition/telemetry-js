# @openattribution/telemetry

TypeScript/JavaScript SDK for the [Content Telemetry](https://github.com/SPUR-Coalition/telemetry) standard — track content attribution in AI agent interactions.

SDK versions track the standard: 1.0.x targets Content Telemetry 1.0.

Works in Node.js >= 20, Deno, browsers, and Edge runtimes (Vercel, Cloudflare Workers). Zero runtime dependencies.

## Status and stewardship

The repository is maintained by SPUR, a technical standards organisation and
convener. Originally developed by OpenAttribution, it remains available under
Apache-2.0. The npm package name remains `@openattribution/telemetry` for continuity;
a repository transfer does not change package ownership or publish a new release.
This branch prepares 1.0.0; the published 0.1.x package targets the older standard.

SPUR convenes content market interoperability pilots: publishers, intermediaries
and agents test discovery, agreed access, use and reporting together. Participants
operate services and make their own commercial agreements. This SDK supplies
reporting tools; using it does not grant content access or accreditation.

## Build the v1 SDK

Until 1.0.0 is published, build this checkout:

```sh
npm ci
npm run build
npm pack
```

Install the resulting tarball in your application with `npm install /path/to/openattribution-telemetry-1.0.0.tgz`.

## First reporting integration

Choose the reporting destination and transport with the publisher. The standard
specifies documents, not a mandatory hosted service or HTTP session API. Use the
wire builders with any agreed transport:

```ts
import { standaloneEventToWire } from "@openattribution/telemetry";

// Run after an actual authorised retrieval. Keep this document/id for retries.
const report = standaloneEventToWire({
  id: crypto.randomUUID(),
  type: "content_retrieved",
  timestamp: new Date().toISOString(),
  sourceRole: "agent",
  contentUrl: "https://publisher.example/article",
  termsRef: "agreement:example:1", // reference agreed by the parties
});

// This example assumes the parties agreed a JSON POST transport and its auth.
const response = await fetch(publisherReportingEndpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: reportingAuth },
  body: JSON.stringify(report),
});
if (!response.ok) throw new Error(`Reporting failed: ${response.status}`);
```

`eventBatchToWire(events, envelope)` and `sessionToWire(session)` build the other
two document formats. Set `agentId`, `sessionId` and `startedAt` for Grounding and
Citation delivery; pass actual `sourceRole`, content identifiers and event-specific
fields. Builders serialise caller observations and filter turn fields to the
declared privacy level. They do not validate every requirement, generate summaries,
interpret licences, partition reports by publisher or maintain a durable queue.
Extensions and governing terms remain the caller's responsibility; including a
field does not establish permission to disclose it to a destination.

### OpenAttribution HTTP adapter

`TelemetryClient` supports the OpenAttribution `/sessions/start`, `/events`,
`/sessions/end` and `/sessions/bulk` routes with `X-API-Key` authentication.
Use it only with a service offering that API; these routes are not required by
the Content Telemetry standard. The endpoint is supplied by the application.

```ts
import { TelemetryClient } from "@openattribution/telemetry";

const client = new TelemetryClient({
  endpoint: "https://consumer.example",
  apiKey: process.env.TELEMETRY_API_KEY,
  failSilently: false, // expose failures when an engagement requires reporting
  defaultSourceRole: "agent",
});
const sessionId = await client.startSession({ agentId: "example-agent" });
await client.recordEvents(sessionId, [{
  id: crypto.randomUUID(),
  type: "content_retrieved",
  timestamp: new Date().toISOString(),
  contentUrl: "https://publisher.example/article",
  termsRef: "agreement:example:1",
}]);
await client.endSession(sessionId, { type: "browse" });
```

The client carries identity and start time from sessions it creates into subsequent
batches. For a session created elsewhere, provide that context as the third
argument to `recordEvents`. The adapter retries transient failures in memory.
`failSilently` still defaults to `true` for compatibility; set it to `false` and
await sends for required reporting. Returned event ids are local identifiers,
not delivery receipts. Applications must retain failed reports, retry with stable
ids, and follow the engagement's rules for further acquisition/use. A successful
HTTP response alone does not prove publisher access or complete reporting.

## MCP and agent host hooks

`MCPSessionTracker` maintains an in-process session registry keyed by your stable
conversation id. Call it from your tool and response hooks after observing the
relevant action. Anonymous calls create separate sessions. Distributed hosts
must manage continuity outside this in-memory tracker.

```ts
import { TelemetryClient, MCPSessionTracker } from "@openattribution/telemetry";

const client = new TelemetryClient({
  endpoint: "https://consumer.example", // supports the adapter API above
  apiKey: process.env.TELEMETRY_API_KEY,
  failSilently: false,
});
const tracker = new MCPSessionTracker(client, "example-integration", {
  agentId: "example-agent",
});

// In a tool hook, after receiving content:
await tracker.trackRetrieved(conversationId, retrievedUrls);
// In a response hook, after observing actual citations:
const citationIds = await tracker.trackCited(conversationId, citedUrls, {
  outputId: responseId,
  citationType: "reference",
});
```

Use the lower-level document builders or `recordEvents` when events need
per-item `termsRef`, `licenseRef`, content ids, correlation ids or extension data.
A citation helper does not establish that content was grounded, presented or
engaged with: record each event only where the host can observe it. Applications
also own report retention and publisher-specific routing.

## Optional commerce protocol bridges

These OpenAttribution extensions require a consumer that supports them. Commerce
events are outside the core event enum; the bridges do not implement content
licensing, payment or settlement.

### ACP checkout integration

```ts
import { sessionToContentAttribution } from "@openattribution/telemetry";

const attribution = sessionToContentAttribution(session);

await acpClient.createCheckout({
  cart: { ... },
  content_attribution: attribution,
});
```

### UCP checkout integration

```ts
import { sessionToAttribution } from "@openattribution/telemetry";

const attribution = sessionToAttribution(session);

await ucpClient.completeCheckout({
  order: { ... },
  extensions: {
    "org.openattribution.telemetry": attribution,
  },
});
```

## Tracking the full funnel

Engagements bind to the exact presentation the user acted on (spec 6.7):
`trackCited` and `trackPresented` return URL → event-id maps, and the
presentation map feeds `trackEngaged`.

```ts
await tracker.trackRetrieved(sessionId, productUrls);
const outputId = "response:42"; // the actual response being reported
const citationIds = await tracker.trackCited(sessionId, citedUrls, { citationType: "reference", outputId });
const presentationIds = await tracker.trackPresented(sessionId, citedUrls, {
  presentationType: "link",
  outputId,
  ...(citationIds != null && { citationIds }),
});
await tracker.trackEngaged(sessionId, [clickedUrl], {
  engagementType: "link_click",
  ...(presentationIds != null && { presentationIds }),
});
await tracker.trackCheckout(sessionId, { type: "completed", valueAmount: 4999, currency: "USD" });
```

## Click tracking

Keep the id returned by `trackPresented` with the exact rendered occurrence and
pass it in `presentationIds` when recording an engagement. The tracker rejects
an engagement without this reference. A URL alone cannot identify which of
several appearances was clicked. The URL-keyed helpers support one occurrence
per URL in a call; use `recordEvents` with explicit ids for repeated appearances.
A redirect must validate its destination and resolve an authenticated click
context before reporting; `createTrackingUrl` only constructs a URL.

For destination-side reporting using `ctx_token`, use `standaloneEventToWire`
or `recordStandaloneEvent` with the agreed token resolution service.

## Extraction utilities

```ts
import { extractCitationUrls, extractIndexedCitations, extractResultUrls } from "@openattribution/telemetry";

// Extract URLs from Markdown links and bare URLs
const urls = extractCitationUrls(assistantMessage);

// Resolve [n] citation markers
const sources = ["https://guardian.com/article-1", "https://guardian.com/article-2"];
const cited = extractIndexedCitations("The policy was announced [1].", sources);

// Extract URLs from search result objects
const resultUrls = extractResultUrls(searchResults);
```

## Verification

```sh
npm run typecheck
npm test
npm run build
```

The wire check script validates SDK-generated documents against Content Telemetry
v1 schemas and application rules. Use standard revision `a2c4fda390978dd40dca059d4e5cd36cbf1e4ac6`.
To run locally, check out that standard revision separately, install
`jsonschema[format-nongpl]` in your Python environment, then run
`CT_SPEC_DIR=/path/to/telemetry npm run test:wire` after building.
CI runs the unit tests, typecheck and build on Node 20 and 22. Run the wire check
separately when changing serialisation. These checks verify the exercised
documents, not service conformance or accreditation.

## Specification

The Content Telemetry standard is stewarded by the SPUR Coalition: [SPUR-Coalition/telemetry](https://github.com/SPUR-Coalition/telemetry). Schemas resolve at [contenttelemetry.org](https://contenttelemetry.org).

## Licence

Apache 2.0 — see [LICENSE](./LICENSE).
