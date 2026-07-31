# Changelog

## Unreleased

### Added

- Capability-based `BrowserDriver`, `VeloraDriver` and experimental
  `ChromeCdpDriver`.
- Package entry points for `/driver`, `/agent`, `/cdp` and `/profile`.
- `page.velora` extension namespace and semantic snapshots.
- Document-generation validation for backend-node handles.
- Abort-aware timeout and WebSocket command handling.
- Public page console, error and network event subscriptions.
- Navigation results with response/frame/loader correlation.
- Deterministic agent tool sets and workflow execution.
- Runtime `AgentSession` with validated snapshot/click/fill/press actions.
- Stable error codes, retryability and operation metadata.
- CI and installed-package smoke testing.

### Fixed

- Paused requests no longer remain blocked when a route handler returns without
  a terminal action.
- `unroute()` disables Fetch and releases its listener.
- Timed-out event/network waits release their listeners.
- Browser, context and page close operations are idempotent.
- Runtime spawn failures reject the launch promise.
- Session event subscriptions are released on detach or close.
