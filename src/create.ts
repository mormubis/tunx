import {
  BYE_PLAYER_NUMBER,
  CONFIG_OFFSET_CURRENT_ROUND,
  CONFIG_OFFSET_END_DATE,
  CONFIG_OFFSET_PLAYER_COUNT,
  CONFIG_OFFSET_START_DATE,
  CONFIG_OFFSET_TOTAL_ROUNDS,
  METADATA,
  PAIRING_RECORD_SIZE,
  PLAYER_NUMERIC_BLOCK_SIZE,
  PLAYER_NUMERIC_OFFSET_FIDE_ID,
  PLAYER_NUMERIC_OFFSET_FIDE_RATING,
  PLAYER_NUMERIC_OFFSET_K_FACTOR,
  PLAYER_NUMERIC_OFFSET_NATIONAL_RATING,
  PLAYER_NUMERIC_OFFSET_SEX,
  PLAYER_STRINGS,
  PLAYER_STRING_COUNT,
  RESULT_CODE,
} from './constants.js';

import type {
  CreateInput,
  CreatePlayer,
  CreateRound,
  RawTournament,
  ResultCode,
  Tournament,
} from './types.js';

/** Compute points earned from a ResultCode. */
function pointsFromResult(code: ResultCode): number {
  switch (code) {
    case '1':
    case '+':
    case 'W': {
      return 1;
    }
    case '=':
    case 'H':
    case 'D': {
      return 0.5;
    }
    default: {
      return 0;
    }
  }
}

/** Map a ResultCode (from white's perspective) to a TUNX binary result code. */
function resultCodeToTunx(code: ResultCode): number {
  switch (code) {
    case 'Z': {
      return RESULT_CODE.UNPAIRED;
    }
    case '1': {
      return RESULT_CODE.WHITE_WINS;
    }
    case '=': {
      return RESULT_CODE.DRAW;
    }
    case '0': {
      return RESULT_CODE.BLACK_WINS;
    }
    case '+': {
      return RESULT_CODE.WHITE_WINS_FORFEIT;
    }
    case '-': {
      return RESULT_CODE.BLACK_WINS_FORFEIT;
    }
    case 'F': {
      return RESULT_CODE.UNPLAYED;
    }
    case 'H': {
      return 7;
    }
    default: {
      return RESULT_CODE.UNPAIRED;
    }
  }
}

/** Parse a YYYY-MM-DD string into a YYYYMMDD integer. */
function dateToYYYYMMDD(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return (year ?? 0) * 10_000 + (month ?? 0) * 100 + (day ?? 0);
}

/** Build the metadata string array from CreateInput fields. */
function buildMetadataStrings(
  template: string[],
  input: CreateInput,
): string[] {
  const strings = [...template];

  strings[METADATA.NAME] = input.name;
  strings[METADATA.SUBTITLE_SHORT] = input.subtitle ?? '';
  strings[METADATA.SUBTITLE_LONG] = input.subtitle ?? '';
  strings[METADATA.VENUE] = input.venue ?? '';
  strings[METADATA.CITY] = input.city ?? '';
  strings[METADATA.FEDERATION] = input.federation ?? '';
  strings[METADATA.TIME_CONTROL] = input.timeControl ?? '';

  strings[METADATA.CHIEF_ARBITER] = input.chiefArbiter ?? '';
  strings[METADATA.DEPUTY_ARBITER] = input.deputyArbiters?.[0] ?? '';
  strings[METADATA.OTHER_ARBITERS] =
    input.deputyArbiters?.slice(1).join(', ') ?? '';

  return strings;
}

/** Build the 30-string array for a single player. */
function buildPlayerStrings(player: CreatePlayer): string[] {
  const strings: string[] = Array.from<string>({
    length: PLAYER_STRING_COUNT,
  }).fill('');

  strings[PLAYER_STRINGS.SURNAME] = player.surname;
  strings[PLAYER_STRINGS.FIRST_NAME] = player.firstName;
  strings[PLAYER_STRINGS.SHORT_NAME] =
    `${player.firstName.charAt(0)}. ${player.surname}`;
  strings[PLAYER_STRINGS.TITLE] = player.title ?? '';
  strings[PLAYER_STRINGS.NATIONAL_ID] = player.nationalId ?? '';
  strings[PLAYER_STRINGS.CLUB] = player.club ?? '';
  strings[PLAYER_STRINGS.FEDERATION] = player.federation ?? '';

  return strings;
}

/** Build the 110-byte numeric block for a single player. */
function buildPlayerNumericBlock(player: CreatePlayer): Uint8Array {
  const block = new Uint8Array(PLAYER_NUMERIC_BLOCK_SIZE);
  const view = new DataView(block.buffer);

  if (player.sex === 'F') {
    block[PLAYER_NUMERIC_OFFSET_SEX] = 1;
  }

  const rating = player.rating ?? 0;
  view.setUint16(PLAYER_NUMERIC_OFFSET_FIDE_RATING, rating, true);
  view.setUint16(
    PLAYER_NUMERIC_OFFSET_NATIONAL_RATING,
    player.nationalRating ?? 0,
    true,
  );
  view.setUint32(PLAYER_NUMERIC_OFFSET_FIDE_ID, player.fideId ?? 0, true);
  view.setUint16(PLAYER_NUMERIC_OFFSET_K_FACTOR, player.kFactor ?? 0, true);

  return block;
}

