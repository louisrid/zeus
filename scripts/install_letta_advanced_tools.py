#!/usr/bin/env python3
"""Install the final primitive-only ZEUS strict Bench Boost tools in Letta."""

from __future__ import annotations

import getpass
import json
import subprocess
import sys
import time
import urllib.parse

BASE = 'https://api.letta.com'
DEFAULT_AGENT_ID = 'agent-5423bdf2-43da-4626-99a4-8fed82c05c75'
KNOWN_TOOLS = {
    "compare_and_save_benchboost_squads_strict": 'tool-46fd1f7c-cad0-43ee-8716-db1718f1606f',
    "get_fpl_benchboost_squad_strict": 'tool-c77763fb-251f-48fa-ac22-b90409368c75',
}
COMPARE_SOURCE = 'def compare_and_save_benchboost_squads_strict(\n    gw_from: int = 1,\n    gw_to: int = 3,\n    bench_boost_gw_a: int = 1,\n    bench_boost_gw_b: int = 2,\n    excluded_player_names_text: str = "",\n    minimum_bench_spend: float = 16.5,\n    budget: float = 100.0,\n    minimum_money_in_bank: float = 0.0,\n    goalkeeper_max_price: float = 4.5,\n    minimum_goalkeepers_at_or_below_price: int = 1,\n) -> str:\n    """Return two independently optimised, read-only ZEUS Bench Boost reports verbatim."""\n    import json\n    import urllib.error\n    import urllib.request\n\n    BENCH_ORDER_POLICY = \'backup_gkp_first_then_outfield_descending_xpts\'\n\n    def unwrap(value):\n        if value is None or isinstance(value, (str, int, float, bool)):\n            return value\n        if isinstance(value, (list, tuple, set)):\n            return value\n        if isinstance(value, dict):\n            for key in ("value", "root", "gameweek", "gw", "name", "label", "id"):\n                if key in value:\n                    return unwrap(value[key])\n        for attribute in ("value", "root", "gameweek", "gw", "name", "label", "id"):\n            try:\n                candidate = getattr(value, attribute)\n            except Exception:\n                continue\n            if candidate is not value:\n                return unwrap(candidate)\n        return str(value)\n\n    def as_int(value, label):\n        raw = unwrap(value)\n        try:\n            return int(raw)\n        except (TypeError, ValueError) as exc:\n            raise ValueError(f"{label} must be an integer, received {raw!r}.") from exc\n\n    def as_float(value, label):\n        raw = unwrap(value)\n        try:\n            parsed = float(raw)\n        except (TypeError, ValueError) as exc:\n            raise ValueError(f"{label} must be numeric, received {raw!r}.") from exc\n        if parsed != parsed or parsed in (float("inf"), float("-inf")):\n            raise ValueError(f"{label} must be finite.")\n        return parsed\n\n    def parse_names(value):\n        raw = unwrap(value)\n        if raw is None:\n            return []\n        if isinstance(raw, (list, tuple, set)):\n            candidates = [str(unwrap(item)) for item in raw]\n        else:\n            text = str(raw).replace("\\r", "\\n")\n            for separator in (";", "|", "\\n"):\n                text = text.replace(separator, ",")\n            candidates = text.split(",")\n        names = []\n        for candidate in candidates:\n            cleaned = str(candidate).strip().lstrip("-•* ").strip()\n            if cleaned and cleaned not in names:\n                names.append(cleaned)\n        return names\n\n    requested_gameweeks = [\n        as_int(bench_boost_gw_a, "bench_boost_gw_a"),\n        as_int(bench_boost_gw_b, "bench_boost_gw_b"),\n    ]\n    if len(set(requested_gameweeks)) != 2:\n        raise ValueError("bench_boost_gw_a and bench_boost_gw_b must be different gameweeks.")\n\n    gk_cap = as_float(goalkeeper_max_price, "goalkeeper_max_price")\n    minimum_cheap_gks = as_int(\n        minimum_goalkeepers_at_or_below_price,\n        "minimum_goalkeepers_at_or_below_price",\n    )\n    if gk_cap <= 0:\n        raise ValueError("goalkeeper_max_price must be positive.")\n    if minimum_cheap_gks not in (1, 2):\n        raise ValueError("minimum_goalkeepers_at_or_below_price must be 1 or 2.")\n\n    payload = {\n        "gw_from": as_int(gw_from, "gw_from"),\n        "gw_to": as_int(gw_to, "gw_to"),\n        "candidate_chip_gameweeks": requested_gameweeks,\n        "excluded_player_names": parse_names(excluded_player_names_text),\n        "excluded_player_ids": [],\n        "minimum_bench_spend": as_float(minimum_bench_spend, "minimum_bench_spend"),\n        "budget": as_float(budget, "budget"),\n        "minimum_money_in_bank": as_float(minimum_money_in_bank, "minimum_money_in_bank"),\n        "goalkeeper_max_price": gk_cap,\n        "minimum_goalkeepers_at_or_below_price": minimum_cheap_gks,\n        "bench_order_policy": BENCH_ORDER_POLICY,\n        "suggest_always_benched_replacements": False,\n        "replacement_option_count": 3,\n        "replacement_max_xpts_drop": 1.0,\n        "save_names": [],\n        "delete_plan_ids": [],\n    }\n\n    request = urllib.request.Request(\n        \'https://zeus-teal.vercel.app/api/benchboost-compare\',\n        data=json.dumps(payload).encode("utf-8"),\n        headers={\n            "Content-Type": "application/json",\n            "Accept": "application/json",\n            "User-Agent": "ZEUS-Letta-Strict-Final/1.0",\n        },\n        method="POST",\n    )\n    try:\n        with urllib.request.urlopen(request, timeout=300) as response:\n            raw = response.read().decode("utf-8")\n    except urllib.error.HTTPError as exc:\n        detail = exc.read().decode("utf-8", errors="replace")\n        raise RuntimeError(f"ZEUS returned HTTP {exc.code}: {detail}") from exc\n    except urllib.error.URLError as exc:\n        raise RuntimeError(f"Could not reach ZEUS: {exc.reason}") from exc\n\n    try:\n        data = json.loads(raw)\n    except json.JSONDecodeError as exc:\n        raise RuntimeError(f"ZEUS returned invalid JSON: {raw[:2000]}") from exc\n    if data.get("ok") is not True:\n        raise RuntimeError(json.dumps(data, ensure_ascii=False, sort_keys=True))\n\n    builds = data.get("builds") or []\n    returned_gameweeks = sorted(as_int(build.get("chip_gw"), "returned chip_gw") for build in builds)\n    if returned_gameweeks != sorted(requested_gameweeks):\n        raise RuntimeError(\n            f"Candidate gameweek mismatch: requested {sorted(requested_gameweeks)}, "\n            f"returned {returned_gameweeks}."\n        )\n    if len(builds) != 2:\n        raise RuntimeError(f"Expected two builds, received {len(builds)}.")\n    if data.get("exclusions_verified_absent_from_all_builds") is not True:\n        raise RuntimeError("ZEUS did not prove hard exclusions absent from all builds.")\n\n    excluded_ids = {int(value) for value in (data.get("excluded_player_ids") or [])}\n    composition = {"GKP": 2, "DEF": 5, "MID": 5, "FWD": 3}\n    for build in builds:\n        players = build.get("players") or []\n        if len(players) != 15:\n            raise RuntimeError(f"GW{build.get(\'chip_gw\')} build contains {len(players)} players, expected 15.")\n        player_ids = [int(player.get("fpl_id")) for player in players]\n        if len(set(player_ids)) != 15:\n            raise RuntimeError(f"GW{build.get(\'chip_gw\')} build does not contain 15 unique player IDs.")\n        counts = {position: sum(1 for player in players if player.get("position") == position)\n                  for position in composition}\n        if counts != composition:\n            raise RuntimeError(\n                f"GW{build.get(\'chip_gw\')} composition is {counts}, expected {composition}."\n            )\n        if excluded_ids.intersection(player_ids):\n            raise RuntimeError(\n                f"GW{build.get(\'chip_gw\')} contains excluded IDs "\n                f"{sorted(excluded_ids.intersection(player_ids))}."\n            )\n        cheap_goalkeepers = [\n            player for player in players\n            if player.get("position") == "GKP" and float(player.get("price")) <= gk_cap + 1e-9\n        ]\n        if len(cheap_goalkeepers) < minimum_cheap_gks:\n            raise RuntimeError(\n                f"GW{build.get(\'chip_gw\')} has only {len(cheap_goalkeepers)} goalkeeper(s) "\n                f"at £{gk_cap:.1f}m or less."\n            )\n        constraints = build.get("constraints") or {}\n        if constraints.get("goalkeeper_price_constraint_enabled") is not True:\n            raise RuntimeError(\n                f"GW{build.get(\'chip_gw\')} returned goalkeeper_price_constraint_enabled != true."\n            )\n        if abs(float(constraints.get("goalkeeper_max_price")) - gk_cap) > 1e-9:\n            raise RuntimeError(f"GW{build.get(\'chip_gw\')} returned the wrong goalkeeper price cap.")\n\n        fixed_ids = set(player_ids)\n        weekly = build.get("weekly") or []\n        expected_weeks = list(range(payload["gw_from"], payload["gw_to"] + 1))\n        if [int(week.get("gw")) for week in weekly] != expected_weeks:\n            raise RuntimeError(f"GW{build.get(\'chip_gw\')} returned an incomplete weekly range.")\n        for week in weekly:\n            starters = week.get("starters") or []\n            bench = week.get("bench") or []\n            if len(starters) != 11 or len(bench) != 4:\n                raise RuntimeError(\n                    f"GW{week.get(\'gw\')} must contain 11 starters and four bench players."\n                )\n            weekly_ids = {int(player.get("fpl_id")) for player in starters + bench}\n            if weekly_ids != fixed_ids:\n                raise RuntimeError(f"GW{week.get(\'gw\')} does not use the fixed 15-player squad.")\n            if bench[0].get("position") != "GKP":\n                raise RuntimeError(f"GW{week.get(\'gw\')} backup goalkeeper is not first on the bench.")\n            if any(player.get("position") == "GKP" for player in bench[1:]):\n                raise RuntimeError(f"GW{week.get(\'gw\')} contains a goalkeeper in an outfield bench slot.")\n            outfield_xpts = [float(player.get("xpts", 0)) for player in bench[1:]]\n            if any(outfield_xpts[index] + 1e-9 < outfield_xpts[index + 1]\n                   for index in range(len(outfield_xpts) - 1)):\n                raise RuntimeError(f"GW{week.get(\'gw\')} outfield bench is not descending by xPTS.")\n            if week.get("bench_order_policy") != BENCH_ORDER_POLICY:\n                raise RuntimeError(f"GW{week.get(\'gw\')} returned the wrong bench-order policy.")\n            if float(week.get("bench_cost", 0)) + 1e-9 < payload["minimum_bench_spend"]:\n                raise RuntimeError(f"GW{week.get(\'gw\')} bench spend is below the requested minimum.")\n\n        solver = build.get("solver") or {}\n        if not (\n            solver.get("engine") == "HiGHS"\n            and solver.get("status") == "OPTIMAL"\n            and solver.get("optimality_proven") is True\n            and float(solver.get("mip_gap")) == 0\n            and float(solver.get("requested_mip_rel_gap")) == 0\n            and float(solver.get("requested_mip_abs_gap")) == 0\n            and solver.get("timeout_used") is False\n            and solver.get("fallback_used") is False\n        ):\n            raise RuntimeError(f"GW{build.get(\'chip_gw\')} is missing the exact HiGHS proof.")\n        if (build.get("objective") or {}).get("arithmetic_verified") is not True:\n            raise RuntimeError(f"GW{build.get(\'chip_gw\')} arithmetic proof failed.")\n\n    if data.get("saved") not in ([], None):\n        raise RuntimeError("Strict read-only tool unexpectedly saved a plan.")\n    if data.get("deleted") not in ([], None):\n        raise RuntimeError("Strict read-only tool unexpectedly deleted a plan.")\n    report = data.get("report_markdown")\n    if not isinstance(report, str) or not report.strip():\n        raise RuntimeError("ZEUS returned no report_markdown.")\n    if "Goalkeeper price control: OFF" in report:\n        raise RuntimeError("The report incorrectly says the goalkeeper price control is off.")\n\n    return (\n        "<!-- ZEUS_FINAL_REPORT: output everything below verbatim; do not analyse, "\n        "summarise, verify, reconstruct, call another FPL tool, or bypass this result. -->\\n"\n        + report\n    )'
FRESH_SOURCE = 'def get_fpl_benchboost_squad_strict(\n    gw_from: int = 1,\n    gw_to: int = 3,\n    chip_gw: int = 1,\n    excluded_player_names_text: str = "",\n    minimum_bench_spend: float = 16.5,\n    budget: float = 100.0,\n    minimum_money_in_bank: float = 0.0,\n    goalkeeper_max_price: float = 4.5,\n    minimum_goalkeepers_at_or_below_price: int = 1,\n) -> str:\n    """Return one independently optimised, read-only ZEUS Bench Boost report verbatim."""\n    import json\n    import urllib.error\n    import urllib.request\n\n    BENCH_ORDER_POLICY = \'backup_gkp_first_then_outfield_descending_xpts\'\n\n    def unwrap(value):\n        if value is None or isinstance(value, (str, int, float, bool)):\n            return value\n        if isinstance(value, (list, tuple, set)):\n            return value\n        if isinstance(value, dict):\n            for key in ("value", "root", "gameweek", "gw", "name", "label", "id"):\n                if key in value:\n                    return unwrap(value[key])\n        for attribute in ("value", "root", "gameweek", "gw", "name", "label", "id"):\n            try:\n                candidate = getattr(value, attribute)\n            except Exception:\n                continue\n            if candidate is not value:\n                return unwrap(candidate)\n        return str(value)\n\n    def as_int(value, label):\n        raw = unwrap(value)\n        try:\n            return int(raw)\n        except (TypeError, ValueError) as exc:\n            raise ValueError(f"{label} must be an integer, received {raw!r}.") from exc\n\n    def as_float(value, label):\n        raw = unwrap(value)\n        try:\n            parsed = float(raw)\n        except (TypeError, ValueError) as exc:\n            raise ValueError(f"{label} must be numeric, received {raw!r}.") from exc\n        if parsed != parsed or parsed in (float("inf"), float("-inf")):\n            raise ValueError(f"{label} must be finite.")\n        return parsed\n\n    def parse_names(value):\n        raw = unwrap(value)\n        if raw is None:\n            return []\n        if isinstance(raw, (list, tuple, set)):\n            candidates = [str(unwrap(item)) for item in raw]\n        else:\n            text = str(raw).replace("\\r", "\\n")\n            for separator in (";", "|", "\\n"):\n                text = text.replace(separator, ",")\n            candidates = text.split(",")\n        names = []\n        for candidate in candidates:\n            cleaned = str(candidate).strip().lstrip("-•* ").strip()\n            if cleaned and cleaned not in names:\n                names.append(cleaned)\n        return names\n\n    requested_chip_gw = as_int(chip_gw, "chip_gw")\n    gk_cap = as_float(goalkeeper_max_price, "goalkeeper_max_price")\n    minimum_cheap_gks = as_int(\n        minimum_goalkeepers_at_or_below_price,\n        "minimum_goalkeepers_at_or_below_price",\n    )\n    payload = {\n        "gw_from": as_int(gw_from, "gw_from"),\n        "gw_to": as_int(gw_to, "gw_to"),\n        "candidate_chip_gameweeks": [requested_chip_gw],\n        "excluded_player_names": parse_names(excluded_player_names_text),\n        "excluded_player_ids": [],\n        "minimum_bench_spend": as_float(minimum_bench_spend, "minimum_bench_spend"),\n        "budget": as_float(budget, "budget"),\n        "minimum_money_in_bank": as_float(minimum_money_in_bank, "minimum_money_in_bank"),\n        "goalkeeper_max_price": gk_cap,\n        "minimum_goalkeepers_at_or_below_price": minimum_cheap_gks,\n        "bench_order_policy": BENCH_ORDER_POLICY,\n        "suggest_always_benched_replacements": False,\n        "replacement_option_count": 3,\n        "replacement_max_xpts_drop": 1.0,\n        "save_names": [],\n        "delete_plan_ids": [],\n    }\n\n    request = urllib.request.Request(\n        \'https://zeus-teal.vercel.app/api/benchboost-compare\',\n        data=json.dumps(payload).encode("utf-8"),\n        headers={\n            "Content-Type": "application/json",\n            "Accept": "application/json",\n            "User-Agent": "ZEUS-Letta-Strict-Final/1.0",\n        },\n        method="POST",\n    )\n    try:\n        with urllib.request.urlopen(request, timeout=300) as response:\n            raw = response.read().decode("utf-8")\n    except urllib.error.HTTPError as exc:\n        detail = exc.read().decode("utf-8", errors="replace")\n        raise RuntimeError(f"ZEUS returned HTTP {exc.code}: {detail}") from exc\n    except urllib.error.URLError as exc:\n        raise RuntimeError(f"Could not reach ZEUS: {exc.reason}") from exc\n\n    try:\n        data = json.loads(raw)\n    except json.JSONDecodeError as exc:\n        raise RuntimeError(f"ZEUS returned invalid JSON: {raw[:2000]}") from exc\n    if data.get("ok") is not True:\n        raise RuntimeError(json.dumps(data, ensure_ascii=False, sort_keys=True))\n    builds = data.get("builds") or []\n    if len(builds) != 1 or int(builds[0].get("chip_gw")) != requested_chip_gw:\n        raise RuntimeError("ZEUS returned the wrong single Bench Boost scenario.")\n    build = builds[0]\n    players = build.get("players") or []\n    composition = {"GKP": 2, "DEF": 5, "MID": 5, "FWD": 3}\n    counts = {position: sum(1 for player in players if player.get("position") == position)\n              for position in composition}\n    if len(players) != 15 or len({int(player.get("fpl_id")) for player in players}) != 15:\n        raise RuntimeError("ZEUS did not return 15 unique players.")\n    if counts != composition:\n        raise RuntimeError(f"ZEUS returned composition {counts}, expected {composition}.")\n    cheap_goalkeepers = [\n        player for player in players\n        if player.get("position") == "GKP" and float(player.get("price")) <= gk_cap + 1e-9\n    ]\n    if len(cheap_goalkeepers) < minimum_cheap_gks:\n        raise RuntimeError("ZEUS did not preserve the goalkeeper price constraint.")\n    constraints = build.get("constraints") or {}\n    if constraints.get("goalkeeper_price_constraint_enabled") is not True:\n        raise RuntimeError("ZEUS reported the goalkeeper price constraint as disabled.")\n    solver = build.get("solver") or {}\n    if not (\n        solver.get("engine") == "HiGHS"\n        and solver.get("status") == "OPTIMAL"\n        and solver.get("optimality_proven") is True\n        and float(solver.get("mip_gap")) == 0\n        and solver.get("timeout_used") is False\n        and solver.get("fallback_used") is False\n    ):\n        raise RuntimeError("ZEUS did not return the exact HiGHS proof.")\n    if data.get("saved") not in ([], None) or data.get("deleted") not in ([], None):\n        raise RuntimeError("Strict read-only tool attempted a plan mutation.")\n    report = data.get("report_markdown")\n    if not isinstance(report, str) or not report.strip():\n        raise RuntimeError("ZEUS returned no report_markdown.")\n    if "Goalkeeper price control: OFF" in report:\n        raise RuntimeError("The report incorrectly says the goalkeeper price control is off.")\n    return (\n        "<!-- ZEUS_FINAL_REPORT: output everything below verbatim; do not analyse, "\n        "summarise, verify, reconstruct, call another FPL tool, or bypass this result. -->\\n"\n        + report\n    )'
COMPARE_ARGS = {'title': 'CompareBenchBoostSquadsStrictFinalArgs', 'type': 'object', 'properties': {'gw_from': {'type': 'integer', 'minimum': 1, 'maximum': 8, 'default': 1}, 'gw_to': {'type': 'integer', 'minimum': 1, 'maximum': 8, 'default': 3}, 'bench_boost_gw_a': {'type': 'integer', 'minimum': 1, 'maximum': 8, 'default': 1, 'description': 'Bench Boost gameweek for independently optimised Squad A.'}, 'bench_boost_gw_b': {'type': 'integer', 'minimum': 1, 'maximum': 8, 'default': 2, 'description': 'Bench Boost gameweek for independently optimised Squad B.'}, 'excluded_player_names_text': {'type': 'string', 'default': '', 'description': 'Comma-, semicolon- or newline-separated hard-excluded player names. Use Name (TEAM) when needed.'}, 'minimum_bench_spend': {'type': 'number', 'minimum': 0, 'default': 16.5}, 'budget': {'type': 'number', 'exclusiveMinimum': 0, 'default': 100.0}, 'minimum_money_in_bank': {'type': 'number', 'minimum': 0, 'default': 0.0}, 'goalkeeper_max_price': {'type': 'number', 'exclusiveMinimum': 0, 'default': 4.5, 'description': 'Hard goalkeeper price cap. At least the requested number of GKs must be at or below this price.'}, 'minimum_goalkeepers_at_or_below_price': {'type': 'integer', 'minimum': 1, 'maximum': 2, 'default': 1}}, 'additionalProperties': False}
FRESH_ARGS = {'title': 'GetBenchBoostSquadStrictFinalArgs', 'type': 'object', 'properties': {'gw_from': {'type': 'integer', 'minimum': 1, 'maximum': 8, 'default': 1}, 'gw_to': {'type': 'integer', 'minimum': 1, 'maximum': 8, 'default': 3}, 'excluded_player_names_text': {'type': 'string', 'default': '', 'description': 'Comma-, semicolon- or newline-separated hard-excluded player names. Use Name (TEAM) when needed.'}, 'minimum_bench_spend': {'type': 'number', 'minimum': 0, 'default': 16.5}, 'budget': {'type': 'number', 'exclusiveMinimum': 0, 'default': 100.0}, 'minimum_money_in_bank': {'type': 'number', 'minimum': 0, 'default': 0.0}, 'goalkeeper_max_price': {'type': 'number', 'exclusiveMinimum': 0, 'default': 4.5, 'description': 'Hard goalkeeper price cap. At least the requested number of GKs must be at or below this price.'}, 'minimum_goalkeepers_at_or_below_price': {'type': 'integer', 'minimum': 1, 'maximum': 2, 'default': 1}, 'chip_gw': {'type': 'integer', 'minimum': 1, 'maximum': 8, 'default': 1, 'description': 'Bench Boost gameweek for this independently optimised squad.'}}, 'additionalProperties': False}

