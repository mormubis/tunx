# Header Decoding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Decode the 108-byte TUNX header, exposing `tournamentId`, `savedAt`,
`installedAt`, `licenseHash`, and `installSignature` on a new `Header` interface
within `Tournament`.

**Architecture:** Add header field constants, a `Header` type, a date-parsing
helper, and extraction logic in `parse()`. No stringify changes — round-trip
fidelity is maintained via `_raw.headerBytes`. Tests assert decoded values
against known fixture data.

**Tech Stack:** TypeScript, Vitest, no new dependencies.

**Design doc:** `docs/plans/2026-03-30-header-decoding-design.md`

---

### Task 1: Add header constants

**Files:**

- Modify: `src/constants.ts`

**Step 1: Add the constants**

Add after the existing `METADATA_OFFSET` constant (line 17), before
`CONFIG_OFFSET_TOTAL_ROUNDS` (line 23):

```typescript
/** Byte offset inside the header for the license hash (20 bytes). */
const HEADER_INSTALL_SIGNATURE_OFFSET = 0x34;

/** Size of the install signature block in bytes. */
const HEADER_INSTALL_SIGNATURE_SIZE = 52;

/** Byte offset inside the header for the installed-at date (U32LE, YYYYMMDD). */
const HEADER_INSTALLED_AT_OFFSET = 0x30;

/** Byte offset inside the header for the license hash (20 bytes). */
const HEADER_LICENSE_HASH_OFFSET = 0x08;

/** Size of the license hash block in bytes. */
const HEADER_LICENSE_HASH_SIZE = 20;

/** Byte offset inside the header for the saved-at date (U32LE, YYYYMMDD). */
const HEADER_SAVED_AT_OFFSET = 0x1c;

/** Byte offset inside the header for the tournament ID (U32LE). */
const HEADER_TOURNAMENT_ID_OFFSET = 0x20;
```

Add to the export block (alphabetically):

```typescript
HEADER_INSTALL_SIGNATURE_OFFSET,
HEADER_INSTALL_SIGNATURE_SIZE,
HEADER_INSTALLED_AT_OFFSET,
HEADER_LICENSE_HASH_OFFSET,
HEADER_LICENSE_HASH_SIZE,
HEADER_SAVED_AT_OFFSET,
HEADER_TOURNAMENT_ID_OFFSET,
```

**Step 2: Run type check**

Run: `pnpm lint:types` Expected: PASS (no consumers yet)

**Step 3: Commit**

```
feat(constants): add header field offset constants
```

---

### Task 2: Add `Header` type and update `Tournament`

**Files:**

- Modify: `src/types.ts`
- Modify: `src/index.ts`

**Step 1: Add the `Header` interface**

Add after the `DateRange` interface (line 20) in `src/types.ts`:

```typescript
interface Header {
  /** High-entropy bytes 0x34–0x68, likely tied to SW license/installation. */
  installSignature: Uint8Array;
  /** Older date (offset 0x30), possibly SW installation date. */
  installedAt: Date;
  /** High-entropy bytes 0x08–0x1B, likely tied to SW license/installation. */
  licenseHash: Uint8Array;
  /** Date the file was last saved (offset 0x1C). */
  savedAt: Date;
  /** Chess-Results tournament ID (offset 0x20). */
  tournamentId: number;
}
```

**Step 2: Add `header` to `Tournament`**

Add `header: Header;` to the `Tournament` interface (alphabetically, between
`federation` and `name`):

```typescript
interface Tournament {
  _raw: RawTournament;
  arbiters: Arbiter[];
  city?: string;
  dates?: DateRange;
  federation?: string;
  header: Header;
  name: string;
  pairingSystem: PairingSystem;
  players: Player[];
  rounds: Round[];
  subtitle?: string;
  tiebreaks: Tiebreak[];
  timeControl?: string;
  venue?: string;
}
```

**Step 3: Export `Header` from `src/index.ts`**

Add `Header` to the type exports in `src/index.ts` (alphabetically).