/** Patch config bytes with new tournament metadata. */
function patchConfigBytes(
  templateConfig: Uint8Array,
  input: CreateInput,
): Uint8Array {
  const config = new Uint8Array(templateConfig);
  const view = new DataView(
    config.buffer,
    config.byteOffset,
    config.byteLength,
  );

  // Offsets are relative to config data (after the 4-byte marker)
  const dataOffset = 4;

  view.setUint16(
    dataOffset + CONFIG_OFFSET_TOTAL_ROUNDS,
    input.rounds.length,
    true,
  );
  view.setUint8(dataOffset + CONFIG_OFFSET_CURRENT_ROUND, input.rounds.length);
  view.setUint16(
    dataOffset + CONFIG_OFFSET_PLAYER_COUNT,
    input.players.length,
    true,
  );

  if (input.startDate !== undefined) {
    view.setUint32(
      dataOffset + CONFIG_OFFSET_START_DATE,
      dateToYYYYMMDD(input.startDate),
      true,
    );
  }

  if (input.endDate !== undefined) {
    view.setUint32(
      dataOffset + CONFIG_OFFSET_END_DATE,
      dateToYYYYMMDD(input.endDate),
      true,
    );
  }

  return config;
}

/** Build the pairings section from rounds data + template trailer. */
function buildPairingsSection(
  templatePairingsSection: Uint8Array,
  input: CreateInput,
): Uint8Array {
  // Find D3 marker in template to extract the trailer
  const d3Marker = [0xd3, 0xff, 0x89, 0x44];
  let trailerOffset = -1;
  for (let index = 4; index < templatePairingsSection.length - 3; index++) {
    if (
      templatePairingsSection[index] === d3Marker[0] &&
      templatePairingsSection[index + 1] === d3Marker[1] &&
      templatePairingsSection[index + 2] === d3Marker[2] &&
      templatePairingsSection[index + 3] === d3Marker[3]
    ) {
      trailerOffset = index;
      break;
    }
  }

  const trailer =
    trailerOffset === -1
      ? new Uint8Array(0)
      : templatePairingsSection.slice(trailerOffset);

  // Count total pairing records
  const totalPairings = input.rounds.reduce(
    (sum, r) => sum + r.pairings.length,
    0,
  );

  // Build: marker (4) + records + trailer
  const pairingsSize = 4 + totalPairings * PAIRING_RECORD_SIZE + trailer.length;
  const section = new Uint8Array(pairingsSize);
  const view = new DataView(section.buffer);

  // Write pairings marker
  section[0] = 0xb3;
  section[1] = 0xff;
  section[2] = 0x89;
  section[3] = 0x44;

  let offset = 4;
  for (const round of input.rounds) {
    for (const pairing of round.pairings) {
      view.setUint16(offset, pairing.white, true);
      view.setUint16(
        offset + 2,
        pairing.black === 0 ? BYE_PLAYER_NUMBER : pairing.black,
        true,
      );
      view.setUint16(offset + 4, resultCodeToTunx(pairing.result), true);
      // Bytes 6-20 are zero (already initialized)
      offset += PAIRING_RECORD_SIZE;
    }
  }

  // Append trailer
  section.set(trailer, offset);

  return section;
}

/** Flip a result code from white's perspective to black's perspective. */
function flipResultCode(code: ResultCode): ResultCode {
  switch (code) {
    case '1': {
      return '0';
    }
    case '0': {
      return '1';
    }
    case '+': {
      return '-';
    }
    case '-': {
      return '+';
    }
    default: {
      return code;
    }
  }
}

/** Return true if input is a Tournament (rounds is a number) vs CreateInput (rounds is an array). */
function isTournament(input: CreateInput | Tournament): input is Tournament {
  return typeof input.rounds === 'number';
}

