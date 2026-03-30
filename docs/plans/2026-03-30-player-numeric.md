# Player Numeric Block Decoding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Decode remaining fields in the 110-byte player numeric block, exposing
sex, K-factor, national rating, and several tentatively-named fields on the
`Player` type.

**Architecture:** Add numeric block offset constants, new optional fields to the
`Player` interface, and extraction logic in `parse()`. No stringify changes —
round-trip fidelity maintained via `_raw.playerNumericBytes`. Tests assert
decoded values against known fixture data.

**Tech Stack:** TypeScript, Vitest, no new dependencies.

**Design doc:** `docs/plans/2026-03-30-player-numeric-design.md`

---

### Task 1: Add player numeric block constants

**Files:**

- Modify: `src/constants.ts`

**Step 1: Add the constants**

Add after the existing `PLAYER_NUMERIC_OFFSET_NATIONAL_RATING` constant (around
line 68), keeping alphabetical order among the PLAYER*NUMERIC_OFFSET*\* group:

```typescript
/** Byte offset inside the numeric block for the alphabetical sort index (U16LE). */
const PLAYER_NUMERIC_OFFSET_ALPHABETICAL_INDEX = 0x38;

/** Byte offset inside the numeric block for the category ID (U16LE). */
const PLAYER_NUMERIC_OFFSET_CATEGORY_ID = 0x12;

/** Byte offset inside the numeric block for the FIDE K-factor (U16LE). */
const PLAYER_NUMERIC_OFFSET_K_FACTOR = 0x3a;

/** Byte offset inside the numeric block for the rating delta (U16LE). */
const PLAYER_NUMERIC_OFFSET_RATING_DELTA = 0x0e;

/** Byte offset inside the numeric block for the rating period (U16LE). */
const PLAYER_NUMERIC_OFFSET_RATING_PERIOD = 0x10;

/** Byte offset inside the numeric block for the registration ID (U16LE). */
const PLAYER_NUMERIC_OFFSET_REGISTRATION_ID = 0x16;

/** Byte offset inside the numeric block for the sex flag (U8: 0=male, 1=female). */
const PLAYER_NUMERIC_OFFSET_SEX = 0x06;
```

Add to the export block alphabetically.

**Step 2: Run type check**

Run: `pnpm lint:types` Expected: PASS

**Step 3: Commit**

```
feat(constants): add player numeric block offset constants
```

---

### Task 2: Update Player type with new fields

**Files:**

- Modify: `src/types.ts`

**Step 1: Add new fields to the Player interface**

Update the `Player` interface. Insert new fields alphabetically:

```typescript
interface Player {
  alphabeticalIndex?: number;
  birthYear?: number;
  categoryId?: number;
  club?: string;
  federation?: string;
  fideId?: number;
  firstName: string;
  group?: string;
  kFactor?: number;
  nationalId?: string;
  nationalRating?: number;
  pairingNumber: number;
  rating?: number;
  ratingDelta?: number;
  ratingPeriod?: number;
  registrationId?: number;
  results: Result[];
  sex?: 'F' | 'M';
  surname: string;
  title?: Title;
}
```

New fields: `alphabeticalIndex`, `categoryId`, `kFactor`, `nationalRating`,
`ratingDelta`, `ratingPeriod`, `registrationId`. The `sex` and `birthYear`
fields already exist.

**Step 2: Run type check**

Run: `pnpm lint:types` Expected: PASS (or FAIL in parse.ts since we'll now
assign new fields — check)

**Step 3: Commit**

```
feat(types): add decoded player numeric fields to Player
```

---

### Task 3: Write tests for player numeric decoding

**Files:**

- Modify: `src/__tests__/index.spec.ts`

**Step 1: Add tests for sample.TUNX player fields**

Inside the existing `describe('player 1 (Aloisio)', ...)` block, add:

```typescript
it('has the correct national rating', () => {
  expect(player?.nationalRating).toBe(1869);
});

it('has kFactor 20', () => {
  expect(player?.kFactor).toBe(20);
});

it('has an alphabetical index', () => {
  expect(player?.alphabeticalIndex).toBe(3);
});
```

**Step 2: Add tests for elllobregat female player**

Inside the `describe('2023_elllobregat_a_753347.TUNX', ...)` block, add a new
sub-describe:

