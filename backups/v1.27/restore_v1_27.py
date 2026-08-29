from pathlib import Path
import base64
import gzip
import hashlib

ROOT = Path(__file__).resolve().parent
PARTS = ROOT / "parts"
OUTPUT = ROOT / "TAPHOA_SUPABASE_V1_27.html"
EXPECTED_SHA256 = "12d1cbe2dbf8f32507c8044329c52c5ab3b042b898af7c5481286931a047a983"
EXPECTED_BYTES = 199731

paths = sorted(PARTS.glob("TAPHOA_SUPABASE_V1_27.html.gz.b64.part*"))
if len(paths) != 12:
    raise SystemExit(f"Expected 12 parts, found {len(paths)}")

encoded = "".join(p.read_text(encoding="utf-8").strip() for p in paths)
raw = gzip.decompress(base64.b64decode(encoded))
sha = hashlib.sha256(raw).hexdigest()

if len(raw) != EXPECTED_BYTES:
    raise SystemExit(f"Byte-size mismatch: {len(raw)} != {EXPECTED_BYTES}")
if sha != EXPECTED_SHA256:
    raise SystemExit(f"SHA-256 mismatch: {sha} != {EXPECTED_SHA256}")

OUTPUT.write_bytes(raw)
print(f"RESTORE PASS: {OUTPUT.name} | {len(raw)} bytes | SHA-256 {sha}")
