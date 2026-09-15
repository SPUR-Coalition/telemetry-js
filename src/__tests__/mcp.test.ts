import { describe, it, expect, vi, beforeEach } from "vitest"
import { MCPSessionTracker } from "../mcp.js"
import type { TelemetryClient } from "../client.js"

const mockClient = {
  startSession: vi.fn().mockResolvedValue("session-uuid-123"),
  recordEvents: vi.fn().mockResolvedValue(undefined),
  recordEvent: vi.fn().mockResolvedValue(undefined),
  endSession: vi.fn().mockResolvedValue(undefined),
}

const tracker = () => new MCPSessionTracker(mockClient as unknown as TelemetryClient)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("MCPSessionTracker.getOrCreateSession", () => {
  it("calls startSession once for a new externalSessionId and returns the session ID", async () => {
    const t = tracker()
    const sessionId = await t.getOrCreateSession("user-abc")
    expect(mockClient.startSession).toHaveBeenCalledTimes(1)
    expect(sessionId).toBe("session-uuid-123")
  })

  it("reuses the cached session for the same externalSessionId", async () => {
    const t = tracker()
    const first = await t.getOrCreateSession("user-abc")
    const second = await t.getOrCreateSession("user-abc")
    expect(mockClient.startSession).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)
  })

  it("calls startSession each time when externalSessionId is undefined", async () => {
    const t = tracker()
    await t.getOrCreateSession(undefined)
    await t.getOrCreateSession(undefined)
    expect(mockClient.startSession).toHaveBeenCalledTimes(2)
  })
})

describe("MCPSessionTracker.trackRetrieved", () => {
  it("does nothing when urls is empty", async () => {
    const t = tracker()
    await t.trackRetrieved("user-abc", [])
    expect(mockClient.startSession).not.toHaveBeenCalled()
    expect(mockClient.recordEvents).not.toHaveBeenCalled()
  })

  it("calls recordEvents with content_retrieved events for each URL", async () => {
    const t = tracker()
    await t.trackRetrieved("user-abc", [
      "https://a.com",
      "https://b.com",
    ])
    expect(mockClient.recordEvents).toHaveBeenCalledTimes(1)
    const [sessionId, events] = mockClient.recordEvents.mock.calls[0]!
    expect(sessionId).toBe("session-uuid-123")
    expect(events).toHaveLength(2)
    expect(events[0].type).toBe("content_retrieved")
    expect(events[0].contentUrl).toBe("https://a.com")
    expect(events[1].contentUrl).toBe("https://b.com")
  })
})

describe("MCPSessionTracker.trackCited", () => {
  it("calls recordEvents with content_cited events for each URL", async () => {
    const t = tracker()
    await t.trackCited("user-abc", ["https://a.com"])
    expect(mockClient.recordEvents).toHaveBeenCalledTimes(1)
    const [, events] = mockClient.recordEvents.mock.calls[0]!
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe("content_cited")
    expect(events[0].contentUrl).toBe("https://a.com")
  })

  it("always carries id, outputId and citation_type per spec 6.5", async () => {
    const t = tracker()
    const ids = await t.trackCited("user-abc", ["https://a.com"])
    const [, events] = mockClient.recordEvents.mock.calls[0]!
    expect(events[0].id).toBeTruthy()
    expect(events[0].outputId).toMatch(/^response:/)
    expect(events[0].data.citation_type).toBe("unclassified")
    expect(ids).toEqual({ "https://a.com": events[0].id })
  })

  it("uses the supplied outputId and citationType", async () => {
    const t = tracker()
    await t.trackCited("user-abc", ["https://a.com"], {
      citationType: "reference",
      outputId: "response:42",
    })
    const [, events] = mockClient.recordEvents.mock.calls[0]!
    expect(events[0].outputId).toBe("response:42")
    expect(events[0].data.citation_type).toBe("reference")
  })
})

describe("MCPSessionTracker.trackPresented", () => {
  it("emits content_presented with required presentation data per spec 6.6", async () => {
    const t = tracker()
    const ids = await t.trackPresented("user-abc", ["https://a.com"], {
      citationIds: { "https://a.com": "cite-1" },
      outputId: "response:42",
    })
    const [, events] = mockClient.recordEvents.mock.calls[0]!
    expect(events[0].type).toBe("content_presented")
    expect(events[0].id).toBeTruthy()
    expect(events[0].outputId).toBe("response:42")
    expect(events[0].citationId).toBe("cite-1")
    expect(events[0].data).toEqual({
      presentation_kind: "source_reference",
      presentation_type: "link",
    })
    expect(ids).toEqual({ "https://a.com": events[0].id })
  })

  it("omits citationId for uncited presentations", async () => {
    const t = tracker()
    await t.trackPresented("user-abc", ["https://a.com"])
    const [, events] = mockClient.recordEvents.mock.calls[0]!
    expect("citationId" in events[0]).toBe(false)
  })
})

describe("MCPSessionTracker.trackEngaged", () => {
  it("emits content_engaged with data.engagement_type per spec 6.7", async () => {
    const t = tracker()
    await t.trackEngaged("user-abc", ["https://a.com"], {
      engagementType: "link_click",
      presentationIds: { "https://a.com": "pres-1" },
    })
    const [, events] = mockClient.recordEvents.mock.calls[0]!
    expect(events[0].type).toBe("content_engaged")
    expect(events[0].data).toEqual({ engagement_type: "link_click" })
  })

  it("omits engagement_type when no engagementType is given", async () => {
    const t = tracker()
    await t.trackEngaged("user-abc", ["https://a.com"], {
      presentationIds: { "https://a.com": "pres-1" },
    })
    const [, events] = mockClient.recordEvents.mock.calls[0]!
    expect(events[0].data).toEqual({})
  })

  it("binds the engagement to its presentation per spec 6.7", async () => {
    const t = tracker()
    await t.trackEngaged("user-abc", ["https://a.com"], {
      engagementType: "link_click",
      presentationIds: { "https://a.com": "pres-1" },
    })
    const [, events] = mockClient.recordEvents.mock.calls[0]!
    expect(events[0].presentationId).toBe("pres-1")
  })
})

describe("MCPSessionTracker.sessionCount", () => {
  it("returns the correct count after sessions are created", async () => {
    const t = tracker()
    expect(t.sessionCount).toBe(0)
    await t.getOrCreateSession("user-1")
    expect(t.sessionCount).toBe(1)
    await t.getOrCreateSession("user-2")
    expect(t.sessionCount).toBe(2)
    // Same ID — no new entry
    await t.getOrCreateSession("user-1")
    expect(t.sessionCount).toBe(2)
  })
})


describe("reporting failure handling", () => {
  it("rejects an unbound engagement before making a request", async () => {
    const t = tracker()
    await expect(t.trackEngaged("user-abc", ["https://a.com"]))
      .rejects.toThrow("Missing presentation id")
    expect(mockClient.startSession).not.toHaveBeenCalled()
    expect(mockClient.recordEvents).not.toHaveBeenCalled()
  })

  it("retries session creation after a silent failure", async () => {
    mockClient.startSession.mockResolvedValueOnce(null)
    const t = tracker()
    expect(await t.getOrCreateSession("user-abc")).toBeNull()
    expect(await t.getOrCreateSession("user-abc")).toBe("session-uuid-123")
    expect(mockClient.startSession).toHaveBeenCalledTimes(2)
  })
})
