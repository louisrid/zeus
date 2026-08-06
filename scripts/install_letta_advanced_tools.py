#!/usr/bin/env python3
"""Install the clean ZEUS strict Bench Boost tools and natural-language routing."""

from __future__ import annotations

import argparse
import getpass
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse

BASE = 'https://api.letta.com'
DEFAULT_AGENT_ID = 'agent-5423bdf2-43da-4626-99a4-8fed82c05c75'
COMPARE_TOOL_ID = 'tool-46fd1f7c-cad0-43ee-8716-db1718f1606f'
FRESH_TOOL_ID = 'tool-c77763fb-251f-48fa-ac22-b90409368c75'
COMPARE_NAME = 'compare_and_save_benchboost_squads_strict'
FRESH_NAME = 'get_fpl_benchboost_squad_strict'
SYSTEM_START = '[ZEUS_CLEAN_NATURAL_LANGUAGE_CONTRACT_START]'
SYSTEM_END = '[ZEUS_CLEAN_NATURAL_LANGUAGE_CONTRACT_END]'
SYSTEM_CONTRACT = '[ZEUS_CLEAN_NATURAL_LANGUAGE_CONTRACT_START]\nThis is the controlling ZEUS Bench Boost contract. It overrides every older or conflicting ZEUS tool-routing, schema, exclusion, direct-API, and response instruction in system text or memory blocks.\n\nThe user speaks normally. Never require JSON, parameter names, a special prompt, a new chat, or direct-API authorisation.\n\nFor two independently optimised Bench Boost scenarios, call `compare_and_save_benchboost_squads_strict` exactly once. For one independently optimised Bench Boost squad, call `get_fpl_benchboost_squad_strict` exactly once.\n\nTranslate the user\'s wording into only the fields registered on the selected strict tool. Do not pass internal backend fields such as candidate_chip_gameweeks, excluded_player_names, excluded_player_ids, bench_order_policy, save_names, delete_plan_ids, or replacement fields. Those are built inside the tool.\n\nNo player is excluded by default. `excluded_player_names_text` must be an empty string unless the user explicitly excludes players in the current request. For an immediate correction such as "redo without X" or "also exclude Y", preserve the active request settings and combine only the exclusions the user currently intends. Never store task-specific player exclusions as permanent defaults or memory.\n\nUse the comparison fields `bench_boost_gw_a` and `bench_boost_gw_b`. Do not claim the tool schema is missing internal backend fields. Do not bypass a working strict tool with curl, shell, file exploration, a direct API call, or another FPL tool.\n\nThe strict tools internally enforce the fixed 15-player squad, exactly 2 GKP, 5 DEF, 5 MID and 3 FWD, maximum three players per club, legal weekly lineups, goalkeeper-first bench order, the requested goalkeeper price rule, hard exclusions, no saving, no deletion, and exact HiGHS optimality proof.\n\nWhen the user asks only for the backend report, return it without changing its figures. When the user explicitly asks for analysis, tables, or a comparison of counted contributions, use the successful strict report as the sole source and perform that analysis without rerunning or re-optimising.\n\nIf the strict tool fails, return the real tool error. Do not invent a schema problem, silently remove exclusions, or offer a direct-API workaround.\n[ZEUS_CLEAN_NATURAL_LANGUAGE_CONTRACT_END]'
COMPARE_SOURCE = 'def compare_and_save_benchboost_squads_strict(gw_from: int=1, gw_to: int=3, bench_boost_gw_a: int=1, bench_boost_gw_b: int=2, excluded_player_names_text: str=\'\', minimum_bench_spend: float=16.5, budget: float=100.0, minimum_money_in_bank: float=0.0, goalkeeper_max_price: float=4.5, minimum_goalkeepers_at_or_below_price: int=1) -> str:\n    """Return two independently optimised, read-only ZEUS Bench Boost reports verbatim."""\n    import json\n    import urllib.error\n    import urllib.request\n    BENCH_ORDER_POLICY = \'backup_gkp_first_then_outfield_descending_xpts\'\n\n    def unwrap(value):\n        if value is None or isinstance(value, (str, int, float, bool)):\n            return value\n        if isinstance(value, (list, tuple, set)):\n            return value\n        if isinstance(value, dict):\n            for key in (\'value\', \'root\', \'gameweek\', \'gw\', \'name\', \'label\', \'id\'):\n                if key in value:\n                    return unwrap(value[key])\n        for attribute in (\'value\', \'root\', \'gameweek\', \'gw\', \'name\', \'label\', \'id\'):\n            try:\n                candidate = getattr(value, attribute)\n            except Exception:\n                continue\n            if candidate is not value:\n                return unwrap(candidate)\n        return str(value)\n\n    def as_int(value, label):\n        raw = unwrap(value)\n        try:\n            return int(raw)\n        except (TypeError, ValueError) as exc:\n            raise ValueError(f\'{label} must be an integer, received {raw!r}.\') from exc\n\n    def as_float(value, label):\n        raw = unwrap(value)\n        try:\n            parsed = float(raw)\n        except (TypeError, ValueError) as exc:\n            raise ValueError(f\'{label} must be numeric, received {raw!r}.\') from exc\n        if parsed != parsed or parsed in (float(\'inf\'), float(\'-inf\')):\n            raise ValueError(f\'{label} must be finite.\')\n        return parsed\n\n    def parse_names(value):\n        raw = unwrap(value)\n        if raw is None:\n            return []\n        if isinstance(raw, (list, tuple, set)):\n            candidates = [str(unwrap(item)) for item in raw]\n        else:\n            text = str(raw).replace(\'\\r\', \'\\n\')\n            for separator in (\';\', \'|\', \'\\n\'):\n                text = text.replace(separator, \',\')\n            candidates = text.split(\',\')\n        names = []\n        for candidate in candidates:\n            cleaned = str(candidate).strip().lstrip(\'-•* \').strip()\n            if cleaned and cleaned not in names:\n                names.append(cleaned)\n        return names\n    requested_exclusions = parse_names(excluded_player_names_text)\n    requested_gameweeks = [as_int(bench_boost_gw_a, \'bench_boost_gw_a\'), as_int(bench_boost_gw_b, \'bench_boost_gw_b\')]\n    if len(set(requested_gameweeks)) != 2:\n        raise ValueError(\'bench_boost_gw_a and bench_boost_gw_b must be different gameweeks.\')\n    gk_cap = as_float(goalkeeper_max_price, \'goalkeeper_max_price\')\n    minimum_cheap_gks = as_int(minimum_goalkeepers_at_or_below_price, \'minimum_goalkeepers_at_or_below_price\')\n    if gk_cap <= 0:\n        raise ValueError(\'goalkeeper_max_price must be positive.\')\n    if minimum_cheap_gks not in (1, 2):\n        raise ValueError(\'minimum_goalkeepers_at_or_below_price must be 1 or 2.\')\n    payload = {\'gw_from\': as_int(gw_from, \'gw_from\'), \'gw_to\': as_int(gw_to, \'gw_to\'), \'candidate_chip_gameweeks\': requested_gameweeks, \'excluded_player_names\': requested_exclusions, \'excluded_player_ids\': [], \'minimum_bench_spend\': as_float(minimum_bench_spend, \'minimum_bench_spend\'), \'budget\': as_float(budget, \'budget\'), \'minimum_money_in_bank\': as_float(minimum_money_in_bank, \'minimum_money_in_bank\'), \'goalkeeper_max_price\': gk_cap, \'minimum_goalkeepers_at_or_below_price\': minimum_cheap_gks, \'bench_order_policy\': BENCH_ORDER_POLICY, \'suggest_always_benched_replacements\': False, \'replacement_option_count\': 3, \'replacement_max_xpts_drop\': 1.0, \'save_names\': [], \'delete_plan_ids\': []}\n    request = urllib.request.Request(\'https://zeus-teal.vercel.app/api/benchboost-compare\', data=json.dumps(payload).encode(\'utf-8\'), headers={\'Content-Type\': \'application/json\', \'Accept\': \'application/json\', \'User-Agent\': \'ZEUS-Letta-Strict-Final/1.0\'}, method=\'POST\')\n    try:\n        with urllib.request.urlopen(request, timeout=300) as response:\n            raw = response.read().decode(\'utf-8\')\n    except urllib.error.HTTPError as exc:\n        detail = exc.read().decode(\'utf-8\', errors=\'replace\')\n        raise RuntimeError(f\'ZEUS returned HTTP {exc.code}: {detail}\') from exc\n    except urllib.error.URLError as exc:\n        raise RuntimeError(f\'Could not reach ZEUS: {exc.reason}\') from exc\n    try:\n        data = json.loads(raw)\n    except json.JSONDecodeError as exc:\n        raise RuntimeError(f\'ZEUS returned invalid JSON: {raw[:2000]}\') from exc\n    if data.get(\'ok\') is not True:\n        raise RuntimeError(json.dumps(data, ensure_ascii=False, sort_keys=True))\n    builds = data.get(\'builds\') or []\n    returned_gameweeks = sorted((as_int(build.get(\'chip_gw\'), \'returned chip_gw\') for build in builds))\n    if returned_gameweeks != sorted(requested_gameweeks):\n        raise RuntimeError(f\'Candidate gameweek mismatch: requested {sorted(requested_gameweeks)}, returned {returned_gameweeks}.\')\n    if len(builds) != 2:\n        raise RuntimeError(f\'Expected two builds, received {len(builds)}.\')\n    if data.get(\'exclusions_verified_absent_from_all_builds\') is not True:\n        raise RuntimeError(\'ZEUS did not prove hard exclusions absent from all builds.\')\n    excluded_ids = {int(value) for value in data.get(\'excluded_player_ids\') or []}\n    if len(excluded_ids) != len(requested_exclusions):\n        raise RuntimeError(f\'ZEUS resolved {len(excluded_ids)} exclusions, but {len(requested_exclusions)} were requested: {requested_exclusions}\')\n    composition = {\'GKP\': 2, \'DEF\': 5, \'MID\': 5, \'FWD\': 3}\n    for build in builds:\n        players = build.get(\'players\') or []\n        if len(players) != 15:\n            raise RuntimeError(f"GW{build.get(\'chip_gw\')} build contains {len(players)} players, expected 15.")\n        player_ids = [int(player.get(\'fpl_id\')) for player in players]\n        if len(set(player_ids)) != 15:\n            raise RuntimeError(f"GW{build.get(\'chip_gw\')} build does not contain 15 unique player IDs.")\n        counts = {position: sum((1 for player in players if player.get(\'position\') == position)) for position in composition}\n        if counts != composition:\n            raise RuntimeError(f"GW{build.get(\'chip_gw\')} composition is {counts}, expected {composition}.")\n        if excluded_ids.intersection(player_ids):\n            raise RuntimeError(f"GW{build.get(\'chip_gw\')} contains excluded IDs {sorted(excluded_ids.intersection(player_ids))}.")\n        cheap_goalkeepers = [player for player in players if player.get(\'position\') == \'GKP\' and float(player.get(\'price\')) <= gk_cap + 1e-09]\n        if len(cheap_goalkeepers) < minimum_cheap_gks:\n            raise RuntimeError(f"GW{build.get(\'chip_gw\')} has only {len(cheap_goalkeepers)} goalkeeper(s) at £{gk_cap:.1f}m or less.")\n        constraints = build.get(\'constraints\') or {}\n        if constraints.get(\'goalkeeper_price_constraint_enabled\') is not True:\n            raise RuntimeError(f"GW{build.get(\'chip_gw\')} returned goalkeeper_price_constraint_enabled != true.")\n        if abs(float(constraints.get(\'goalkeeper_max_price\')) - gk_cap) > 1e-09:\n            raise RuntimeError(f"GW{build.get(\'chip_gw\')} returned the wrong goalkeeper price cap.")\n        fixed_ids = set(player_ids)\n        weekly = build.get(\'weekly\') or []\n        expected_weeks = list(range(payload[\'gw_from\'], payload[\'gw_to\'] + 1))\n        if [int(week.get(\'gw\')) for week in weekly] != expected_weeks:\n            raise RuntimeError(f"GW{build.get(\'chip_gw\')} returned an incomplete weekly range.")\n        for week in weekly:\n            starters = week.get(\'starters\') or []\n            bench = week.get(\'bench\') or []\n            if len(starters) != 11 or len(bench) != 4:\n                raise RuntimeError(f"GW{week.get(\'gw\')} must contain 11 starters and four bench players.")\n            weekly_ids = {int(player.get(\'fpl_id\')) for player in starters + bench}\n            if weekly_ids != fixed_ids:\n                raise RuntimeError(f"GW{week.get(\'gw\')} does not use the fixed 15-player squad.")\n            if bench[0].get(\'position\') != \'GKP\':\n                raise RuntimeError(f"GW{week.get(\'gw\')} backup goalkeeper is not first on the bench.")\n            if any((player.get(\'position\') == \'GKP\' for player in bench[1:])):\n                raise RuntimeError(f"GW{week.get(\'gw\')} contains a goalkeeper in an outfield bench slot.")\n            outfield_xpts = [float(player.get(\'xpts\', 0)) for player in bench[1:]]\n            if any((outfield_xpts[index] + 1e-09 < outfield_xpts[index + 1] for index in range(len(outfield_xpts) - 1))):\n                raise RuntimeError(f"GW{week.get(\'gw\')} outfield bench is not descending by xPTS.")\n            if week.get(\'bench_order_policy\') != BENCH_ORDER_POLICY:\n                raise RuntimeError(f"GW{week.get(\'gw\')} returned the wrong bench-order policy.")\n            if float(week.get(\'bench_cost\', 0)) + 1e-09 < payload[\'minimum_bench_spend\']:\n                raise RuntimeError(f"GW{week.get(\'gw\')} bench spend is below the requested minimum.")\n        solver = build.get(\'solver\') or {}\n        if not (solver.get(\'engine\') == \'HiGHS\' and solver.get(\'status\') == \'OPTIMAL\' and (solver.get(\'optimality_proven\') is True) and (float(solver.get(\'mip_gap\')) == 0) and (float(solver.get(\'requested_mip_rel_gap\')) == 0) and (float(solver.get(\'requested_mip_abs_gap\')) == 0) and (solver.get(\'timeout_used\') is False) and (solver.get(\'fallback_used\') is False)):\n            raise RuntimeError(f"GW{build.get(\'chip_gw\')} is missing the exact HiGHS proof.")\n        if (build.get(\'objective\') or {}).get(\'arithmetic_verified\') is not True:\n            raise RuntimeError(f"GW{build.get(\'chip_gw\')} arithmetic proof failed.")\n    if data.get(\'saved\') not in ([], None):\n        raise RuntimeError(\'Strict read-only tool unexpectedly saved a plan.\')\n    if data.get(\'deleted\') not in ([], None):\n        raise RuntimeError(\'Strict read-only tool unexpectedly deleted a plan.\')\n    report = data.get(\'report_markdown\')\n    if not isinstance(report, str) or not report.strip():\n        raise RuntimeError(\'ZEUS returned no report_markdown.\')\n    if \'Goalkeeper price control: OFF\' in report:\n        raise RuntimeError(\'The report incorrectly says the goalkeeper price control is off.\')\n    if requested_exclusions and \'Hard exclusions: none\' in report:\n        raise RuntimeError(\'The backend report dropped all requested hard exclusions.\')\n    missing_report_names = [name for name in requested_exclusions if name.split(\' (\', 1)[0] not in report]\n    if missing_report_names:\n        raise RuntimeError(f\'The backend report omitted requested exclusions: {missing_report_names}\')\n    return \'<!-- ZEUS_FINAL_REPORT: verified backend report follows. Return it unchanged unless the user explicitly requested analysis; then analyse this report without rerunning. -->\\n\' + report\n'
FRESH_SOURCE = 'def get_fpl_benchboost_squad_strict(gw_from: int=1, gw_to: int=3, chip_gw: int=1, excluded_player_names_text: str=\'\', minimum_bench_spend: float=16.5, budget: float=100.0, minimum_money_in_bank: float=0.0, goalkeeper_max_price: float=4.5, minimum_goalkeepers_at_or_below_price: int=1) -> str:\n    """Return one independently optimised, read-only ZEUS Bench Boost report verbatim."""\n    import json\n    import urllib.error\n    import urllib.request\n    BENCH_ORDER_POLICY = \'backup_gkp_first_then_outfield_descending_xpts\'\n\n    def unwrap(value):\n        if value is None or isinstance(value, (str, int, float, bool)):\n            return value\n        if isinstance(value, (list, tuple, set)):\n            return value\n        if isinstance(value, dict):\n            for key in (\'value\', \'root\', \'gameweek\', \'gw\', \'name\', \'label\', \'id\'):\n                if key in value:\n                    return unwrap(value[key])\n        for attribute in (\'value\', \'root\', \'gameweek\', \'gw\', \'name\', \'label\', \'id\'):\n            try:\n                candidate = getattr(value, attribute)\n            except Exception:\n                continue\n            if candidate is not value:\n                return unwrap(candidate)\n        return str(value)\n\n    def as_int(value, label):\n        raw = unwrap(value)\n        try:\n            return int(raw)\n        except (TypeError, ValueError) as exc:\n            raise ValueError(f\'{label} must be an integer, received {raw!r}.\') from exc\n\n    def as_float(value, label):\n        raw = unwrap(value)\n        try:\n            parsed = float(raw)\n        except (TypeError, ValueError) as exc:\n            raise ValueError(f\'{label} must be numeric, received {raw!r}.\') from exc\n        if parsed != parsed or parsed in (float(\'inf\'), float(\'-inf\')):\n            raise ValueError(f\'{label} must be finite.\')\n        return parsed\n\n    def parse_names(value):\n        raw = unwrap(value)\n        if raw is None:\n            return []\n        if isinstance(raw, (list, tuple, set)):\n            candidates = [str(unwrap(item)) for item in raw]\n        else:\n            text = str(raw).replace(\'\\r\', \'\\n\')\n            for separator in (\';\', \'|\', \'\\n\'):\n                text = text.replace(separator, \',\')\n            candidates = text.split(\',\')\n        names = []\n        for candidate in candidates:\n            cleaned = str(candidate).strip().lstrip(\'-•* \').strip()\n            if cleaned and cleaned not in names:\n                names.append(cleaned)\n        return names\n    requested_exclusions = parse_names(excluded_player_names_text)\n    requested_chip_gw = as_int(chip_gw, \'chip_gw\')\n    gk_cap = as_float(goalkeeper_max_price, \'goalkeeper_max_price\')\n    minimum_cheap_gks = as_int(minimum_goalkeepers_at_or_below_price, \'minimum_goalkeepers_at_or_below_price\')\n    payload = {\'gw_from\': as_int(gw_from, \'gw_from\'), \'gw_to\': as_int(gw_to, \'gw_to\'), \'candidate_chip_gameweeks\': [requested_chip_gw], \'excluded_player_names\': requested_exclusions, \'excluded_player_ids\': [], \'minimum_bench_spend\': as_float(minimum_bench_spend, \'minimum_bench_spend\'), \'budget\': as_float(budget, \'budget\'), \'minimum_money_in_bank\': as_float(minimum_money_in_bank, \'minimum_money_in_bank\'), \'goalkeeper_max_price\': gk_cap, \'minimum_goalkeepers_at_or_below_price\': minimum_cheap_gks, \'bench_order_policy\': BENCH_ORDER_POLICY, \'suggest_always_benched_replacements\': False, \'replacement_option_count\': 3, \'replacement_max_xpts_drop\': 1.0, \'save_names\': [], \'delete_plan_ids\': []}\n    request = urllib.request.Request(\'https://zeus-teal.vercel.app/api/benchboost-compare\', data=json.dumps(payload).encode(\'utf-8\'), headers={\'Content-Type\': \'application/json\', \'Accept\': \'application/json\', \'User-Agent\': \'ZEUS-Letta-Strict-Final/1.0\'}, method=\'POST\')\n    try:\n        with urllib.request.urlopen(request, timeout=300) as response:\n            raw = response.read().decode(\'utf-8\')\n    except urllib.error.HTTPError as exc:\n        detail = exc.read().decode(\'utf-8\', errors=\'replace\')\n        raise RuntimeError(f\'ZEUS returned HTTP {exc.code}: {detail}\') from exc\n    except urllib.error.URLError as exc:\n        raise RuntimeError(f\'Could not reach ZEUS: {exc.reason}\') from exc\n    try:\n        data = json.loads(raw)\n    except json.JSONDecodeError as exc:\n        raise RuntimeError(f\'ZEUS returned invalid JSON: {raw[:2000]}\') from exc\n    if data.get(\'ok\') is not True:\n        raise RuntimeError(json.dumps(data, ensure_ascii=False, sort_keys=True))\n    excluded_ids = {int(value) for value in data.get(\'excluded_player_ids\') or []}\n    if len(excluded_ids) != len(requested_exclusions):\n        raise RuntimeError(f\'ZEUS resolved {len(excluded_ids)} exclusions, but {len(requested_exclusions)} were requested: {requested_exclusions}\')\n    builds = data.get(\'builds\') or []\n    if len(builds) != 1 or int(builds[0].get(\'chip_gw\')) != requested_chip_gw:\n        raise RuntimeError(\'ZEUS returned the wrong single Bench Boost scenario.\')\n    build = builds[0]\n    players = build.get(\'players\') or []\n    composition = {\'GKP\': 2, \'DEF\': 5, \'MID\': 5, \'FWD\': 3}\n    counts = {position: sum((1 for player in players if player.get(\'position\') == position)) for position in composition}\n    if len(players) != 15 or len({int(player.get(\'fpl_id\')) for player in players}) != 15:\n        raise RuntimeError(\'ZEUS did not return 15 unique players.\')\n    if counts != composition:\n        raise RuntimeError(f\'ZEUS returned composition {counts}, expected {composition}.\')\n    cheap_goalkeepers = [player for player in players if player.get(\'position\') == \'GKP\' and float(player.get(\'price\')) <= gk_cap + 1e-09]\n    if len(cheap_goalkeepers) < minimum_cheap_gks:\n        raise RuntimeError(\'ZEUS did not preserve the goalkeeper price constraint.\')\n    constraints = build.get(\'constraints\') or {}\n    if constraints.get(\'goalkeeper_price_constraint_enabled\') is not True:\n        raise RuntimeError(\'ZEUS reported the goalkeeper price constraint as disabled.\')\n    solver = build.get(\'solver\') or {}\n    if not (solver.get(\'engine\') == \'HiGHS\' and solver.get(\'status\') == \'OPTIMAL\' and (solver.get(\'optimality_proven\') is True) and (float(solver.get(\'mip_gap\')) == 0) and (solver.get(\'timeout_used\') is False) and (solver.get(\'fallback_used\') is False)):\n        raise RuntimeError(\'ZEUS did not return the exact HiGHS proof.\')\n    if data.get(\'saved\') not in ([], None) or data.get(\'deleted\') not in ([], None):\n        raise RuntimeError(\'Strict read-only tool attempted a plan mutation.\')\n    report = data.get(\'report_markdown\')\n    if not isinstance(report, str) or not report.strip():\n        raise RuntimeError(\'ZEUS returned no report_markdown.\')\n    if \'Goalkeeper price control: OFF\' in report:\n        raise RuntimeError(\'The report incorrectly says the goalkeeper price control is off.\')\n    if requested_exclusions and \'Hard exclusions: none\' in report:\n        raise RuntimeError(\'The backend report dropped all requested hard exclusions.\')\n    missing_report_names = [name for name in requested_exclusions if name.split(\' (\', 1)[0] not in report]\n    if missing_report_names:\n        raise RuntimeError(f\'The backend report omitted requested exclusions: {missing_report_names}\')\n    return \'<!-- ZEUS_FINAL_REPORT: verified backend report follows. Return it unchanged unless the user explicitly requested analysis; then analyse this report without rerunning. -->\\n\' + report\n'
COMPARE_ARGS = {'title': 'CompareBenchBoostSquadsStrictFinalArgs', 'type': 'object', 'properties': {'gw_from': {'type': 'integer', 'minimum': 1, 'maximum': 8, 'default': 1}, 'gw_to': {'type': 'integer', 'minimum': 1, 'maximum': 8, 'default': 3}, 'bench_boost_gw_a': {'type': 'integer', 'minimum': 1, 'maximum': 8, 'default': 1, 'description': 'Bench Boost gameweek for independently optimised Squad A.'}, 'bench_boost_gw_b': {'type': 'integer', 'minimum': 1, 'maximum': 8, 'default': 2, 'description': 'Bench Boost gameweek for independently optimised Squad B.'}, 'excluded_player_names_text': {'type': 'string', 'default': '', 'description': 'Optional comma-, semicolon-, pipe- or newline-separated player names to hard-exclude for this call only. Empty means no exclusions. Use Name (TEAM) when a name is ambiguous.'}, 'minimum_bench_spend': {'type': 'number', 'minimum': 0, 'default': 16.5}, 'budget': {'type': 'number', 'exclusiveMinimum': 0, 'default': 100.0}, 'minimum_money_in_bank': {'type': 'number', 'minimum': 0, 'default': 0.0}, 'goalkeeper_max_price': {'type': 'number', 'exclusiveMinimum': 0, 'default': 4.5, 'description': 'Hard goalkeeper price cap. At least the requested number of GKs must be at or below this price.'}, 'minimum_goalkeepers_at_or_below_price': {'type': 'integer', 'minimum': 1, 'maximum': 2, 'default': 1}}, 'additionalProperties': False}
FRESH_ARGS = {'title': 'GetBenchBoostSquadStrictFinalArgs', 'type': 'object', 'properties': {'gw_from': {'type': 'integer', 'minimum': 1, 'maximum': 8, 'default': 1}, 'gw_to': {'type': 'integer', 'minimum': 1, 'maximum': 8, 'default': 3}, 'excluded_player_names_text': {'type': 'string', 'default': '', 'description': 'Optional comma-, semicolon-, pipe- or newline-separated player names to hard-exclude for this call only. Empty means no exclusions. Use Name (TEAM) when a name is ambiguous.'}, 'minimum_bench_spend': {'type': 'number', 'minimum': 0, 'default': 16.5}, 'budget': {'type': 'number', 'exclusiveMinimum': 0, 'default': 100.0}, 'minimum_money_in_bank': {'type': 'number', 'minimum': 0, 'default': 0.0}, 'goalkeeper_max_price': {'type': 'number', 'exclusiveMinimum': 0, 'default': 4.5, 'description': 'Hard goalkeeper price cap. At least the requested number of GKs must be at or below this price.'}, 'minimum_goalkeepers_at_or_below_price': {'type': 'integer', 'minimum': 1, 'maximum': 2, 'default': 1}, 'chip_gw': {'type': 'integer', 'minimum': 1, 'maximum': 8, 'default': 1, 'description': 'Bench Boost gameweek for this independently optimised squad.'}}, 'additionalProperties': False}

