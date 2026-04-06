import { describe, it, expect, beforeEach } from "vitest";
import { parseList, buildTeams, stripEmoji, extractEmoji } from "./wo-mgr";

/* ──────────────────────────────────────────────
   stripEmoji / extractEmoji
────────────────────────────────────────────── */
describe("stripEmoji", () => {
  it("should strip all emojis and return trimmed text", () => {
    expect(stripEmoji("✈️ João Silva ✈️")).toBe("João Silva");
    expect(stripEmoji("🚑 Carlos 🚑")).toBe("Carlos");
    expect(stripEmoji("CleanName")).toBe("CleanName");
    expect(stripEmoji("👨\u200D💻 Test User")).toBe("Test User");
  });

  it("should return empty string for emoji-only input", () => {
    expect(stripEmoji("⚽")).toBe("");
    expect(stripEmoji("🏃\u200D♂️")).toBe("");
  });
});

describe("extractEmoji", () => {
  it("should extract emojis from text (without U+FE0F variants)", () => {
    expect(extractEmoji("✈️ João ✈️")).toBe("✈✈");
    expect(extractEmoji("🚑 Carlos 🚑")).toBe("🚑🚑");
    expect(extractEmoji("NoEmoji")).toBe("");
  });
});

/* ═══════════════════════════════════════════
   parseList
═════════════════════════════════════════════ */
describe("parseList", () => {
  it("should parse a standard WhatsApp list", () => {
    const raw = `LISTA-FUTEBOL W.O -28/03

1 João Silva
2 Carlos Souza
3 Pedro Santos

GOLEIROS
1 Gil
2 Marcos

AUSENTES
1 André ✈️
2 Bruno 🚑
`;
    const result = parseList(raw);
    expect(result.title).toBe("LISTA-FUTEBOL W.O -28/03");
    expect(result.players).toEqual([
      { name: "João Silva" },
      { name: "Carlos Souza" },
      { name: "Pedro Santos" },
    ]);
    expect(result.goalkeepers).toEqual([{ name: "Gil" }, { name: "Marcos" }]);
    expect(result.absent).toEqual([
      { name: "André", emoji: "✈" },
      { name: "Bruno", emoji: "🚑" },
    ]);
  });

  it("should ignore empty lines and unknown headers", () => {
    const raw = `LISTA-FUTEBOL W.O -01/04

1 Player One

RANDOM STUFF
2 Player Two

3 Player Three
`;
    const result = parseList(raw);
    expect(result.players.length).toBe(3);
    expect(result.goalkeepers.length).toBe(0);
  });

  it("should return empty arrays for invalid input", () => {
    const result = parseList("gibberish\nno numbers here");
    expect(result.players).toEqual([]);
    expect(result.goalkeepers).toEqual([]);
    expect(result.absent).toEqual([]);
    expect(result.title).toBe("");
  });

  it("should handle list without absent/gk sections", () => {
    const raw = `LISTA-FUTEBOL W.O -05/01

1 Maria
2 Fernanda
`;
    const result = parseList(raw);
    expect(result.players).toEqual([{ name: "Maria" }, { name: "Fernanda" }]);
    expect(result.goalkeepers).toEqual([]);
    expect(result.absent).toEqual([]);
  });

  it("should strip emojis from player names", () => {
    const raw = `LISTA-FUTEBOL W.O -10/02

1 ⚽ Neymar Jr ⚽
2 🏃 Mbappe
`;
    const result = parseList(raw);
    expect(result.players).toEqual([
      { name: "Neymar Jr" },
      { name: "Mbappe" },
    ]);
  });
});

/* ═══════════════════════════════════════════
   buildTeams
═════════════════════════════════════════════ */
const basePresence = {
  P1: "2026-03-30T14:00:00.000Z",
  P2: "2026-03-30T14:01:00.000Z",
  P3: "2026-03-30T14:02:00.000Z",
  P4: "2026-03-30T14:03:00.000Z",
  P5: "2026-03-30T14:04:00.000Z",
  P6: "2026-03-30T14:05:00.000Z",
  P7: "2026-03-30T14:06:00.000Z",
  P8: "2026-03-30T14:07:00.000Z",
  P9: "2026-03-30T14:08:00.000Z",
  P10: "2026-03-30T14:09:00.000Z",
  GK1: "2026-03-30T14:00:30.000Z",
  GK2: "2026-03-30T14:01:30.000Z",
};