RETRYABLE = (
    "HTTP 429", "HTTP 500", "HTTP 502", "HTTP 503", "HTTP 504",
    "HTTP 520", "HTTP 521", "HTTP 522", "HTTP 523", "HTTP 524",
    "rate limit", "timed out", "timeout", "temporarily unavailable",
    "connection reset", "connection refused",
)

def api_request(api_key, method, path, body=None, timeout=420):
    marker = "__ZEUS_HTTP_STATUS__:"
    command = [
        "curl", "--silent", "--show-error", "--location",
        "--max-time", str(timeout), "--request", method, "--url", BASE + path,
        "--header", f"Authorization: Bearer {api_key}",
        "--header", "Content-Type: application/json",
        "--header", "Accept: application/json",
        "--write-out", f"\n{marker}%{{http_code}}",
    ]
    if body is not None:
        command.extend(["--data-binary", json.dumps(body, separators=(",", ":"))])
    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or completed.stdout.strip())
    output = completed.stdout
    if marker not in output:
        raise RuntimeError(f"Unreadable response: {output[:1000]}")
    raw, status_text = output.rsplit(marker, 1)
    status = int(status_text.strip())
    raw = raw.rstrip("\n")
    if not 200 <= status < 300:
        raise RuntimeError(f"{method} {path} failed with HTTP {status}: {raw}")
    return json.loads(raw) if raw.strip() else None