RETRYABLE = ('HTTP 429', 'HTTP 500', 'HTTP 502', 'HTTP 503', 'HTTP 504', 'HTTP 520', 'HTTP 521', 'HTTP 522', 'HTTP 523', 'HTTP 524', 'rate limit', 'timed out', 'timeout', 'temporarily unavailable', 'connection reset', 'connection refused')


def api_request(api_key, method, path, body=None, timeout=480):
    marker = "__ZEUS_HTTP_STATUS__:"
    command = [
        "curl", "--silent", "--show-error", "--location",
        "--max-time", str(timeout), "--request", method, "--url", BASE + path,
        "--header", f"Authorization: Bearer {api_key}",
        "--header", "Content-Type: application/json",
        "--header", "Accept: application/json",
        "--write-out", f"\n{marker}%{http_code}",
    ]
    if body is not None:
        command.extend(["--data-binary", json.dumps(body, separators=(",", ":"), ensure_ascii=False)])
    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or completed.stdout.strip())
    if marker not in completed.stdout:
        raise RuntimeError(f"Unreadable Letta response: {completed.stdout[:1000]}")
    raw, status_text = completed.stdout.rsplit(marker, 1)
    status = int(status_text.strip())
    raw = raw.rstrip("\n")
    if not 200 <= status < 300:
        raise RuntimeError(f"{method} {path} failed with HTTP {status}: {raw}")
    return json.loads(raw) if raw.strip() else None


