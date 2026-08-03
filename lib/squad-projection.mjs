export const SQUAD_CHIPS = Object.freeze([
  Object.freeze({ key: "wildcard", label: "WILDCARD" }),
  Object.freeze({ key: "benchboost", label: "BENCH BOOST" }),
  Object.freeze({ key: "triplecaptain", label: "TRIPLE CAPTAIN" }),
]);

const CHIP_KEYS = new Set(SQUAD_CHIPS.map((chip) => chip.key));
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const idOf = (player) => Number(player?.fpl_id ?? player?.element ?? player?.id);

export function normaliseSquadChip(value) {
  const key = String(value || "").toLowerCase().replace(/[\s_-]+/g, "");
  if (key === "benchboost") return "benchboost";
  if (key === "triplecaptain" || key === "triplecap") return "triplecaptain";
  if (key === "wildcard" || key === "wc") return "wildcard";
  return CHIP_KEYS.has(key) ? key : null;
}

export function splitSquadPlayers(players = []) {
  const list = Array.isArray(players) ? players.filter(Boolean) : [];
  const marked = list.filter((player) => Boolean(player.starting));
  const starters = marked.length === 11 ? marked : list.slice(0, 11);
  const starterIds = new Set(starters.map(idOf));
  const bench = list.filter((player) => !starterIds.has(idOf(player)));
  return { starters, bench };
}

export function projectSquad({
  players = [], captain = null, chip = null, transferHit = 0, scoreOf = () => 0,
} = {}) {
  const activeChip = normaliseSquadChip(chip);
  const { starters, bench } = splitSquadPlayers(players);
  const score = (player) => finite(scoreOf(player));

  const startingXpts = starters.reduce((sum, player) => sum + score(player), 0);
  const captainPlayer = starters.find((player) => idOf(player) === Number(captain)) || null;
  const captainXpts = captainPlayer ? score(captainPlayer) : 0;
  const captainMultiplier = captainPlayer ? (activeChip === "triplecaptain" ? 3 : 2) : 1;
  const captainBonus = captainXpts * Math.max(0, captainMultiplier - 1);
  const benchBoostBonus = activeChip === "benchboost"
    ? bench.reduce((sum, player) => sum + score(player), 0)
    : 0;
  const requestedTransferHit = Math.max(0, finite(transferHit));
  const appliedTransferHit = activeChip === "wildcard" ? 0 : requestedTransferHit;
  const wildcardSaving = activeChip === "wildcard" ? requestedTransferHit : 0;
  const grossXpts = startingXpts + captainBonus + benchBoostBonus;
  const netXpts = grossXpts - appliedTransferHit;

  return {
    chip: activeChip,
    startingXpts,
    captainXpts,
    captainMultiplier,
    captainBonus,
    benchBoostBonus,
    requestedTransferHit,
    transferHit: appliedTransferHit,
    wildcardSaving,
    grossXpts,
    netXpts,
    starterCount: starters.length,
    benchCount: bench.length,
  };
}

export function projectSquadRange({
  players = [], captain = null, gwFrom = 1, gwTo = 1,
  scoreForGw = () => 0, chipForGw = () => null, transferHitForGw = () => 0,
} = {}) {
  const first = Number.isInteger(Number(gwFrom)) ? Number(gwFrom) : 1;
  const last = Number.isInteger(Number(gwTo)) ? Math.max(first, Number(gwTo)) : first;
  const weeks = [];

  for (let gw = first; gw <= last; gw += 1) {
    weeks.push({
      gw,
      ...projectSquad({
        players,
        captain,
        chip: chipForGw(gw),
        transferHit: transferHitForGw(gw),
        scoreOf: (player) => scoreForGw(player, gw),
      }),
    });
  }

  const sum = (key) => weeks.reduce((total, row) => total + finite(row[key]), 0);
  return {
    gwFrom: first,
    gwTo: last,
    weeks,
    startingXpts: sum("startingXpts"),
    captainBonus: sum("captainBonus"),
    benchBoostBonus: sum("benchBoostBonus"),
    requestedTransferHit: sum("requestedTransferHit"),
    transferHit: sum("transferHit"),
    wildcardSaving: sum("wildcardSaving"),
    grossXpts: sum("grossXpts"),
    netXpts: sum("netXpts"),
  };
}
