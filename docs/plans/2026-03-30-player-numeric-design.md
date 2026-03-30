# Player Numeric Block Decoding Design

Date: 2026-03-30

## Goal

Decode remaining fields in the 110-byte player numeric block. Expose decoded
fields on the `Player` type, populate the existing `sex` field, and add new
fields for K-factor, national rating, and several tentatively-named fields.

## Background

Currently only 3 of 110 bytes are decoded: FIDE rating (0x08), national rating
(0x0A, used only as a fallback for `rating`), and FIDE ID (0x18). Hex analysis
of 3 fixture files identified 2 new high-confidence fields and 5
medium/low-confidence fields.

## Field Map (110 bytes)

| Offset | Size | Field             | Type  | Confidence | Notes                                     |
| ------ | ---- | ----------------- | ----- | ---------- | ----------------------------------------- |
| 0x00   | 6    | —                 | pad   | —          | Always 0                                  |
| 0x06   | 1    | sex               | U8    | High       | 1=female, 0=male/unset                    |
| 0x07   | 1    | —                 | pad   | —          | Always 0                                  |
| 0x08   | 2    | (FIDE rating)     | U16LE | Known      | Already decoded                           |
| 0x0A   | 2    | nationalRating    | U16LE | Known      | Exposed as separate field now             |
| 0x0C   | 2    | —                 | pad   | —          | Always 0                                  |
| 0x0E   | 2    | ratingDelta       | U16LE | Low        | Large varying values, purpose unclear     |
| 0x10   | 2    | ratingPeriod      | U16LE | Low        | Range 298–307, tournament-level parameter |
| 0x12   | 2    | categoryId        | U16LE | Low        | 13/14 in sample, 0 in elllobregat         |
| 0x14   | 2    | —                 | pad   | —          | Always 0                                  |
| 0x16   | 2    | registrationId    | U16LE | Low        | Player-specific, not pairing number       |
| 0x18   | 4    | (FIDE ID)         | U32LE | Known      | Already decoded                           |
| 0x1C   | 28   | —                 | pad   | —          | Mostly 0, rare non-zero not identified    |
| 0x38   | 2    | alphabeticalIndex | U16LE | Medium     | Tracks alphabetical order in parent event |
| 0x3A   | 2    | kFactor           | U16LE | High       | FIDE K-factor (0/10/20/40)                |
| 0x3C   | 50   | —                 | pad   | —          | Always 0                                  |

### Evidence

- **sex (0x06)**: In elllobregat, byte 0x06 = 1 for all 15 female players (WGM,
  WIM, WFM, WCM titles), 0 for all 195 males. Perfect correlation.
- **kFactor (0x3A)**: Values 10 (rating ≥ 2400), 20 (standard), 40 (new player),
  0 (unrated). Matches FIDE K-factor rules exactly.
- **alphabeticalIndex (0x38)**: Sorting players by this value produces roughly
  alphabetical order by surname. Gaps suggest indexing across multiple groups
  within a parent tournament.
- **nationalRating (0x0A)**: Already read but only used as fallback for
  `rating`. Now exposed as its own field.
- **ratingDelta (0x0E)**, **ratingPeriod (0x10)**, **categoryId (0x12)**,
  **registrationId (0x16)**: Low confidence. Named by best guess. Values vary
  but no definitive mapping to known data.

## Type Changes

Updated `Player` interface (new fields marked):

```typescript
interface Player {
  alphabeticalIndex?: number; // NEW
  birthYear?: number; // existing, still not populated
  categoryId?: number; // NEW
  club?: string;
  federation?: string;
  fideId?: number;
  firstName: string;
  group?: string;
  kFactor?: number; // NEW
  nationalId?: string;
  nationalRating?: number; // NEW (separate from rating)
  pairingNumber: number;
  rating?: number;
  ratingDelta?: number; // NEW
  ratingPeriod?: number; // NEW
  registrationId?: number; // NEW
  results: Result[];
  sex?: 'F' | 'M'; // existing, now populated from 0x06
  surname: string;
  title?: Title;
}
```

## Constants

New constants in `constants.ts`:

```typescript
const PLAYER_NUMERIC_OFFSET_ALPHABETICAL_INDEX = 0x38;
const PLAYER_NUMERIC_OFFSET_CATEGORY_ID = 0x12;
const PLAYER_NUMERIC_OFFSET_K_FACTOR = 0x3a;
const PLAYER_NUMERIC_OFFSET_RATING_DELTA = 0x0e;
const PLAYER_NUMERIC_OFFSET_RATING_PERIOD = 0x10;
const PLAYER_NUMERIC_OFFSET_REGISTRATION_ID = 0x16;
const PLAYER_NUMERIC_OFFSET_SEX = 0x06;
```

## Parse Changes

- Read U8 at 0x06: if 1 → `sex: 'F'`, else `undefined`
- Read U16LE at 0x0A: expose as `nationalRating` (non-zero only)
- Read U16LE at 0x0E, 0x10, 0x12, 0x16, 0x38: expose as optional fields
- Read U16LE at 0x3A: expose as `kFactor` (non-zero only)
- Keep existing `rating` logic (FIDE rating with national fallback)

## Stringify Changes

None. Round-trip fidelity maintained via `_raw.playerNumericBytes`.

## Testing

- Assert sex for known female players (elllobregat P40, P46)
- Assert kFactor for known players (elllobregat P1: K=10, P132: K=20)
- Assert nationalRating for sample P1 (1869)
- Assert alphabeticalIndex for a few players
- Existing round-trip tests verify byte-level fidelity

## AGENTS.md Updates

Update the player numeric block table in the TUNX Format Reference.

## BACKLOG.md Updates

Mark "Decode remaining player numeric fields" as complete with residual notes.