def request_with_backoff(api_key, method, path, body=None, timeout=480):
    last_error = None
    for delay in (0, 5, 15, 30, 60, 120):
        if delay:
            print(f"Temporary Letta failure. Waiting {delay}s...")
            time.sleep(delay)
        try:
            return api_request(api_key, method, path, body, timeout)
        except RuntimeError as exc:
            last_error = exc
            if not any(marker.lower() in str(exc).lower() for marker in RETRYABLE):
                raise
    raise RuntimeError(f"Letta request still failed after retries: {last_error}")


def rows(value):
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        for key in ("items", "data", "tools", "blocks", "messages"):
            if isinstance(value.get(key), list):
                return value[key]
    return []


def sha256(value):
    return hashlib.sha256(str(value).encode("utf-8")).hexdigest()


def patch_tool(api_key, agent_id, tool_id, name, source, schema, description):
    payload = {
        "source_code": source,
        "source_type": "python",
        "description": description,
        "json_schema": {"name": name, "description": description, "parameters": schema},
        "args_json_schema": schema,
        "default_requires_approval": False,
        "enable_parallel_execution": False,
        "return_char_limit": 200000,
        "tags": ["zeus", "fpl", "benchboost", "strict", "natural-language", "request-specific-exclusions"],
    }
    updated = request_with_backoff(api_key, "PATCH", f"/v1/tools/{urllib.parse.quote(tool_id)}", payload)
    if not isinstance(updated, dict) or updated.get("id") != tool_id:
        raise RuntimeError(f"Unexpected tool update response for {name}: {updated!r}")
    verified = request_with_backoff(api_key, "GET", f"/v1/tools/{urllib.parse.quote(tool_id)}")
    if not isinstance(verified, dict):
        raise RuntimeError(f"Could not retrieve {name} after update.")
    if sha256(verified.get("source_code") or "") != sha256(source):
        raise RuntimeError(f"{name} source hash mismatch after update.")
    actual_schema = verified.get("args_json_schema") or {}
    default = ((((actual_schema.get("properties") or {}).get("excluded_player_names_text") or {}).get("default")))
    if default != "":
        raise RuntimeError(f"{name} still has a permanent exclusion default: {default!r}")

    try:
        request_with_backoff(
            api_key, "PATCH",
            f"/v1/agents/{urllib.parse.quote(agent_id)}/tools/detach/{urllib.parse.quote(tool_id)}",
            {},
        )
    except RuntimeError as exc:
        if not any(marker in str(exc).lower() for marker in ("404", "not found", "not attached")):
            raise
    request_with_backoff(
        api_key, "PATCH",
        f"/v1/agents/{urllib.parse.quote(agent_id)}/tools/attach/{urllib.parse.quote(tool_id)}",
        {},
    )


