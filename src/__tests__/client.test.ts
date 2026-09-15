import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { TelemetryClient } from "../client.js"
import type { ConversationTurn } from "../types.js"

// Fresh Response per call — a Response body can only be consumed once.
const fetchMock = vi.fn((_url: string, _init: RequestInit) =>
  Promise.resolve(new Response(JSON.stringify({}), { status: 200 })),
)

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const fullTurn = (privacyLevel: ConversationTurn["privacyLevel"]): ConversationTurn => ({
  privacyLevel,
  queryText: "what is the capital of France",
  responseText: "Paris",
  queryIntent: "question",
  topics: ["geography"],
  contentUrlsCited: ["https://example.com/paris"],
  queryTokens: 7,
})

async function sentTurn(turn: ConversationTurn): Promise<Record<string, unknown>> {
  const client = new TelemetryClient({ endpoint: "https://telemetry.test" })
  await client.recordEvent("session-1", "turn_completed", { turn })
  const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
  return body.events[0].turn
}

describe("session initiator on the wire", () => {
  it("omits initiator_type and initiator when the caller does not supply them", async () => {
    const client = new TelemetryClient({ endpoint: "https://telemetry.test" })
    await client.startSession({ contentScope: "my-mix" })
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
    expect("initiator_type" in body).toBe(false)
    expect("initiator" in body).toBe(false)
  })

  it("includes initiator_type and initiator when supplied", async () => {
    const client = new TelemetryClient({ endpoint: "https://telemetry.test" })
    await client.startSession({
      initiatorType: "agent",
      initiator: { agentId: "agent-1" },
    })
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
    expect(body.initiator_type).toBe("agent")
    expect(body.initiator).toEqual({ agent_id: "agent-1" })
  })
})

describe("event batch envelope on the wire", () => {
  it("posts events wrapped in an event_batch document (spec 7.1)", async () => {
    const client = new TelemetryClient({ endpoint: "https://telemetry.test" })
    await client.recordEvents("session-1", [
      {
        id: "evt-1",
        type: "content_retrieved",
        timestamp: "2026-06-11T00:00:00Z",
        contentUrl: "https://example.com/article",
      },
    ])
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe("https://telemetry.test/events")
    const body = JSON.parse(init.body as string)
    expect(body.document_type).toBe("event_batch")
    expect(body.schema_version).toBe("1.0")
    expect(body.session_id).toBe("session-1")
    expect(body.events).toHaveLength(1)
    expect(body.events[0].content_url).toBe("https://example.com/article")
  })
})

describe("v1 event fields on the wire", () => {
  it("maps output, citation and presentation identifiers to snake_case", async () => {
    const client = new TelemetryClient({ endpoint: "https://telemetry.test" })
    await client.recordEvents("session-1", [
      {
        id: "cite-1",
        type: "content_cited",
        timestamp: "2026-09-03T00:00:00Z",
        contentUrl: "https://example.com/article",
        outputId: "response:1",
        outputElementId: "answer:1",
        data: { citation_type: "reference" },
      },
      {
        id: "pres-1",
        type: "content_presented",
        timestamp: "2026-09-03T00:00:00Z",
        contentUrl: "https://example.com/article",
        outputId: "response:1",
        citationId: "cite-1",
        data: { presentation_kind: "source_reference", presentation_type: "link" },
      },
      {
        id: "eng-1",
        type: "content_engaged",
        timestamp: "2026-09-03T00:00:01Z",
        contentUrl: "https://example.com/article",
        presentationId: "pres-1",
        data: { engagement_type: "link_click" },
      },
    ])
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
    expect(body.events[0].output_id).toBe("response:1")
    expect(body.events[0].output_element_id).toBe("answer:1")
    expect(body.events[1].citation_id).toBe("cite-1")
    expect(body.events[2].presentation_id).toBe("pres-1")
  })

  it("recordEvent returns the event id it generated", async () => {
    const client = new TelemetryClient({ endpoint: "https://telemetry.test" })
    const id = await client.recordEvent("session-1", "content_presented", {
      contentUrl: "https://example.com/article",
      outputId: "response:1",
      data: { presentation_kind: "source_reference", presentation_type: "link" },
    })
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
    expect(id).toBeTruthy()
    expect(body.events[0].id).toBe(id)
  })
})