**Step 4: Run type check**

Run: `pnpm lint:types` Expected: FAIL — `parse.ts` does not yet return `header`.
This is expected.

**Step 5: Commit**

```
feat(types): add Header interface to Tournament
```

---

### Task 3: Write failing tests for header decoding

**Files:**

- Modify: `src/__tests__/index.spec.ts`

**Step 1: Add header tests for `sample.TUNX`**

Inside the existing `describe('sample.TUNX', ...)` block (after the `_raw` test
around line 117), add:

```typescript
describe('header', () => {
  it('has the correct tournament ID', () => {
    expect(tournament?.header.tournamentId).toBe(1_378_181);
  });

  it('has a savedAt date of 2024-10-23', () => {
    const d = tournament?.header.savedAt;
    expect(d).toBeInstanceOf(Date);
    expect(d?.getFullYear()).toBe(2024);
    expect(d?.getMonth()).toBe(9); // 0-indexed
    expect(d?.getDate()).toBe(23);
  });

  it('has an installedAt date of 2011-01-15', () => {
    const d = tournament?.header.installedAt;
    expect(d).toBeInstanceOf(Date);
    expect(d?.getFullYear()).toBe(2011);
    expect(d?.getMonth()).toBe(0);
    expect(d?.getDate()).toBe(15);
  });

  it('has a 20-byte licenseHash', () => {
    expect(tournament?.header.licenseHash).toBeInstanceOf(Uint8Array);
    expect(tournament?.header.licenseHash).toHaveLength(20);
  });

  it('has a 52-byte installSignature', () => {
    expect(tournament?.header.installSignature).toBeInstanceOf(Uint8Array);
    expect(tournament?.header.installSignature).toHaveLength(52);
  });
});
```

**Step 2: Add header tests for `2023_elllobregat_a_753347.TUNX`**

Inside the existing `describe('2023_elllobregat_a_753347.TUNX', ...)` block,
add:

```typescript
describe('header', () => {
  it('has the correct tournament ID', () => {
    expect(tournament?.header.tournamentId).toBe(753_347);
  });

  it('has a savedAt date of 2025-03-19', () => {
    const d = tournament?.header.savedAt;
    expect(d).toBeInstanceOf(Date);
    expect(d?.getFullYear()).toBe(2025);
    expect(d?.getMonth()).toBe(2);
    expect(d?.getDate()).toBe(19);
  });

  it('has an installedAt date of 2007-09-30', () => {
    const d = tournament?.header.installedAt;
    expect(d).toBeInstanceOf(Date);
    expect(d?.getFullYear()).toBe(2007);
    expect(d?.getMonth()).toBe(8);
    expect(d?.getDate()).toBe(30);
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `pnpm test` Expected: FAIL — `tournament.header` is undefined.

**Step 4: Commit**

```
test: add failing tests for header field decoding
```

---

### Task 4: Implement header decoding in `parse()`

**Files:**

- Modify: `src/parse.ts`

**Step 1: Add imports**

Add the new constants to the import from `./constants.js`:

```typescript
HEADER_INSTALL_SIGNATURE_OFFSET,
HEADER_INSTALL_SIGNATURE_SIZE,
HEADER_INSTALLED_AT_OFFSET,
HEADER_LICENSE_HASH_OFFSET,
HEADER_LICENSE_HASH_SIZE,
HEADER_SAVED_AT_OFFSET,
HEADER_TOURNAMENT_ID_OFFSET,
```

Add `Header` to the type import from `./types.js`.

**Step 2: Add `parseDate` helper**

Add after the `toTitle` helper (around line 91):

```typescript
/** Convert a YYYYMMDD integer to a UTC Date. */
function parseDate(yyyymmdd: number): Date {
  const year = Math.floor(yyyymmdd / 10_000);
  const month = Math.floor((yyyymmdd % 10_000) / 100);
  const day = yyyymmdd % 100;

  return new Date(Date.UTC(year, month - 1, day));
}
```

**Step 3: Extract header fields**

After line 125 (`const headerBytes = input.slice(0, HEADER_SIZE);`), add:

```typescript
// ── 2b. Decode header fields ─────────────────────────────────────────────
const licenseHash = headerBytes.slice(
  HEADER_LICENSE_HASH_OFFSET,
  HEADER_LICENSE_HASH_OFFSET + HEADER_LICENSE_HASH_SIZE,
);
const savedAt = parseDate(view.getUint32(HEADER_SAVED_AT_OFFSET, true));
const tournamentId = view.getUint32(HEADER_TOURNAMENT_ID_OFFSET, true);
const installedAt = parseDate(view.getUint32(HEADER_INSTALLED_AT_OFFSET, true));
const installSignature = headerBytes.slice(
  HEADER_INSTALL_SIGNATURE_OFFSET,
  HEADER_INSTALL_SIGNATURE_OFFSET + HEADER_INSTALL_SIGNATURE_SIZE,
);