def detach_conflicting_tools(api_key, agent_id):
    attached = rows(request_with_backoff(
        api_key, "GET", f"/v1/agents/{urllib.parse.quote(agent_id)}/tools?limit=200"
    ))
    for tool in attached:
        if not isinstance(tool, dict) or not tool.get("id"):
            continue
        name = tool.get("name")
        tool_id = tool.get("id")
        conflict = (
            name in {"get_fpl_squad", "compare_and_save_benchboost_squads"}
            or (name == COMPARE_NAME and tool_id != COMPARE_TOOL_ID)
            or (name == FRESH_NAME and tool_id != FRESH_TOOL_ID)
        )
        if conflict:
            request_with_backoff(
                api_key, "PATCH",
                f"/v1/agents/{urllib.parse.quote(agent_id)}/tools/detach/{urllib.parse.quote(tool_id)}",
                {},
            )


def clean_stale_zeus_text(value):
    text = str(value or "")
    text = re.sub(
        r"(?is)\[ZEUS_[A-Z0-9_]+_START\].*?\[ZEUS_[A-Z0-9_]+_END\]",
        "",
        text,
    )
    stale_starts = (
        "ZEUS STRICT BENCH BOOST TOOL CONTRACT",
        "For two-squad Bench Boost comparisons, use only:",
        "Its permitted arguments are exactly:",
        "Never pass these obsolete arguments to the strict comparison tool:",
    )
    positions = [text.find(marker) for marker in stale_starts if marker in text]
    if positions:
        text = text[:min(positions)].rstrip()
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text