describe("standalone event envelope on the wire", () => {
  it("posts a document_type 'event' envelope with schema_version (spec 7.1)", async () => {
    const client = new TelemetryClient({
      endpoint: "https://telemetry.test",
      defaultSourceRole: "origin",
    })
    await client.recordStandaloneEvent({
      type: "content_retrieved",
      timestamp: "2026-09-03T00:00:00Z",
      contentUrl: "https://example.com/article",
      data: { user_agent: "GPTBot/1.0" },
    })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe("https://telemetry.test/events")
    const body = JSON.parse(init.body as string)
    expect(body.document_type).toBe("event")
    expect(body.schema_version).toBe("1.0")
    expect("session_id" in body).toBe(false)
    expect(body.event.type).toBe("content_retrieved")
    expect(body.event.source_role).toBe("origin")
  })

  it("carries envelope session context when supplied", async () => {
    const client = new TelemetryClient({ endpoint: "https://telemetry.test" })
    await client.recordStandaloneEvent(
      {
        type: "content_engaged",
        timestamp: "2026-09-03T00:00:00Z",
        contentUrl: "https://example.com/article",
        data: { engagement_type: "link_click" },
      },
      { ctxToken: "ct_abc123", agentId: "agent-1", startedAt: "2026-09-03T00:00:00Z" },
    )
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
    expect(body.ctx_token).toBe("ct_abc123")
    expect(body.agent_id).toBe("agent-1")
    expect(body.started_at).toBe("2026-09-03T00:00:00Z")
  })
})

describe("turn privacy gating on the wire", () => {
  it("includes text fields at full level", async () => {
    const wire = await sentTurn(fullTurn("full"))
    expect(wire.query_text).toBe("what is the capital of France")
    expect(wire.response_text).toBe("Paris")
    expect(wire.query_intent).toBe("question")
  })

  it("strips text but keeps intent fields at intent level", async () => {
    const wire = await sentTurn(fullTurn("intent"))
    expect(wire.query_text).toBeUndefined()
    expect(wire.response_text).toBeUndefined()
    expect(wire.query_intent).toBe("question")
    expect(wire.topics).toEqual(["geography"])
  })

  it("strips everything above minimal at minimal level", async () => {
    const wire = await sentTurn(fullTurn("minimal"))
    expect(wire.query_text).toBeUndefined()
    expect(wire.query_intent).toBeUndefined()
    expect(wire.topics).toBeUndefined()
    expect(wire.content_urls_cited).toEqual(["https://example.com/paris"])
    expect(wire.query_tokens).toBe(7)
  })

  it("fails closed to minimal when privacyLevel is absent (spec 5.4)", async () => {
    // Untyped JS callers can omit the field despite the required type.
    const turn = fullTurn("full") as unknown as Record<string, unknown>
    delete turn.privacyLevel
    const wire = await sentTurn(turn as unknown as ConversationTurn)
    expect(wire.query_text).toBeUndefined()
    expect(wire.response_text).toBeUndefined()
    expect(wire.query_intent).toBeUndefined()
    expect(wire.topics).toBeUndefined()
    expect(wire.content_urls_cited).toEqual(["https://example.com/paris"])
  })
})


describe("required reporting and envelope context", () => {
  it("surfaces failure when reporting is required", async () => {
    fetchMock.mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    const client = new TelemetryClient({ endpoint: "https://telemetry.test", failSilently: false, maxRetries: 0 })
    await expect(client.recordEvent("session-1", "content_retrieved", {
      sourceRole: "agent", contentUrl: "https://example.com/article",
    })).rejects.toThrow("503")
  })

  it("rejects a session response without an identifier in strict mode", async () => {
    const client = new TelemetryClient({ endpoint: "https://telemetry.test", failSilently: false })
    await expect(client.startSession()).rejects.toThrow("session_id")
  })

  it("accepts an empty successful event response without retrying", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    const client = new TelemetryClient({ endpoint: "https://telemetry.test", failSilently: false })
    await client.recordEvent("session-1", "content_retrieved", {
      sourceRole: "agent", contentUrl: "https://example.com/article",
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("carries agent identity, session start and terms into subsequent batches", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ session_id: "session-1" })))
    const client = new TelemetryClient({ endpoint: "https://telemetry.test", failSilently: false })
    const id = await client.startSession({ agentId: "agent:example" })
    await client.recordEvent(id, "content_retrieved", {
      sourceRole: "agent", contentUrl: "https://example.com/article", termsRef: "agreement:1",
      data: { "example:extension": { value: "preserved" } },
    })
    const body = JSON.parse(fetchMock.mock.calls[1]![1].body as string)
    expect(body.agent_id).toBe("agent:example")
    expect(body.started_at).toMatch(/^\d{4}-/)
    expect(body.events[0].terms_ref).toBe("agreement:1")
    expect(body.events[0].data).toEqual({ "example:extension": { value: "preserved" } })
  })
})