const baseParsed = {
  players: [
    { name: "P1" }, { name: "P2" }, { name: "P3" },
    { name: "P4" }, { name: "P5" }, { name: "P6" },
    { name: "P7" }, { name: "P8" }, { name: "P9" },
    { name: "P10" },
  ],
  goalkeepers: [{ name: "GK1" }, { name: "GK2" }],
  absent: [],
};

function makeInput(overrides = {}) {
  return {
    presence: basePresence,
    parsed: baseParsed,
    numTeams: 2,
    perTeam: 5,
    kickoffISO: "2026-03-30T14:05:00.000Z",
    ...overrides,
  };
}

describe("buildTeams", () => {
  it("should split 10 players into 2 teams of 5", () => {
    const result = buildTeams(makeInput());
    expect(result.teams.length).toBe(2);
    expect(result.teams[0].players.length).toBe(5);
    expect(result.teams[1].players.length).toBe(5);
  });

  it("should assign GKs in arrival order (1st GK → team A)", () => {
    const result = buildTeams(makeInput());
    expect(result.teams[0].goalkeeper.name).toBe("GK1");
    expect(result.teams[1].goalkeeper.name).toBe("GK2");
  });

  it("should put surplus players in queue", () => {
    // With 2 teams × 3 perTeam = 6 spots, but 10 present → 4 in queue
    const result = buildTeams(makeInput({ perTeam: 3 }));
    const totalOnField = result.teams.reduce(
      (s, t) => s + t.players.length,
      0
    );
    expect(totalOnField).toBe(6);
    expect(result.queue.length).toBe(4);
  });

  it("should put late non-starters in lateQueue", () => {
    // 2×2=4 spots, 6 on field, 4 remaining in queue.
    // P7(14:06) P8(14:07) P9(14:08) P10(14:09) all after kickoff (14:05)
    // P5(14:04) P6(14:05) are also after/equal kickoff but the filter uses ">"
    const input = makeInput({ perTeam: 2 });
    const result = buildTeams(input);
    // P3-P9 beyond first 4: P7,P8,P9,P10 arrived after kickoff → lateQueue
    // But lateQueue filters eligibleStarters, so only non-eligible & late
    expect(result.queue.length).toBe(6); // P3-P8 (first 4 fill spots, rest queued)
    const lateNames = result.lateQueue.map(p => p.name);
    // P7, P8, P9, P10 are after kickoff and not on eligible starters
    expect(lateNames.some(n => n === "P7")).toBe(true);
  });

  it("should have no queue when players exactly fill spots", () => {
    const result = buildTeams(makeInput({ perTeam: 5 }));
    expect(result.queue.length).toBe(0);
  });

  it("should handle 3 teams with correct distribution", () => {
    const result = buildTeams(makeInput({ numTeams: 3, perTeam: 3 }));
    // 3×3=9 spots, 10 players → 1 in queue
    expect(result.teams[0].players.length +
           result.teams[1].players.length +
           result.teams[2].players.length)
      .toBe(9);
    expect(result.queue.length).toBe(1);
  });

  it("should put extra GKs in gkQueue", () => {
    const input = makeInput({
      numTeams: 1,
      perTeam: 5,
      parsed: {
        ...baseParsed,
        goalkeepers: [
          { name: "GK1" },
          { name: "GK2" },
          { name: "GK3" },
        ],
      },
      presence: { ...basePresence, GK3: "2026-03-30T14:02:30.000Z" },
    });
    const result = buildTeams(input);
    expect(result.teams[0].goalkeeper.name).toBe("GK1");
    expect(result.gkQueue.length).toBe(2);
    expect(result.gkQueue[0].name).toBe("GK2");
    expect(result.gkQueue[1].name).toBe("GK3");
  });
});
