# Config Section Decoding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Decode tournament dates (start/end), round dates, and current round
from the config section, populating the existing empty `dates` and
`rounds[].date` fields on `Tournament`.

**Architecture:** Add config offset constants, extract dates and currentRound
from the config bytes in `parse()`, locate round blocks by scanning for date
patterns in the config data, and populate the existing `dates` and
`rounds[].date` fields. No stringify changes — round-trip maintained via
`_raw.configBytes`.

**Tech Stack:** TypeScript, Vitest, no new dependencies.

**Design doc:** `docs/plans/2026-03-30-config-section-design.md`

---

### Task 1: Add config section constants

**Files:**

- Modify: `src/constants.ts`

**Step 1: Add the constants**

Add after the existing `CONFIG_OFFSET_PLAYER_COUNT` constant, keeping
alphabetical order among the CONFIG*OFFSET*\* group:

```typescript
/** Offset from config data start to the tournament end date (U32LE, YYYYMMDD). */
const CONFIG_OFFSET_END_DATE = 0x4b;

/** Offset from config data start to the tournament start date (U32LE, YYYYMMDD). */
const CONFIG_OFFSET_START_DATE = 0x47;
```

Note: `CONFIG_OFFSET_CURRENT_ROUND` (0x11) and `CONFIG_OFFSET_TOTAL_ROUNDS`
(0x00) already exist. No new constants needed for those.

Add the new constants to the export block alphabetically.

**Step 2: Run type check**

Run: `pnpm lint:types` Expected: PASS

**Step 3: Commit**

```
feat(constants): add config section date offset constants
```

---

### Task 2: Add `currentRound` to Tournament type

**Files:**

- Modify: `src/types.ts`

**Step 1: Add `currentRound` to Tournament**

Add `currentRound: number;` to the `Tournament` interface between `city` and
`dates` (alphabetically):

```typescript
interface Tournament {
  _raw: RawTournament;
  arbiters: Arbiter[];
  city?: string;
  currentRound: number;
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

**Step 2: Run type check**

Run: `pnpm lint:types` Expected: FAIL — parse.ts doesn't return `currentRound`
yet.

**Step 3: Commit**

```
feat(types): add currentRound to Tournament
```

---

### Task 3: Write tests for config section decoding

**Files:**

- Modify: `src/__tests__/index.spec.ts`

**Step 1: Add tournament date and currentRound tests for sample.TUNX**

Inside the existing `describe('sample.TUNX', ...)` block, add:

```typescript
it('has currentRound 7', () => {
  expect(tournament?.currentRound).toBe(7);
});

it('has dates from 2026-03-28 to 2026-03-28', () => {
  expect(tournament?.dates).toEqual({
    end: '2026-03-28',
    start: '2026-03-28',
  });
});
```

**Step 2: Add round date tests for sample.TUNX**

Inside the existing `describe('sample.TUNX', ...)` block:

```typescript
it('has round 1 date of 2026-03-28', () => {
  expect(tournament?.rounds[0]?.date).toBe('2026-03-28');
});
```

**Step 3: Add tests for 2023_elllobregat_a_753347.TUNX**

Inside the existing `describe('2023_elllobregat_a_753347.TUNX', ...)` block:

```typescript
it('has currentRound 9', () => {
  expect(tournament?.currentRound).toBe(9);
});

it('has dates from 2023-11-30 to 2023-12-08', () => {
  expect(tournament?.dates).toEqual({
    end: '2023-12-08',
    start: '2023-11-30',
  });
});

it('has round 1 date of 2023-11-30', () => {
  expect(tournament?.rounds[0]?.date).toBe('2023-11-30');
});

