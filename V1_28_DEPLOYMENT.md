# TAPHOA V1.28

V1.28 builds deterministically from the GitHub V1.27 checkpoint already stored in `backups/v1.27/parts`.

- Source checkpoint SHA-256: `12d1cbe2dbf8f32507c8044329c52c5ab3b042b898af7c5481286931a047a983`
- V1.28 runtime bytes: `186726`
- V1.28 runtime SHA-256: `f64eaf795d07654a90b3736c988fb05c9d2e2f9df2bfa64173cdd93c5cf1e40a`
- Runtime logo: `src/assets/logo.jpg`
- Build output: `dist/`
- Build command: `node scripts/build-v128.mjs`

Changes from V1.27:
- shop logo is no longer embedded in HTML;
- favicon, Apple touch icon and web manifest use the existing logo asset;
- local photo avatar upload, `FileReader`, canvas/base64 image conversion and base64-avatar rendering are removed;
- avatar remains emoji or initials;
- Supabase Edge Function HTTPS endpoint is unchanged;
- business `api.call(...)` count remains 29, unchanged from V1.27;
- UI cache namespace is bumped from `v27` to `v28`.

The build fails closed if V1.27 source hash, V1.28 output hash/size, prohibited image-upload tokens, Supabase endpoint, or business API call count do not match the locked contract.
