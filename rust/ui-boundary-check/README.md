# SPEC-TAPHOA-RUST-UI-PILOT-20261103 — isolated Rust proof of concept

GIVEN: TAPHOA uses JavaScript/HTML for its iPhone PWA. The canonical
`escapeProductEditorValue` and the strict `DG/DT + 1..12 digits` order
code check protect the HTML-rendered debt history.

WHEN: we explore Rust without risking the live app.

THEN: a dependency-free Rust library validates the same narrow rules,
with tests for malformed order IDs and dangerous HTML characters.

**MUST-STAY:** The actual HTML/CSS/JS implementation remains unchanged.
This crate is NOT loaded by browsers, WebAssembly, backend functions or the
production build; it never processes real customer data or performs writes.
No polling, network, Supabase, auth, finance or runtime change.

## Verify
```sh
cargo test --manifest-path rust/ui-boundary-check/Cargo.toml --offline
node --test tests/pwa-debt-history-html-safe-20261102.test.js
```

CI: `.github/workflows/rust-ui-pilot.yml`. Offline Rust compilation requires
no packages from crates.io.

Rollback: revert the pilot commit. The existing PWA stays unchanged.

## Next adoption gate
Only consider using this crate in production if we have a measured benefit,
byte-for-byte differential fixtures against JS, a documented WASM/toolchain
supply chain and fallback, full GitHub verification, and actual iPhone/PWA
testing. No one-pass rewrite of the entire application is approved.
