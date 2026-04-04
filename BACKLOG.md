# Backlog

Last updated: 2026-04-04

## Done

- [x] ~~Decode remaining header fields.~~ Decoded: tournamentId, savedAt,
      installedAt, licenseHash, installSignature. Bytes 0x04, 0x24, 0x28–0x2F
      remain undetermined.
- [x] ~~Decode remaining player numeric fields.~~ Decoded: sex, nationalRating,
      kFactor, alphabeticalIndex, ratingDelta, ratingPeriod, categoryId,
      registrationId.
- [x] ~~Decode config section (dates, pairing system, tiebreak settings).~~
      Decoded: startDate, endDate, currentRound, round dates, tiebreaks. Pairing
      system field at config 0x15 not yet reliably mapped.
- [x] ~~Add NPM_TOKEN secret to GitHub repo.~~
- [x] ~~Decode additional result codes.~~ Added code 0 = unpaired.
- [x] ~~Support creating TUNX files from scratch.~~ Template-based
      `create(template, input)` function added.
- [x] ~~Decode tiebreak settings.~~ 9 tiebreak codes mapped from config
      0x1C–0x25.

## Medium

- [ ] Decode config 0x15 field (observed values 0–3 across 16 files, does not
      reliably map to pairing system despite initial hypothesis).
- [ ] Decode A3 sub-section per-round schedule records (round start times,
      scheduled dates, board counts).
- [ ] Decode D3 section offset table and use it for faster section lookup
      instead of linear byte-scan.

## Low

- [ ] Decode player numeric 0x20 (group/sub-category), 0x36 (team ID).
- [ ] Decode config middle section (~5700 bytes of mostly zeros with sparse data
      at 0x96, 0x280, 0x338, 0x4E5).
- [ ] Add Tiebreak types for Buchholz Cut 2 (`V`, 0x56) and Buchholz Cut 3 (`W`,
      0x57) which appear in some files.
- [ ] Decode header 0x24 (per-installation tournament counter).
