# Measured spatial replay

These JPEGs and `evidence.json` are an additional deterministic replay of the
controlled fixture, recorded through the browser at 1280 × 720. They are not
the historical screenshots from the original repair run.

The failure replay used the unchanged fixture. The successful replay used an
isolated temporary copy with exactly the original accepted
`repair-revision-diff.patch` applied. Its SHA-256 of LF-normalized text is recorded
as `patchSha256` in `evidence.json`, so Git's platform line-ending conversion
does not break verification. `capturedPatchSha256` preserves the exact-byte
checksum of the Windows file used when recording.
No model was called. The fixture in `fixtures/broken-shop` was not repaired.

For each replay, the actual Tab sequence was observed. Every focus target was
measured with `getBoundingClientRect` at the final capture's viewport and scroll
position. The failure escaped the dialog; the accepted patch wrapped forward
Tab to the first control and reverse Shift+Tab to the last control.

The demo adapter uses this supplementary evidence only when `sourceRunId`
matches the historical repair. Original source, patches, compiler diagnostics,
rejection, revision, and verification artifacts remain unchanged. Live scans
never consume this replay.