it('has round 9 date of 2023-12-08', () => {
  expect(tournament?.rounds[8]?.date).toBe('2023-12-08');
});
```

**Step 4: Add test for abs_fem (in-progress tournament)**

Add a new describe block for abs_fem:

```typescript
describe('abs_fem_1378181.TUNX', () => {
  const data = fixture('abs_fem_1378181.TUNX');
  const tournament = parse(data);

  it('parses successfully', () => {
    expect(tournament).toBeDefined();
  });

  it('has currentRound 5', () => {
    expect(tournament?.currentRound).toBe(5);
  });
});
```

**Step 5: Run tests to verify they fail**

Run: `pnpm test` Expected: FAIL — `currentRound` and `dates` are missing.

**Step 6: Commit**

```
test: add failing tests for config section decoding
```

---

### Task 4: Implement config section decoding in parse()

**Files:**

- Modify: `src/parse.ts`

**Step 1: Add imports**

Add the new constants to the import from `./constants.js`:

```typescript
CONFIG_OFFSET_END_DATE,
CONFIG_OFFSET_START_DATE,
```

Also import `CONFIG_OFFSET_CURRENT_ROUND` (already defined but not imported).

**Step 2: Add `formatDate` helper**

Add after the existing `parseDate` helper:

```typescript
/** Format a YYYYMMDD integer as an ISO date string (YYYY-MM-DD). */
function formatDate(yyyymmdd: number): string | undefined {
  if (yyyymmdd === 0) {
    return undefined;
  }

  const year = Math.floor(yyyymmdd / 10_000);
  const month = Math.floor((yyyymmdd % 10_000) / 100);
  const day = yyyymmdd % 100;

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
```

**Step 3: Extract config dates and currentRound**

After the existing config field reads (totalRounds and playerCount), add:

```typescript
const currentRound = configView.getUint8(
  configDataOffset + CONFIG_OFFSET_CURRENT_ROUND,
);

const startDateRaw = configView.getUint32(
  configDataOffset + CONFIG_OFFSET_START_DATE,
  true,
);
const endDateRaw = configView.getUint32(
  configDataOffset + CONFIG_OFFSET_END_DATE,
  true,
);
const startDate = formatDate(startDateRaw);
const endDate = formatDate(endDateRaw);

const dates: DateRange | undefined =
  startDate !== undefined && endDate !== undefined
    ? { end: endDate, start: startDate }
    : undefined;
```

Import `DateRange` from `./types.js`.

**Step 4: Locate round blocks and extract round dates**

After the pairings are read and rounds are built (around step 8), add round date
extraction. The approach:

1. Scan the config bytes for the first YYYYMMDD date after offset 0x1000.
2. The date is at +9 within its round block.
3. Find the next date to compute block size.
4. Read each round's date.

```typescript
// ── 8b. Extract round dates from config section ────────────────────────
const configDataView = new DataView(
  configBytes.buffer,
  configBytes.byteOffset,
  configBytes.byteLength,
);

// Scan for first date in round block area (after offset 0x1000 from config data start)
let roundBlockDateOffset = -1;
const scanStart = configDataOffset + 0x1000;

for (let i = scanStart; i < configBytes.byteLength - 3; i++) {
  const val = configDataView.getUint32(i, true);
  if (val >= 20000101 && val <= 20991231) {
    const month = Math.floor((val % 10_000) / 100);
    const day = val % 100;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      roundBlockDateOffset = i;
      break;
    }
  }
}

if (roundBlockDateOffset !== -1 && totalRounds >= 2) {
  // Find second round date to compute block size
  let secondDateOffset = -1;
  for (let i = roundBlockDateOffset + 4; i < configBytes.byteLength - 3; i++) {
    const val = configDataView.getUint32(i, true);
    if (val >= 20000101 && val <= 20991231) {
      const month = Math.floor((val % 10_000) / 100);
      const day = val % 100;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        secondDateOffset = i;
        break;
      }
    }
  }

  if (secondDateOffset !== -1) {
    const blockSize = secondDateOffset - roundBlockDateOffset;

    for (let roundIndex = 0; roundIndex < totalRounds; roundIndex++) {
      const dateOffset = roundBlockDateOffset + roundIndex * blockSize;
      if (dateOffset + 4 <= configBytes.byteLength) {
        const dateVal = configDataView.getUint32(dateOffset, true);
        const dateStr = formatDate(dateVal);
        if (dateStr !== undefined && rounds[roundIndex] !== undefined) {
          rounds[roundIndex].date = dateStr;
        }
      }
    }
  }
} else if (roundBlockDateOffset !== -1 && totalRounds === 1) {
  // Single round — use the found date directly
  const dateVal = configDataView.getUint32(roundBlockDateOffset, true);
  const dateStr = formatDate(dateVal);
  if (dateStr !== undefined && rounds[0] !== undefined) {
    rounds[0].date = dateStr;
  }
}
```

**Step 5: Add `currentRound` and `dates` to the return object**

In the return statement, add `currentRound` and `dates` (alphabetically):

```typescript
return {
  _raw: raw,
  arbiters,
  city,
  currentRound,
  dates,
  federation,
  header,
  name,
  // ...rest
};
```

**Step 6: Run tests**

Run: `pnpm test` Expected: ALL PASS

**Step 7: Run lint**

Run: `pnpm lint` Expected: PASS

**Step 8: Commit**

```
feat(parse): decode config dates, round dates, and currentRound
```

---

### Task 5: Update documentation

**Files:**

- Modify: `AGENTS.md`
- Modify: `BACKLOG.md`

**Step 1: Update AGENTS.md config section**

Update the config section table to show the new decoded fields:

```markdown
| Offset | Size  | Field         |
| ------ | ----- | ------------- |
| 0x00   | U16LE | Total rounds  |
| 0x11   | U8    | Current round |
| 0x13   | U16LE | Player count  |
| 0x47   | U32LE | Start date    |
| 0x4B   | U32LE | End date      |
```

**Step 2: Update BACKLOG.md**

Mark "Decode config section fully" as partially done:

```markdown
- [x] ~~Decode config section fully (dates, pairing system, tiebreak
      settings).~~ Decoded: startDate, endDate, currentRound, round dates.
      Pairing system and tiebreak settings remain undetermined.
```

**Step 3: Commit**

```
docs: update config section format reference and backlog
```

---

### Task 6: Final verification

Run: `pnpm lint && pnpm test && pnpm build` Expected: ALL PASS
