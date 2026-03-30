# Config Section Decoding Design

Date: 2026-03-30

## Goal

Decode tournament dates (start/end), round dates, and current round from the
config section. Populate the existing `Tournament.dates` and `Round[].date`
fields which are currently always empty.

## Background

The config section starts with the 4-byte marker `95 FF 89 44` and extends to
the player section marker. It contains ~6600-6900 bytes but only 3 fields are
currently decoded: totalRounds (0x00), currentRound (0x11, defined but unused),
and playerCount (0x13).

## Config Header Fields

Offsets relative to config data (after 4-byte marker):

| Offset | Size  | Field        | Confidence | Notes                           |
| ------ | ----- | ------------ | ---------- | ------------------------------- |
| 0x00   | U16LE | totalRounds  | Known      | Already decoded                 |
| 0x11   | U8    | currentRound | Known      | Defined but unused — expose now |
| 0x13   | U16LE | playerCount  | Known      | Already decoded                 |
| 0x47   | U32LE | startDate    | High       | Tournament start (YYYYMMDD)     |
| 0x4B   | U32LE | endDate      | High       | Tournament end (YYYYMMDD)       |

### Evidence

- **startDate (0x47)**: sample=20260328 (Mar 28), elllob=20231130 (Nov 30).
  Elllobregat ran Nov 30 - Dec 8, 2023 per chess-results.com.
- **endDate (0x4B)**: sample=20260328, elllob=20231208. Matches exactly.
- **currentRound (0x11)**: sample=7 (complete, 7/7), abs_fem=5 (in-progress,
  5/7), elllob=9 (complete, 9/9). Verified via comparison of two snapshots of
  the same tournament.

## Round Blocks

Round-specific data is stored in repeating blocks deep in the config section.
Each block contains a date at offset +0x09 (U32LE, YYYYMMDD).

The round block section starts at a varying offset depending on the config size.
Locating it requires scanning for the first date pattern after offset 0x1000.

Block sizes vary with tournament size:

- 7-round tournament: 108-byte blocks
- 9-round tournament: 118-byte blocks

### Evidence

- Elllobregat round dates: Nov 30, Dec 1, 2, 3, 4, 5, 6, 7, 8 — matches a
  9-round, 9-day schedule.
- Sample round dates: all Mar 28 — one-day event with 7 rounds.

## Type Changes

Add `currentRound` to `Tournament`:

```typescript
interface Tournament {
  // ...existing fields...
  currentRound: number; // NEW — between dates and federation alphabetically
}
```

Populate existing fields:

- `Tournament.dates` — `{ start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }`
- `Round[].date` — `'YYYY-MM-DD'` per round

## Parse Changes

1. Read startDate (U32LE at config offset 0x47) and endDate (0x4B).
2. Convert to ISO date strings and populate `Tournament.dates`.
3. Read currentRound (U8 at config offset 0x11) — already defined as constant.
4. Locate the round block section by scanning for the first YYYYMMDD date after
   config offset 0x1000.
5. Calculate block size as `(secondDateOffset - firstDateOffset)`.
6. Read each round's date from `blockStart + roundIndex * blockSize + 9`.
7. Populate `Round[].date`.

## Stringify Changes

None. Round-trip fidelity maintained via `_raw.configBytes`.

## What's NOT Decoded (deferred)

- `pairingSystem` — remains hardcoded to `'dutch'`
- `tiebreaks` — remains `[]`
- Config flags at 0x58-0x6C — unknown mapping
- Round time strings — adds complexity, lower priority
- `createdAt` (0x0D) and `ratingListDate` (0x52) — medium confidence

## Testing

- Assert `dates` for each fixture: sample start=end=2026-03-28, elllob
  start=2023-11-30 end=2023-12-08.
- Assert `currentRound` for each fixture.
- Assert round dates for selected rounds.
- Existing round-trip tests verify byte-level fidelity.
