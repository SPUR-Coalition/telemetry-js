// Exercise the built public API. These are synthetic examples, not service claims.
import { randomUUID } from 'node:crypto';
import {
  TelemetryClient, MCPSessionTracker,
  sessionToWire, standaloneEventToWire, eventBatchToWire,
} from '../dist/index.js';

const sessionId = randomUUID();
const startedAt = '2026-09-15T12:00:00Z';
const agentId = 'example-agent';
const contentUrl = 'https://publisher.example/article';
const termsRef = 'agreement:example:1';
const envelope = { sessionId, agentId, startedAt };
const retrieved = {
  id: randomUUID(), type: 'content_retrieved', timestamp: startedAt,
  sourceRole: 'agent', contentUrl, termsRef, licenseRef: 'grant:example',
  data: { 'example:receipt': { id: 'receipt:1' } },
};
const docs = {
  standalone: standaloneEventToWire(retrieved, envelope),
  batch: eventBatchToWire([retrieved], envelope),
  session: sessionToWire({ ...envelope, events: [retrieved] }),
};

// Capture the actual adapter requests, including the MCP convenience lifecycle.
const batches = [];
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  if (url.endsWith('/sessions/start')) {
    return new Response(JSON.stringify({ session_id: sessionId }));
  }
  if (url.endsWith('/events')) batches.push(body);
  else if (url.endsWith('/sessions/bulk')) docs.upload = body;
  return new Response(JSON.stringify({ session_id: sessionId }));
};
const client = new TelemetryClient({
  endpoint: 'https://consumer.example', failSilently: false, defaultSourceRole: 'agent',
});
const tracker = new MCPSessionTracker(client, 'example', { agentId });
await tracker.trackRetrieved('conversation:1', [contentUrl]);
const citationIds = await tracker.trackCited('conversation:1', [contentUrl], { outputId: 'response:1' });
const presentationIds = await tracker.trackPresented('conversation:1', [contentUrl], {
  outputId: 'response:1', citationIds,
});
await tracker.trackEngaged('conversation:1', [contentUrl], {
  engagementType: 'link_click', presentationIds,
});
await client.recordStandaloneEvent(retrieved, envelope);
await client.uploadSession({
  ...envelope,
  events: [retrieved, {
    id: randomUUID(), type: 'turn_completed', timestamp: startedAt,
    turn: { privacyLevel: 'minimal', queryText: 'must not leave emitter', queryTokens: 6 },
  }],
});
batches.forEach((batch, i) => { docs[`request-${i}`] = batch; });
docs.lifecycle = sessionToWire({
  ...envelope,
  events: [],
});
// Validate the same wire events together to check cross-event references too.
docs.lifecycle.events = batches.filter(b => b.document_type === 'event_batch').flatMap(b => b.events);
process.stdout.write(JSON.stringify(docs));