def request_with_backoff(api_key, method, path, body=None, timeout=420):
    delays = (0, 5, 15, 30, 60, 120)
    last_error = None
    for attempt, delay in enumerate(delays, start=1):
        if delay:
            print(f"Temporary Letta failure. Waiting {delay}s before retry {attempt}/{len(delays)}...")
            time.sleep(delay)
        try:
            return api_request(api_key, method, path, body, timeout)
        except RuntimeError as exc:
            last_error = exc
            if not any(marker.lower() in str(exc).lower() for marker in RETRYABLE):
                raise
    raise RuntimeError(f"Letta request still failed after retries: {last_error}")

def assert_primitive_schema(schema, label):
    forbidden = []
    def walk(value, path="root"):
        if isinstance(value, dict):
            if value.get("type") == "array" or isinstance(value.get("type"), list):
                forbidden.append(path + ".type")
            if "enum" in value:
                forbidden.append(path + ".enum")
            for key, child in value.items():
                walk(child, path + "." + key)
        elif isinstance(value, list):
            for index, child in enumerate(value):
                walk(child, f"{path}[{index}]")
    walk(schema)
    if forbidden:
        raise RuntimeError(f"{label} contains non-primitive schema constructs: {forbidden}")

def patch_tool(api_key, tool_id, name, source, schema, description):
    payload = {
        "source_code": source,
        "source_type": "python",
        "description": description,
        "json_schema": {"name": name, "description": description, "parameters": schema},
        "args_json_schema": schema,
        "default_requires_approval": False,
        "enable_parallel_execution": False,
        "return_char_limit": 200000,
        "tags": ["zeus", "fpl", "benchboost", "strict", "final"],
    }
    updated = request_with_backoff(api_key, "PATCH", f"/v1/tools/{urllib.parse.quote(tool_id)}", payload)
    if not isinstance(updated, dict) or updated.get("id") != tool_id:
        raise RuntimeError(f"Unexpected PATCH response for {name}: {updated!r}")
    try:
        request_with_backoff(
            api_key,
            "PATCH",
            f"/v1/agents/{urllib.parse.quote(AGENT_ID)}/tools/attach/{urllib.parse.quote(tool_id)}",
            {},
        )
    except RuntimeError as exc:
        if "409" not in str(exc) and "already" not in str(exc).lower():
            raise
    verified = request_with_backoff(api_key, "GET", f"/v1/tools/{urllib.parse.quote(tool_id)}")
    if not isinstance(verified, dict):
        raise RuntimeError(f"Could not verify {name}.")
    verified_source = str(verified.get("source_code") or "")
    required_source_fragments = (
        "goalkeeper_max_price: float = 4.5",
        '"goalkeeper_max_price": gk_cap',
        '"minimum_goalkeepers_at_or_below_price": minimum_cheap_gks',
        '"bench_order_policy": BENCH_ORDER_POLICY',
        '"save_names": []',
        '"delete_plan_ids": []',
    )
    missing_source = [fragment for fragment in required_source_fragments if fragment not in verified_source]
    if missing_source:
        raise RuntimeError(f"{name} source verification failed: {missing_source}")
    verified_schema = verified.get("args_json_schema") or {}
    expected_properties = schema.get("properties") or {}
    actual_properties = verified_schema.get("properties") or {}
    for field, expected in expected_properties.items():
        actual = actual_properties.get(field) or {}
        if actual.get("type") != expected.get("type"):
            raise RuntimeError(
                f"{name} schema field {field} has type {actual.get('type')!r}, "
                f"expected {expected.get('type')!r}."
            )
    assert_primitive_schema(verified_schema, name + " verified schema")
    return verified

