# TAPHOA debt-to-Chat delivery audit

Read AGENTS.md, README.md and applicable business contracts before changes. Inventory actual owner files for customer debt, receipt/payment, image generation, contact/Zalo mapping, outbound Chat request and delivery acknowledgement. Do not assume success from a click or HTTP request alone.

Test customer with linked and unlinked Chat/Zalo identity; permissions, payload amount/date, image quality, duplicate taps, retry/idempotency, expired session, offline and partial failures. Verify target identity and delivered content without sending real customer messages during tests. Preserve canonical Supabase financial records; never edit production balances to test. Repair one proven owner per patch, with regression tests and evidence.