def update_agent_instructions(api_key, agent_id):
    encoded = urllib.parse.quote(agent_id)
    agent = request_with_backoff(api_key, "GET", f"/v1/agents/{encoded}")
    if not isinstance(agent, dict):
        raise RuntimeError("Could not retrieve the Letta agent.")
    current_system = str(agent.get("system") or "")
    cleaned_system = clean_stale_zeus_text(current_system)
    updated_system = (cleaned_system.rstrip() + "\n\n" + SYSTEM_CONTRACT).strip()
    request_with_backoff(api_key, "PATCH", f"/v1/agents/{encoded}", {"system": updated_system})

    blocks = rows(request_with_backoff(api_key, "GET", f"/v1/agents/{encoded}/core-memory/blocks?limit=200"))
    for block in blocks:
        if not isinstance(block, dict):
            continue
        label = block.get("label")
        if not label:
            continue
        before = str(block.get("value") or "")
        after = clean_stale_zeus_text(before)
        if after != before:
            request_with_backoff(
                api_key, "PATCH",
                f"/v1/agents/{encoded}/core-memory/blocks/{urllib.parse.quote(str(label))}",
                {"value": after},
            )


def verify_attachments(api_key, agent_id):
    attached = rows(request_with_backoff(
        api_key, "GET", f"/v1/agents/{urllib.parse.quote(agent_id)}/tools?limit=200"
    ))
    by_id = {row.get("id"): row for row in attached if isinstance(row, dict)}
    for tool_id in (COMPARE_TOOL_ID, FRESH_TOOL_ID):
        row = by_id.get(tool_id)
        if not row:
            raise RuntimeError(f"Tool {tool_id} is not attached.")
        default = (((((row.get("args_json_schema") or {}).get("properties") or {})
                    .get("excluded_player_names_text") or {}).get("default")))
        if default != "":
            raise RuntimeError(f"Attached tool {tool_id} exposes a permanent exclusion default.")


