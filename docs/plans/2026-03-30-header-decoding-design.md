# Header Decoding Design

Date: 2026-03-30

## Goal

Decode remaining header fields (bytes 0x00-0x6B) in the 108-byte TUNX header.
Expose decoded fields on the `Tournament` type and update `AGENTS.md` format
reference. Maintain round-trip fidelity via `_raw.headerBytes`.

## Background

Currently the header is treated as an opaque 108-byte block. Only the 4-byte
magic is validated; the rest is sliced and stored verbatim with no fields
extracted.

Hex analysis of 3 fixture files (2 from the same SwissManager installation, 1
from a different installation) revealed the following field layout.

## Header Field Map

| Offset | Size | Field            | Type        | Notes                                           |
| ------ | ---- | ---------------- | ----------- | ----------------------------------------------- |
| 0x00   | 4    | magic            | U32LE       | `0x4489FF93`, already validated                 |
| 0x04   | 4    | (reserved)       | U32LE       | Always 0 in samples, possibly format version    |
| 0x08   | 20   | licenseHash      | Uint8Array  | High-entropy, identical per SW install          |
| 0x1C   | 4    | savedAt          | U32LE->Date | YYYYMMDD integer, e.g. `20241023`               |
| 0x20   | 4    | tournamentId     | U32LE       | Matches chess-results.com tournament IDs        |
| 0x24   | 4    | (unknown)        | U32LE       | `1549`/`754` in samples, purpose undetermined   |
| 0x28   | 8    | (reserved)       | -           | Always 0                                        |
| 0x30   | 4    | installedAt      | U32LE->Date | YYYYMMDD integer, older date, likely SW install |
| 0x34   | 52   | installSignature | Uint8Array  | High-entropy, identical per SW install          |

### Evidence

- **tournamentId (0x20)**: Values `1378181` and `753347` match chess-results.com
  URLs (`tnr1378181.aspx`, `tnr753347.aspx`) exactly.
- **savedAt (0x1C)**: Values `20241023` (Oct 23, 2024) and `20250319` (Mar
  19, 2025) are plausible "last saved" dates.
- **installedAt (0x30)**: Values `20110115` (Jan 15, 2011) and `20070930` (Sep
  30, 2007) are older dates, consistent with software installation timestamps.
- **licenseHash (0x08-0x1B)** and **installSignature (0x34-0x68)**: Identical
  between `sample.TUNX` and `abs_fem_1378181.TUNX` (same chess-results creator),
  different for `2023_elllobregat_a_753347.TUNX` (different creator). Likely
  tied to the SwissManager license/registration.

## Type Changes

New interface:

```typescript
interface Header {
  /** High-entropy bytes 0x34-0x68, likely tied to SW license/installation. */
  installSignature: Uint8Array;
  /** Older date (offset 0x30), possibly SW installation date. */
  installedAt: Date;
  /** High-entropy bytes 0x08-0x1B, likely tied to SW license/installation. */
  licenseHash: Uint8Array;
  /** Date the file was last saved (offset 0x1C). */
  savedAt: Date;
  /** Chess-Results tournament ID (offset 0x20). */
  tournamentId: number;
}
```

Added to `Tournament`:

```typescript
interface Tournament {
  // ... existing fields ...
  header: Header;
}
```

Fields sorted alphabetically per project convention.

## Parse Changes

After slicing `headerBytes`, extract fields using `DataView`:

- `savedAt`: read U32LE at 0x1C, convert YYYYMMDD integer to `Date`
- `tournamentId`: read U32LE at 0x20
- `installedAt`: read U32LE at 0x30, convert YYYYMMDD integer to `Date`
- `licenseHash`: slice bytes 0x08-0x1C (20 bytes)
- `installSignature`: slice bytes 0x34-0x68 (52 bytes)

Add helper: `parseDate(yyyymmdd: number): Date`

## Stringify Changes

No stringify changes needed. The header is written from `_raw.headerBytes`
verbatim, maintaining round-trip fidelity. The decoded `header` fields are
read-only views into the raw bytes.

## Testing

- Assert decoded `header` fields for each fixture file
- Confirm round-trip fidelity is preserved (existing tests cover this)

## Constants

Add to `constants.ts`:

```typescript
const HEADER_SAVED_AT_OFFSET = 0x1c;
const HEADER_TOURNAMENT_ID_OFFSET = 0x20;
const HEADER_INSTALLED_AT_OFFSET = 0x30;
const HEADER_LICENSE_HASH_OFFSET = 0x08;
const HEADER_LICENSE_HASH_SIZE = 20;
const HEADER_INSTALL_SIGNATURE_OFFSET = 0x34;
const HEADER_INSTALL_SIGNATURE_SIZE = 52;
```

## AGENTS.md Updates

Update the Header section in the TUNX Format Reference to include the decoded
field table.

## Backlog Updates

Mark "Decode remaining header fields" as complete. Update the description to
note that bytes 0x04, 0x24, and 0x28-0x2F remain undetermined.
