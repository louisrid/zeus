#!/usr/bin/env python3
"""Apply the consolidated Zeus xPTS overhaul to a repository checkout.

Run from the repository root:
    python3 path/to/apply_overhaul.py

The script is idempotent where practical and fails loudly when a required source marker is missing rather than silently
producing a partial installation.
"""
from __future__ import annotations

import re
import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ASSETS = HERE / "overhaul_files"
ROOT = Path.cwd().resolve()

REQUIRED = [
    ROOT / "lib/engine/layer2_allocation.mjs",
    ROOT / "lib/engine/layer3_minutes.mjs",
    ROOT / "lib/engine/layer4_sim.mjs",
    ROOT / "lib/solver/score.mjs",
    ROOT / "jobs/projections_run.mjs",
]


def fail(message: str) -> None:
    raise RuntimeError(message)


def write(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")
    print(f"patched {path.relative_to(ROOT)}")


def copy_asset(relative: str) -> None:
    source = ASSETS / relative
    target = ROOT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    print(f"installed {relative}")


def insert_import(text: str, line: str) -> str:
    if line in text:
        return text
    imports = list(re.finditer(r"^import .*?;\s*$", text, flags=re.M))
    if imports:
        pos = imports[-1].end()
        return text[:pos] + "\n" + line + text[pos:]
    return line + "\n" + text


def find_matching_brace(text: str, open_index: int) -> int:
    if text[open_index] != "{":
        fail("brace scanner did not start on an opening brace")
    depth = 0
    i = open_index
    state = "code"
    quote = ""
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if state == "line_comment":
            if ch == "\n":
                state = "code"
        elif state == "block_comment":
            if ch == "*" and nxt == "/":
                state = "code"
                i += 1
        elif state == "string":
            if ch == "\\":
                i += 1
            elif ch == quote:
                state = "code"
        elif state == "template":
            if ch == "\\":
                i += 1
            elif ch == "`":
                state = "code"
        else:
            if ch == "/" and nxt == "/":
                state = "line_comment"
                i += 1
            elif ch == "/" and nxt == "*":
                state = "block_comment"
                i += 1
            elif ch in ("'", '"'):
                state = "string"
                quote = ch
            elif ch == "`":
                state = "template"
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    fail("unclosed JavaScript block")


def replace_function(text: str, marker: str, replacement: str) -> str:
    start = text.find(marker)
    if start < 0:
        fail(f"function marker not found: {marker}")
    body = re.search(r"\)\s*\{", text[start:])
    if not body:
        fail(f"function body not found: {marker}")
    brace = start + body.end() - 1
    end = find_matching_brace(text, brace)
    # Consume a trailing semicolon when replacing a const arrow function.
    if end + 1 < len(text) and text[end + 1] == ";":
        end += 1
    return text[:start] + replacement.rstrip() + text[end + 1 :]


def replace_block_after(text: str, scope_marker: str, block_marker: str, replacement: str) -> str:
    scope = text.find(scope_marker)
    if scope < 0:
        fail(f"scope marker not found: {scope_marker}")
    start = text.find(block_marker, scope)
    if start < 0:
        fail(f"block marker not found after {scope_marker}: {block_marker}")
    brace = text.find("{", start)
    end = find_matching_brace(text, brace)
    return text[:start] + replacement.rstrip() + text[end + 1 :]


def patch_layer3() -> None:
    path = ROOT / "lib/engine/layer3_minutes.mjs"
    text = path.read_text(encoding="utf-8")
    text = insert_import(
        text,
        'import { sampleRealXI, normaliseRealStarts } from "./lineup_sampler_v2.mjs";',
    )
    sample = '''export function sampleXI(players, rng, formation) {
  // `formation` is deliberately ignored. It contains FPL squad constraints,
  // not real-team formation constraints, and previously forced low-probability
  // FPL forwards into almost every simulated XI.
  return sampleRealXI(players, rng);
}'''
    normalise = '''export function normaliseTeamStarts(players, cfg) {
  return normaliseRealStarts(players, cfg);
}'''
    text = replace_function(text, "export function sampleXI", sample)
    text = replace_function(text, "export function normaliseTeamStarts", normalise)
    write(path, text)


def patch_layer2() -> None:
    path = ROOT / "lib/engine/layer2_allocation.mjs"
    text = path.read_text(encoding="utf-8")
    text = insert_import(text, 'import { reliableRate } from "./player_rate_resolver.mjs";')
    replacement = (ASSETS / "allocateTeam.replacement.mjs.txt").read_text(encoding="utf-8")
    text = replace_function(text, "export function allocateTeam", replacement)
    if text.count("shrinkShare(") == 1 and "function shrinkShare" in text:
        text = replace_function(text, "function shrinkShare", "")
    write(path, text)


def patch_layer4() -> None:
    path = ROOT / "lib/engine/layer4_sim.mjs"
    text = path.read_text(encoding="utf-8")
    already_patched = "const scoredGoalMinutes =" in text and "const concededGoalMinutes =" in text

    # Locate by JavaScript structure rather than an exact indentation string. GitHub's
    # web uploader and formatters can change tabs/spaces without changing the code.
    if already_patched:
        start_match = re.search(r"(?m)^[ \t]*const\s+scoredGoalMinutes\s*=", text)
    else:
        start_match = re.search(
            r"(?m)^[ \t]*const\s+xi\s*=\s*sampleXI\s*\(\s*s\.team\.players\s*,\s*rng\s*,\s*cfg\.formation\s*\)\s*;[ \t]*$",
            text,
        )
    start = start_match.start() if start_match else -1
    end_match = re.search(r"(?m)^[ \t]*//\s*Defensive volume\b", text[start:] if start >= 0 else "")
    end = start + end_match.start() if start >= 0 and end_match else -1
    if start < 0 or end < 0:
        xi_lines = [line.strip() for line in text.splitlines() if "sampleXI" in line][:5]
        defensive_lines = [line.strip() for line in text.splitlines() if "Defensive volume" in line][:5]
        fail(
            "could not locate the Layer 4 lineup/event allocation block; "
            f"sampleXI candidates={xi_lines!r}; defensive candidates={defensive_lines!r}"
        )

    block = r'''      const scoredGoalMinutes = s.key === "home" ? hMins : aMins;
      const concededGoalMinutes = s.key === "home" ? aMins : hMins;
      const xi = sampleXI(s.team.players, rng, cfg.formation);
      const xiSet = new Set(xi.map((p) => p.player_id));
      const onPitch = [];
      for (const p of s.team.players) {
        let minutes = 0;
        let startMinute = 0;
        let endMinute = 0;
        if (xiSet.has(p.player_id)) {
          minutes = p.exp_min_start || cfg.fullTime;
          if (rng() > (p.p60_given_start ?? 1)) {
            minutes = Math.min(minutes, cfg.subOffMinute * rng() + 45);
          }
          startMinute = 0;
          endMinute = Math.max(0, Math.min(cfg.fullTime, minutes));
        } else if (rng() < (p.p_cameo ?? 0) / Math.max(1e-6, 1 - (p.p_start ?? 0))) {
          minutes = p.exp_min_cameo || 0;
          endMinute = cfg.fullTime;
          startMinute = Math.max(0, cfg.fullTime - minutes);
        }
        if (minutes > 0) onPitch.push({ p, minutes, startMinute, endMinute });
      }
      if (!onPitch.length) continue;

      const eligibleAt = (minute) => onPitch.filter((x) => minute >= x.startMinute && minute <= x.endMinute);
      const scorerWeight = (x) => Math.max(0, x.p.goalShare) * (x.p.finishing || 1);
      const assistWeight = (x) => Math.max(0, x.p.assistShare);
      const perPlayer = new Map();
      for (const x of onPitch) {
        const concededOnPitch = concededGoalMinutes.filter(
          (minute) => minute >= x.startMinute && minute <= x.endMinute
        ).length;
        perPlayer.set(x.p.player_id, {
          player_id: x.p.player_id,
          position: x.p.position,
          minutes: x.minutes,
          goals: 0,
          assists: 0,
          goalsConceded: concededOnPitch,
          saves: 0,
          pensSaved: 0,
          pensMissed: 0,
          yellow: 0,
          red: 0,
          ownGoals: 0,
          cbit: 0,
          recoveries: 0,
          key_passes: 0,
          pens_taken: 0,
          pens_missed: 0,
          clearances_blocks_interceptions: 0,
          tackles: 0,
        });
      }

      // Penalties retain the identity of the actual sampled taker/converter.
      const convertedTakers = [];
      if (s.team.penAwardRate !== null && s.team.penAwardRate !== undefined) {
        const awarded = poisson(rng, s.team.penAwardRate);
        for (let i = 0; i < awarded; i++) {
          const duty = onPitch
            .filter((x) => (x.p.penRank || 0) > 0)
            .sort((a, b) => a.p.penRank - b.p.penRank)[0];
          const taker = duty || onPitch[categorical(rng, onPitch.map(scorerWeight))] || null;
          if (!taker) continue;
          const ev = perPlayer.get(taker.p.player_id);
          ev.pens_taken += 1;
          const conv = taker.p.penConversion;
          if (conv === null || conv === undefined) continue;
          if (rng() < conv) convertedTakers.push(taker);
          else {
            ev.pensMissed += 1;
            ev.pens_missed += 1;
          }
        }
      }

      const creditedPenalties = convertedTakers.slice(0, scored);
      for (const taker of creditedPenalties) perPlayer.get(taker.p.player_id).goals += 1;
      const openGoals = Math.max(0, scored - creditedPenalties.length);

      // Randomly choose which sampled goal times were open-play goals, then only
      // allow players who were actually on the pitch at that minute to score/assist.
      const shuffledGoalMinutes = [...scoredGoalMinutes];
      for (let i = shuffledGoalMinutes.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffledGoalMinutes[i], shuffledGoalMinutes[j]] = [shuffledGoalMinutes[j], shuffledGoalMinutes[i]];
      }
      const openGoalMinutes = shuffledGoalMinutes.slice(0, openGoals);
      for (const minute of openGoalMinutes) {
        const eligible = eligibleAt(minute);
        if (!eligible.length) continue;
        const gi = categorical(rng, eligible.map(scorerWeight));
        if (gi < 0) continue;
        const scorer = eligible[gi];
        perPlayer.get(scorer.p.player_id).goals += 1;
        if (rng() > cfg.unassistedShare) {
          const ai = categorical(rng, eligible.map((x, i) => (i === gi ? 0 : assistWeight(x))));
          if (ai >= 0) {
            perPlayer.get(eligible[ai].p.player_id).assists += 1;
            perPlayer.get(eligible[ai].p.player_id).key_passes += 1;
          }
        }
      }
'''
    if not already_patched:
        text = text[:start] + block + text[end:]
    text = text.replace(
        "const stateMult = 1 + cfg.stateCbitBoost * (shares.trailing - shares.leading);",
        "const stateMult = 1 + cfg.stateCbitBoost * (shares.leading - shares.trailing);",
    )
    text = text.replace(
        "ev.saves = Math.max(0, faced - conceded);",
        "ev.saves = Math.max(0, faced - ev.goalsConceded);",
    )
    write(path, text)


def patch_projection_job() -> None:
    path = ROOT / "jobs/projections_run.mjs"
    text = path.read_text(encoding="utf-8")
    text = insert_import(text, 'import { resolvePlayerRates } from "../lib/engine/player_rate_resolver.mjs";')
    text = insert_import(text, 'import { matchExpectedMetricsRow } from "../lib/engine/player_data_matcher.mjs";')

    profile = text.find("const profileOf = (p) => {")
    if profile < 0:
        fail("profileOf was not found in projections_run.mjs")
    ret = text.find("return {", profile)
    if ret < 0:
        fail("profileOf return object was not found")

    # Repair common Understat id/name mismatches without changing a valid direct lookup.
    profile_prefix = text[profile:ret]
    u_match = re.search(r"^[ \t]*const u = ([A-Za-z_$][\w$]*)\.get\([^\n;]+\);", profile_prefix, flags=re.M)
    if u_match and "matchExpectedMetricsRow" not in u_match.group(0):
        whole = u_match.group(0)
        source_name = u_match.group(1)
        direct_expr = whole.split("=", 1)[1].strip().rstrip(";")
        replacement = f"    const directUnderstat = {direct_expr};\n    const u = matchExpectedMetricsRow({{ player: p, direct: directUnderstat, source: {source_name} }});"
        text = text[:profile + u_match.start()] + replacement + text[profile + u_match.end():]
        ret += len(replacement) - len(whole)

    if "const resolvedRates = resolvePlayerRates" not in text[profile:ret]:
        injected = '''    const resolvedRates = resolvePlayerRates({
      archive: a,
      understat: u,
      player: p,
      position: p.position,
      leagueRates: cfg.leagueRates,
    });
'''
        text = text[:ret] + injected + text[ret:]

    # Force the object to consume the safe rates, regardless of any old local fallback constants.
    profile_end = find_matching_brace(text, text.find("{", profile))
    segment = text[profile:profile_end]
    segment = re.sub(r"^[ \t]*npxg90(?:[ \t]*:[ \t]*[^,]+)?,[ \t]*$", "      npxg90: resolvedRates.npxg90,", segment, flags=re.M)
    segment = re.sub(r"^[ \t]*xa90(?:[ \t]*:[ \t]*[^,]+)?,[ \t]*$", "      xa90: resolvedRates.xa90,", segment, flags=re.M)
    fields = [
        ("npxgNineties", "resolvedRates.npxgNineties"),
        ("xaNineties", "resolvedRates.xaNineties"),
        ("rateNineties", "resolvedRates.nineties"),
        ("rate_source", "resolvedRates.source"),
    ]
    for field, value in fields:
        pattern = rf"^[ \t]*{field}[ \t]*:[ \t]*[^,]+,[ \t]*$"
        if re.search(pattern, segment, flags=re.M):
            segment = re.sub(pattern, f"      {field}: {value},", segment, flags=re.M)
        else:
            segment = segment.replace(
                "      xa90: resolvedRates.xa90,",
                f"      xa90: resolvedRates.xa90,\n      {field}: {value},",
                1,
            )
    segment = re.sub(r"^[ \t]*xg[ \t]*:[ \t]*[^,]+,[ \t]*$", "      xg: resolvedRates.xgTotal,", segment, flags=re.M)
    segment = re.sub(r"^[ \t]*shots[ \t]*:[ \t]*[^,]+,[ \t]*$", "      shots: resolvedRates.shots,", segment, flags=re.M)
    segment = re.sub(r"^[ \t]*const npxg90\s*=.*?;[ \t]*$", "", segment, flags=re.M)
    segment = re.sub(r"^[ \t]*const xa90\s*=.*?;[ \t]*$", "", segment, flags=re.M)
    text = text[:profile] + segment + text[profile_end:]

    # The team-level normaliser needs the player's real position. The old forecast object
    # carried only probabilities, which was enough for global scaling but not for real-XI scaling.
    text = re.sub(
        r"const f = forecastMinutes\(\{ player: pr, league, signal, gw, cfg \}\);",
        "const f = { ...forecastMinutes({ player: pr, league, signal, gw, cfg }), player_id: pr.player_id, position: pr.position };",
        text,
    )

    # Keep the whole squad available to allocation. p_start=0 players simply never enter the sampled XI.
    text = re.sub(
        r"\}\)\.filter\(\(pr\)\s*=>\s*pr\.p_start\s*>\s*0\s*\|\|\s*pr\.p_cameo\s*>\s*0\);",
        "});",
        text,
    )

    # Real promoted-team status rather than an unreachable literal false.
    if "const isPromotedTeam =" not in text:
        insertion = text.find("  // ── Layer 3")
        if insertion < 0:
            insertion = text.find("  const minutesRows")
        if insertion < 0:
            insertion = text.find("function build")
        if insertion < 0:
            insertion = text.find("const build")
        if insertion < 0:
            insertion = text.find("for (const fx of fixtures")
        if insertion < 0:
            fail("could not place promoted-team resolver before fixture processing")
        helper = '''  const isPromotedTeam = (teamId) => {
    const team = teams.find((t) => t.id === teamId);
    const configured = new Set((cfg.promotedTeamIds || []).map(Number));
    return Boolean(
      configured.has(Number(teamId))
      || team?.promoted
      || team?.is_promoted
      || team?.promoted_club
    );
  };
'''
        text = text[:insertion] + helper + text[insertion:]
    text = text.replace("build(fx.home_team, false)", "build(fx.home_team, isPromotedTeam(fx.home_team))")
    text = text.replace("build(fx.away_team, false)", "build(fx.away_team, isPromotedTeam(fx.away_team))")

    # The old reallocation ran before shares existed and looked up pl.id instead of player_id.
    marker = text.find("    // ROLE REALLOCATION")
    sim = text.find("    const { samples } = simulateFixture", marker if marker >= 0 else 0)
    if marker >= 0 and sim > marker:
        direct = '''    // Allocation already renormalises goal and assist weights among the players
    // who are actually on the pitch in each simulation. Do not pre-reallocate
    // undefined shares through the broken legacy role-reallocation path.
    const homeAlloc = allocateTeam({ team: homeTeam, lambda: lambdas.lambda_home, priors, cfg, gw: fx.gw, promotedPrior: cfg.promotedPrior });
    const awayAlloc = allocateTeam({ team: awayTeam, lambda: lambdas.lambda_away, priors, cfg, gw: fx.gw, promotedPrior: cfg.promotedPrior });
'''
        text = text[:marker] + direct + text[sim:]
    text = re.sub(r'^import \{ reallocate \} from "\.\./lib/engine/role_reallocation\.mjs";\n', '', text, flags=re.M)

    write(path, text)


def patch_score() -> None:
    path = ROOT / "lib/solver/score.mjs"
    text = path.read_text(encoding="utf-8")

    engine_direct = '''if (row && Number.isFinite(Number(row.ep_mean))) {
      // ep_mean already includes start probability, cameo probability, minutes,
      // availability, returns, clean sheets and bonus. Never apply minutes twice
      // and never silently replace a valid engine row with archive scoring.
      return round2(Number(row.ep_mean));
    }'''
    text = replace_block_after(text, "const scoreOf = (p) => {", "if (row &&", engine_direct)

    # When a projection run exists, a missing row is a coverage failure, not permission
    # to rank the player through unrelated archive mathematics.
    score_scope = text.find("const scoreOf = (p) => {")
    avail = text.find("    const avail = availabilityMult(p);", score_scope)
    if avail < 0:
        fail("scoreOf availability marker not found")
    guard = "    if (proj.size > 0) return null;\n"
    if guard.strip() not in text[score_scope:avail]:
        text = text[:avail] + guard + text[avail:]

    pergw_direct = '''if (row && Number.isFinite(Number(row.ep_mean))) {
        return round2(Number(row.ep_mean));
      }'''
    text = replace_block_after(text, "const scoreForGw = (p, gw) => {", "if (row &&", pergw_direct)

    # If the engine covers this GW for anybody, do not mix legacy final-xPts routes
    # into the same ranking for a player whose row is missing.
    pergw_scope = text.find("const scoreForGw = (p, gw) => {")
    avail2 = text.find("    const avail = availabilityMult(p);", pergw_scope)
    if avail2 < 0:
        fail("scoreForGw availability marker not found")
    gw_guard = '''    const engineCoversGw = perGw && [...perGw.values()].some((rows) => rows.some((r) => r.gw === gw));
    if (engineCoversGw) return null;
'''
    if "const engineCoversGw" not in text[pergw_scope:avail2]:
        text = text[:avail2] + gw_guard + text[avail2:]

    # Make provenance explicit.
    if 'return "missing-engine"' not in text:
        text = re.sub(
            r'(if\s*\(\s*proj\.get\(p\.fpl_id\)\s*\)\s*return\s*"engine";)',
            r'\1\n    if (proj.size > 0) return "missing-engine";',
            text,
            count=1,
        )

    # Null-safe uncertainty band for missing engine coverage.
    old = '''    const s = scoreOf(p);
    return { p10: round2(Math.max(0, s * 0.35)), p50: round2(s), p90: round2(s * 1.9), real: false };'''
    new = '''    const s = scoreOf(p);
    if (!Number.isFinite(s)) return { p10: null, p50: null, p90: null, real: false };
    return { p10: round2(Math.max(0, s * 0.35)), p50: round2(s), p90: round2(s * 1.9), real: false };'''
    text = text.replace(old, new)

    write(path, text)


def patch_lineup_confidence() -> None:
    path = ROOT / "config/lineups.json"
    if not path.exists():
        print("config/lineups.json not found; skipping predicted-lineup confidence cap")
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict) and not bool(data.get("official")):
        current = float(data.get("confidence", 0.5) or 0.5)
        data["confidence"] = min(current, 0.5)
        data["confidence_note"] = "Unofficial single-source XI is evidence, not certainty. Capped until source accuracy is measured."
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("patched config/lineups.json")


def install_tests() -> None:
    copy_asset("tests/xpts_overhaul_contract.test.mjs")


def main() -> int:
    missing = [str(p) for p in REQUIRED if not p.exists()]
    if missing:
        print("Run this script from the Zeus repository root. Missing:\n- " + "\n- ".join(missing), file=sys.stderr)
        return 2

    copy_asset("lib/engine/player_data_matcher.mjs")
    copy_asset("lib/engine/player_rate_resolver.mjs")
    copy_asset("lib/engine/lineup_sampler_v2.mjs")
    patch_layer3()
    patch_layer2()
    patch_layer4()
    patch_projection_job()
    patch_score()
    patch_lineup_confidence()
    install_tests()

    print("\nOverhaul installed. Next commands:")
    print("  node --test tests/xpts_overhaul_contract.test.mjs")
    print("  npm test")
    print("  npm run build")
    print("Then run projections-run once to replace stored rows.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