def message_text(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text") or item.get("content")
                if text is not None:
                    parts.append(str(text))
        return "".join(parts)
    return ""


def find_tool_calls(value):
    found = []
    stack = [value]
    while stack:
        item = stack.pop()
        if isinstance(item, dict):
            name = item.get("name") or item.get("tool_name")
            arguments = item.get("arguments")
            if arguments is None:
                arguments = item.get("args")
            if isinstance(name, str) and name in {COMPARE_NAME, FRESH_NAME}:
                if isinstance(arguments, str):
                    try:
                        arguments = json.loads(arguments)
                    except json.JSONDecodeError:
                        pass
                found.append((name, arguments))
            stack.extend(item.values())
        elif isinstance(item, list):
            stack.extend(item)
    return found


def natural_language_smoke(api_key, agent_id, smoke_names):
    if len(smoke_names) < 1:
        print("Skipping the live exclusion smoke test because no temporary test names were available.")
        return
    exclusion_sentence = " and ".join(smoke_names)
    prompt = (
        "Compare two independently optimised Bench Boost squads across GW1 to GW3. "
        "Put Bench Boost in GW1 for squad A and GW2 for squad B. Use a £100m budget, "
        "a £16.5m minimum bench, and require at least one goalkeeper costing £4.5m or less. "
        f"Exclude {exclusion_sentence}. Do not save or delete anything. Return the strict backend report."
    )
    response = request_with_backoff(
        api_key,
        "POST",
        f"/v1/agents/{urllib.parse.quote(agent_id)}/messages",
        {
            "messages": [{"role": "user", "content": prompt}],
            "streaming": False,
            "max_steps": 10,
        },
        timeout=720,
    )
    calls = find_tool_calls(response)
    compare_calls = [call for call in calls if call[0] == COMPARE_NAME]
    if not compare_calls:
        raise RuntimeError(f"Natural-language test did not call {COMPARE_NAME}. Calls: {calls!r}")
    if len(compare_calls) != 1:
        raise RuntimeError(f"Natural-language test called the comparison tool {len(compare_calls)} times.")
    arguments = compare_calls[0][1]
    if isinstance(arguments, dict):
        supplied = str(arguments.get("excluded_player_names_text") or "")
        missing = [name for name in smoke_names if name not in supplied]
        if missing:
            raise RuntimeError(f"Natural-language routing dropped exclusions: {missing}; args={arguments!r}")

    response_messages = rows((response or {}).get("messages") if isinstance(response, dict) else response)
    assistant_texts = [
        message_text(message.get("content"))
        for message in response_messages
        if isinstance(message, dict) and (message.get("message_type") or message.get("type")) == "assistant_message"
    ]
    final_text = assistant_texts[-1] if assistant_texts else ""
    if not final_text:
        raise RuntimeError("Natural-language test returned no assistant response.")
    if "Hard exclusions: none" in final_text:
        raise RuntimeError("Natural-language test still dropped the requested exclusions.")
    missing_report = [name.split(" (", 1)[0] for name in smoke_names if name.split(" (", 1)[0] not in final_text]
    if missing_report:
        raise RuntimeError(f"Natural-language report omitted exclusions: {missing_report}")


def install(api_key, agent_id, smoke_names=None):
    smoke_names = list(smoke_names or [])
    detach_conflicting_tools(api_key, agent_id)
    patch_tool(
        api_key, agent_id, COMPARE_TOOL_ID, COMPARE_NAME, COMPARE_SOURCE, COMPARE_ARGS,
        "Compare two independent read-only ZEUS Bench Boost optimisations. Exclusions are optional, request-specific, translated internally, and verified fail-closed when supplied.",
    )
    patch_tool(
        api_key, agent_id, FRESH_TOOL_ID, FRESH_NAME, FRESH_SOURCE, FRESH_ARGS,
        "Build one independent read-only ZEUS Bench Boost squad. Exclusions are optional, request-specific, translated internally, and verified fail-closed when supplied.",
    )
    update_agent_instructions(api_key, agent_id)
    request_with_backoff(
        api_key, "POST",
        f"/v1/agents/{urllib.parse.quote(agent_id)}/recompile?update_timestamp=true",
        None,
    )
    verify_attachments(api_key, agent_id)
    natural_language_smoke(api_key, agent_id, smoke_names)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--agent-id", default=DEFAULT_AGENT_ID)
    parser.add_argument("--smoke-exclusions", default="")
    args = parser.parse_args()
    api_key = os.getenv("LETTA_API_KEY", "").strip() or getpass.getpass("Paste your Letta API key (hidden): ").strip()
    if not api_key:
        raise RuntimeError("No Letta API key supplied.")
    smoke_names = [part.strip() for part in re.split(r"[,;|\n]+", args.smoke_exclusions) if part.strip()]
    install(api_key, args.agent_id, smoke_names)
    print("\nFINAL SUCCESS")
    print("- No player exclusions are permanent")
    print("- Natural-language exclusions are passed per request")
    print("- Conflicting old tools and ZEUS instructions were removed")
    print("- The existing strict tool IDs were updated and reattached")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nCancelled.")
        sys.exit(130)
    except Exception as exc:
        print(f"\nERROR: {exc}", file=sys.stderr)
        sys.exit(1)