```typescript
describe('player 40 (Khademalsharieh)', () => {
  const player = tournament?.players[39];

  it('has sex F', () => {
    expect(player?.sex).toBe('F');
  });

  it('has kFactor 20', () => {
    expect(player?.kFactor).toBe(20);
  });
});

describe('player 1 (Fedoseev) numeric fields', () => {
  const player = tournament?.players[0];

  it('has kFactor 10', () => {
    expect(player?.kFactor).toBe(10);
  });

  it('does not have sex set (male = undefined)', () => {
    expect(player?.sex).toBeUndefined();
  });

  it('has nationalRating undefined (no national rating)', () => {
    expect(player?.nationalRating).toBeUndefined();
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `pnpm test` Expected: FAIL — new fields are undefined.

**Step 4: Commit**

```
test: add failing tests for player numeric field decoding
```

---

### Task 4: Implement player numeric decoding in parse()

**Files:**

- Modify: `src/parse.ts`

**Step 1: Add imports**

Add the new constants to the import from `./constants.js`:

```typescript
PLAYER_NUMERIC_OFFSET_ALPHABETICAL_INDEX,
PLAYER_NUMERIC_OFFSET_CATEGORY_ID,
PLAYER_NUMERIC_OFFSET_K_FACTOR,
PLAYER_NUMERIC_OFFSET_RATING_DELTA,
PLAYER_NUMERIC_OFFSET_RATING_PERIOD,
PLAYER_NUMERIC_OFFSET_REGISTRATION_ID,
PLAYER_NUMERIC_OFFSET_SEX,
```

Also import `PLAYER_NUMERIC_OFFSET_NATIONAL_RATING` (currently defined but not
imported — the code hardcodes `PLAYER_NUMERIC_OFFSET_FIDE_RATING + 2` instead).

**Step 2: Extract new fields**

In the player-building loop (around line 315 in the current code), after the
existing field extraction, add:

```typescript
const sexByte = numericBlock[PLAYER_NUMERIC_OFFSET_SEX];
const nationalRating = numericView.getUint16(
  PLAYER_NUMERIC_OFFSET_NATIONAL_RATING,
  true,
);
const ratingDelta = numericView.getUint16(
  PLAYER_NUMERIC_OFFSET_RATING_DELTA,
  true,
);
const ratingPeriod = numericView.getUint16(
  PLAYER_NUMERIC_OFFSET_RATING_PERIOD,
  true,
);
const categoryId = numericView.getUint16(
  PLAYER_NUMERIC_OFFSET_CATEGORY_ID,
  true,
);
const registrationId = numericView.getUint16(
  PLAYER_NUMERIC_OFFSET_REGISTRATION_ID,
  true,
);
const alphabeticalIndex = numericView.getUint16(
  PLAYER_NUMERIC_OFFSET_ALPHABETICAL_INDEX,
  true,
);
const kFactor = numericView.getUint16(PLAYER_NUMERIC_OFFSET_K_FACTOR, true);
```

**Step 3: Update the Player object construction**

Replace the existing national rating read (the `+ 2` hardcode) with the
constant-based read. Add new fields to the player object (alphabetically):

```typescript
const player: Player = {
  alphabeticalIndex: alphabeticalIndex > 0 ? alphabeticalIndex : undefined,
  categoryId: categoryId > 0 ? categoryId : undefined,
  club: nonEmpty(club),
  federation: nonEmpty(federation),
  fideId: fideId > 0 ? fideId : undefined,
  firstName,
  kFactor: kFactor > 0 ? kFactor : undefined,
  nationalId: nonEmpty(nationalId),
  nationalRating: nationalRating > 0 ? nationalRating : undefined,
  pairingNumber: index + 1,
  rating:
    fideRating > 0
      ? fideRating
      : nationalRating > 0
        ? nationalRating
        : undefined,
  ratingDelta: ratingDelta > 0 ? ratingDelta : undefined,
  ratingPeriod: ratingPeriod > 0 ? ratingPeriod : undefined,
  registrationId: registrationId > 0 ? registrationId : undefined,
  results: [],
  sex: sexByte === 1 ? 'F' : undefined,
  surname,
  title: toTitle(titleRaw),
};
```

**Step 4: Run tests**

Run: `pnpm test` Expected: ALL PASS

**Step 5: Run lint**

Run: `pnpm lint` Expected: PASS

**Step 6: Commit**

```
feat(parse): decode player numeric fields (sex, kFactor, nationalRating, etc.)
```

---

### Task 5: Update documentation

**Files:**

- Modify: `AGENTS.md`
- Modify: `BACKLOG.md`

**Step 1: Update AGENTS.md player numeric block table**

In the player section, update the numeric block table to show all decoded
fields:

```markdown
| Offset | Size  | Field              |
| ------ | ----- | ------------------ |
| 0x06   | U8    | Sex (0=M, 1=F)     |
| 0x08   | U16LE | FIDE rating        |
| 0x0A   | U16LE | National rating    |
| 0x0E   | U16LE | Rating delta       |
| 0x10   | U16LE | Rating period      |
| 0x12   | U16LE | Category ID        |
| 0x16   | U16LE | Registration ID    |
| 0x18   | U32LE | FIDE ID            |
| 0x38   | U16LE | Alphabetical index |
| 0x3A   | U16LE | K-factor           |
```

**Step 2: Update BACKLOG.md**

Mark "Decode remaining player numeric fields" as done:

```markdown
- [x] ~~Decode remaining player numeric fields (110 bytes, only rating and FIDE
      ID mapped).~~ Decoded: sex, nationalRating, kFactor, alphabeticalIndex,
      ratingDelta, ratingPeriod, categoryId, registrationId. ~70 bytes remain as
      zero-padding.
```

**Step 3: Commit**

```
docs: update player numeric format reference and backlog
```

---

### Task 6: Final verification

**Step 1: Run full pre-PR check**

Run: `pnpm lint && pnpm test && pnpm build` Expected: ALL PASS