/** Convert a Tournament object into CreateInput so the existing build functions work. */
function tournamentToCreateInput(tournament: Tournament): CreateInput {
  const players: CreatePlayer[] = tournament.players.map((p) => {
    const commaIndex = p.name.indexOf(', ');
    const surname = commaIndex === -1 ? p.name : p.name.slice(0, commaIndex);
    const firstName = commaIndex === -1 ? '' : p.name.slice(commaIndex + 2);

    return {
      club: undefined,
      federation: p.federation,
      fideId: p.fideId === undefined ? undefined : Number(p.fideId),
      firstName,
      kFactor: undefined,
      nationalId: p.nationalRatings?.[0]?.nationalId,
      nationalRating: p.nationalRatings?.[0]?.rating,
      rating: p.rating,
      sex:
        p.sex === 'w'
          ? ('F' as const)
          : p.sex === 'm'
            ? ('M' as const)
            : undefined,
      surname,
      title: p.title,
    };
  });

  const nRounds = tournament.rounds;
  const sourcePairings = tournament.pairings ?? [];

  const rounds: CreateRound[] = [];
  for (let r = 0; r < nRounds; r++) {
    const roundPairings = sourcePairings[r] ?? [];
    rounds.push({
      date: tournament.roundDates?.[r],
      pairings: roundPairings.map((p) => ({
        black: p.black,
        result: p.result ?? ('Z' as ResultCode),
        white: p.white,
      })),
    });
  }

  return {
    chiefArbiter: tournament.chiefArbiter,
    city: tournament.city,
    deputyArbiters: tournament.deputyArbiters,
    endDate: tournament.endDate,
    federation: tournament.federation,
    name: tournament.name ?? '',
    players,
    rounds,
    startDate: tournament.startDate,
    subtitle: tournament.subtitle,
    timeControl: tournament.timeControl,
    venue: tournament.venue,
  };
}

/**
 * Create a new TUNX tournament using an existing tournament as a template.
 *
 * The template provides the binary scaffolding (license bytes, config
 * structure, unknown sections). The input provides the new tournament data.
 *
 * @param template - A parsed `Tournament` to use as the binary template.
 * @param input - The new tournament data as `CreateInput` or a `Tournament`
 *   object (e.g. from `parse()` or `trf.parse()`).
 * @returns A new `Tournament` with `_raw` populated, ready for `stringify()`.
 */
export default function create(
  template: Tournament,
  input: CreateInput | Tournament,
): Tournament {
  const createInput = isTournament(input)
    ? tournamentToCreateInput(input)
    : input;
  if (!template._raw) {
    throw new RangeError(
      'create() requires template._raw — only tournaments produced by parse() can be used as templates',
    );
  }

  const raw: RawTournament = {
    configBytes: patchConfigBytes(template._raw.configBytes, createInput),
    headerBytes: new Uint8Array(template._raw.headerBytes),
    metadataStrings: buildMetadataStrings(
      template._raw.metadataStrings,
      createInput,
    ),
    pairingBytes: [],
    pairingsSection: buildPairingsSection(
      template._raw.pairingsSection,
      createInput,
    ),
    playerNumericBytes: createInput.players.map((p) =>
      buildPlayerNumericBlock(p),
    ),
    playerStrings: createInput.players.map((p) => buildPlayerStrings(p)),
  };

  // Build structured player data
  const players = createInput.players.map((p, index) => {
    const name =
      p.firstName.length > 0 ? `${p.surname}, ${p.firstName}` : p.surname;

    const results = createInput.rounds.flatMap((round, roundIndex) => {
      const pairing = round.pairings.find(
        (pr) => pr.white === index + 1 || pr.black === index + 1,
      );

      if (pairing === undefined) return [];

      const isWhite = pairing.white === index + 1;
      const opponentId = isWhite ? pairing.black : pairing.white;
      const whiteResult = pairing.result;
      const myResult: ResultCode = isWhite
        ? whiteResult
        : flipResultCode(whiteResult);

      return [
        {
          color: (isWhite ? 'w' : 'b') as 'b' | 'w',
          opponentId: opponentId === 0 ? undefined : opponentId,
          result: myResult,
          round: roundIndex + 1,
        },
      ];
    });

    const points = results.reduce(
      (sum, r) => sum + pointsFromResult(r.result),
      0,
    );

    return {
      federation: p.federation,
      fideId: p.fideId === undefined ? undefined : String(p.fideId),
      name,
      pairingNumber: index + 1,
      points,
      rank: 0,
      rating: p.rating,
      results,
      sex: p.sex === 'F' ? ('w' as const) : undefined,
      title: p.title,
    };
  });

  // Assign ranks
  const sorted = players.toSorted((a, b) => b.points - a.points);
  let currentRankValue = 1;
  for (let index = 0; index < sorted.length; index++) {
    const player = sorted[index];
    const previous = sorted[index - 1];
    if (
      index > 0 &&
      previous !== undefined &&
      player !== undefined &&
      player.points < previous.points
    ) {
      currentRankValue = index + 1;
    }
    if (player !== undefined) {
      player.rank = currentRankValue;
    }
  }

  return {
    _raw: raw,
    chiefArbiter: createInput.chiefArbiter,
    city: createInput.city,
    currentRound: createInput.rounds.length,
    deputyArbiters: createInput.deputyArbiters,
    endDate: createInput.endDate,
    federation: createInput.federation,
    header: template.header,
    name: createInput.name,
    numberOfPlayers: players.length,
    players,
    rounds: createInput.rounds.length,
    startDate: createInput.startDate,
    subtitle: createInput.subtitle,
    tiebreaks: undefined,
    timeControl: createInput.timeControl,
    venue: createInput.venue,
  };
}