def main():
    global AGENT_ID
    assert_primitive_schema(COMPARE_ARGS, "comparison schema")
    assert_primitive_schema(FRESH_ARGS, "single-squad schema")
    compile(COMPARE_SOURCE, "compare_and_save_benchboost_squads_strict", "exec")
    compile(FRESH_SOURCE, "get_fpl_benchboost_squad_strict", "exec")

    print("ZEUS final strict Letta updater")
    print("================================")
    print("Primitive-only schemas; exact two-GK validation; £4.5m GK control enabled by default.")
    print("No other tools, memories or messages are changed.\n")
    api_key = getpass.getpass("Paste your Letta API key (hidden): ").strip()
    if not api_key:
        raise RuntimeError("No API key supplied.")
    AGENT_ID = input(f"Agent ID [{DEFAULT_AGENT_ID}]: ").strip() or DEFAULT_AGENT_ID

    definitions = [
        (
            KNOWN_TOOLS["compare_and_save_benchboost_squads_strict"],
            "compare_and_save_benchboost_squads_strict",
            COMPARE_SOURCE,
            COMPARE_ARGS,
            "Run two independent read-only ZEUS Bench Boost optimisations. Use bench_boost_gw_a and bench_boost_gw_b, not a candidate array. Return report_markdown verbatim. The tool itself enforces exactly two GKs, the £4.5m goalkeeper rule, legal weekly lineups, ordered benches, exclusions and exact HiGHS proof.",
        ),
        (
            KNOWN_TOOLS["get_fpl_benchboost_squad_strict"],
            "get_fpl_benchboost_squad_strict",
            FRESH_SOURCE,
            FRESH_ARGS,
            "Run one independent read-only ZEUS Bench Boost optimisation. Return report_markdown verbatim. The tool itself enforces exactly two GKs, the £4.5m goalkeeper rule, legal weekly lineups, ordered benches, exclusions and exact HiGHS proof.",
        ),
    ]

    updated = []
    for tool_id, name, source, schema, description in definitions:
        print(f"Updating: {name} [{tool_id}]")
        updated.append(patch_tool(api_key, tool_id, name, source, schema, description))
        time.sleep(3)

    print("Recompiling the agent...")
    request_with_backoff(
        api_key,
        "POST",
        f"/v1/agents/{urllib.parse.quote(AGENT_ID)}/recompile?update_timestamp=true",
        None,
    )
    print("\nSUCCESS")
    for tool in updated:
        print(f"- Updated in place: {tool.get('name')} [{tool.get('id')}]")
    print("- Candidate array wrappers removed")
    print("- Exactly two GKs validated")
    print("- £4.5m goalkeeper control enabled and verified")
    print("- Read-only mode enforced")
    print("- Agent recompiled")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nCancelled.")
        sys.exit(130)
    except Exception as exc:
        print(f"\nERROR: {exc}", file=sys.stderr)
        sys.exit(1)