const header: Header = {
  installSignature,
  installedAt,
  licenseHash,
  savedAt,
  tournamentId,
};
```

**Step 4: Add `header` to the return object**

In the return statement (around line 486), add `header,` between `federation`
and `name` (alphabetically):

```typescript
return {
  _raw: raw,
  arbiters,
  city,
  federation,
  header,
  name,
  // ...rest
};
```

**Step 5: Run tests**

Run: `pnpm test` Expected: ALL PASS including the new header tests and existing
round-trip tests.

**Step 6: Run lint**

Run: `pnpm lint` Expected: PASS

**Step 7: Commit**

```
feat(parse): decode header fields (tournamentId, dates, license data)
```

---

### Task 5: Update documentation

**Files:**

- Modify: `AGENTS.md` — update Header section in TUNX Format Reference
- Modify: `BACKLOG.md` — mark item complete

**Step 1: Update AGENTS.md header table**

Replace the Header section (under `### Header (bytes 0x00–0x6B, 108 bytes)`)
with:

```markdown
### Header (bytes 0x00–0x6B, 108 bytes)

Fixed-size block at the start of every file. Starts with the 4-byte magic
`93 FF 89 44` (LE: `0x4489FF93`). The header is preserved verbatim for
round-trip fidelity.

| Offset | Size | Field         | Type  | Notes                                    |
| ------ | ---- | ------------- | ----- | ---------------------------------------- |
| 0x00   | 4    | Magic         | U32LE | `0x4489FF93`                             |
| 0x04   | 4    | (reserved)    | U32LE | Always 0 in known samples                |
| 0x08   | 20   | License hash  | bytes | High-entropy, identical per SW install   |
| 0x1C   | 4    | Saved-at date | U32LE | YYYYMMDD integer                         |
| 0x20   | 4    | Tournament ID | U32LE | Matches chess-results.com tournament IDs |
| 0x24   | 4    | (unknown)     | U32LE | Purpose undetermined                     |
| 0x28   | 8    | (reserved)    | —     | Always 0                                 |
| 0x30   | 4    | Installed-at  | U32LE | YYYYMMDD integer, likely SW install date |
| 0x34   | 52   | Install sig.  | bytes | High-entropy, identical per SW install   |
```

**Step 2: Update BACKLOG.md**

Replace the header decoding item with a completed note and add a residual item
for the still-unknown bytes:

```markdown
- [x] ~~Decode remaining header fields (bytes 0x08–0x1B checksum algorithm).~~
      Decoded: tournamentId, savedAt, installedAt, licenseHash,
      installSignature. Bytes 0x04, 0x24, 0x28–0x2F remain undetermined.
```

**Step 3: Commit**

```
docs: update header format reference and backlog
```

---

### Task 6: Final verification

**Step 1: Run full pre-PR check**

Run: `pnpm lint && pnpm test && pnpm build` Expected: ALL PASS

**Step 2: Verify round-trip fidelity**

Confirm the 3 existing round-trip tests still pass (they should from step 1).
