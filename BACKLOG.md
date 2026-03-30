# Backlog

Last updated: 2026-03-29

## Medium

- [ ] Decode remaining header fields (bytes 0x08–0x1B checksum algorithm).
- [ ] Decode remaining player numeric fields (110 bytes, only rating and FIDE ID
      mapped).
- [ ] Decode config section fully (dates, pairing system, tiebreak settings).
- [ ] Add `NPM_TOKEN` secret to GitHub repo and verify npm publish.

## Low

- [ ] Decode additional result codes beyond 1–5, 9.
- [ ] Support creating TUNX files from scratch (currently requires `_raw` from a
      parsed file).
