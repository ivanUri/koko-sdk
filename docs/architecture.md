# SDK architecture and regression contract

This document describes the public boundary between `koko-sdk` and the Koko
engine. The engine owns browser execution and resource enforcement; the SDK
owns the typed client lifecycle and developer ergonomics.

## Runtime layers

```text
WebSocketTransport
  -> CDPClient / CDPSession
    -> Browser
      -> BrowserContext (logical grouping)
        -> Page / Frame / Locator
          -> KokoClient (`Koko.*` CDP domain)
```

`Browser`, `Page`, `CDPClient`, `KokoClient`, `launchKoko`, and the fetch/profile
helpers are public API. Internal modules may change without being considered a
compatible API surface.

## Context isolation contract

`BrowserContext` is a useful SDK grouping for pages, init scripts, cookies and
storage snapshots. It is **not** a process or browser-profile isolation
boundary. A single `koko serve` connection currently has one underlying CDP
browser context, and settings such as user agent, locale, timezone,
geolocation, permissions and extra headers can be connection-wide.

For independent identities, use an independent `Browser.connect()` or
`Browser.launch()` connection per identity. Do not assume that two
`browser.newContext()` calls on the same `Browser` provide tenant isolation.

## Lifecycle contract

- `Page.close()`, `BrowserContext.close()` and `Browser.close()` are idempotent.
- Concurrent close calls must share one terminal cleanup path.
- A closed page is removed from its context/browser bookkeeping.
- A closed context is released from its browser bookkeeping.
- A launch failure must reject and clean up the spawned process rather than
  leaving a pending launch promise.

## Engine option contract

`toEngineArgs()` renders the supported `EngineCommonOptions` in a stable order.
It must omit unset/empty/false values, preserve numeric zero, join list-valued
flags using the engine's expected delimiter, and reject mutually exclusive
user-agent options before spawning a process. Launch-only options such as the
CDP port are rendered by the launcher, not by `toEngineArgs()`.

Resource ceilings, worker recycling and process-level admission remain engine
responsibilities. `KokoPool` configures those policies and schedules work across
independent Koko processes, while process-exit monitoring replaces dead workers.
The SDK must not reimplement RSS/VMS sampling in the client.

## Regression coverage

The architecture regression tests cover:

- stable `toEngineArgs()` rendering and validation;
- idempotent Browser and BrowserContext shutdown;
- independent page bookkeeping for logical contexts;
- preservation of the BrowserContext isolation warning;
- launch rollback for child-process readiness failure;
- pool worker replacement after process exit and lifetime recycle;
- primary runtime exports and package subpath exports.

The tests are deliberately independent of a live Koko process, so they can run
in CI on every SDK change.
