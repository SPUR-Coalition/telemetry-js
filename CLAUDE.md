# CLAUDE.md

SPUR-maintained SDK (originally OpenAttribution) for the Content Telemetry standard, TypeScript/JavaScript - zero runtime dependencies.

## Tech stack

TypeScript, tsup (ESM + CJS dual output), vitest, no runtime dependencies. Node 20+, Deno, browsers, edge runtimes.

## Commands

```
npm run build       # tsup → dist/ (ESM .js + CJS .cjs + .d.ts)
npm test            # vitest run
npm run typecheck   # tsc --noEmit
npm run test:watch  # vitest in watch mode
```

## Repo structure

```
src/
  index.ts      # Public API surface, re-exports + type exports
  client.ts     # TelemetryClient - HTTP client with retry, timeout, OpenAttribution HTTP adapter
  wire.ts       # Standard document builders and privacy filtering
  types.ts      # All type definitions and string literal unions
  mcp.ts        # MCPSessionTracker - MCP agent convenience wrapper
  acp.ts        # ACP content attribution conversion
  ucp.ts        # UCP attribution conversion
  extract.ts    # Citation/URL extraction utilities
  __tests__/    # Test files
```

## Conventions

- Strict TypeScript, no `any`
- British English in prose and comments
- Zero runtime dependencies - native `fetch` only
- camelCase in TS, snake_case on the wire (see `*ToWire` helpers in wire.ts)
- `failSilently: true` by default - telemetry must never break the host application
