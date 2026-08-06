#!/usr/bin/env python3
"""Upsert ZEUS advanced Bench Boost tools in Letta without detaching other tools."""

from __future__ import annotations

import getpass
import json
import subprocess
import textwrap
import sys
import urllib.parse

BASE = "https://api.letta.com"
DEFAULT_AGENT_ID = "agent-5423bdf2-43da-4626-99a4-8fed82c05c75"
BENCH_ORDER_POLICY = "backup_gkp_first_then_outfield_descending_xpts"

COMMON_SOURCE_BODY = textwrap.dedent(r'''
    import json
    import urllib.error
    import urllib.request

    payload = {
        "gw_from": int(gw_from),
        "gw_to": int(gw_to),
        "candidate_chip_gameweeks": [int(value) for value in candidate_chip_gameweeks],
        "excluded_player_names": [str(value) for value in (excluded_player_names or [])],
        "excluded_player_ids": [int(value) for value in (excluded_player_ids or [])],
        "minimum_bench_spend": float(minimum_bench_spend),
        "budget": float(budget),
        "minimum_money_in_bank": float(minimum_money_in_bank),
        "bench_order_policy": str(bench_order_policy),
        "suggest_always_benched_replacements": bool(suggest_always_benched_replacements),
        "replacement_option_count": int(replacement_option_count),
        "replacement_max_xpts_drop": float(replacement_max_xpts_drop),
        "save_names": [str(value) for value in (save_names or [])],
        "delete_plan_ids": [str(value) for value in (delete_plan_ids or [])],
    }
    if maximum_money_in_bank is not None:
        payload["maximum_money_in_bank"] = float(maximum_money_in_bank)
    if exact_money_in_bank is not None:
        payload["exact_money_in_bank"] = float(exact_money_in_bank)
    if goalkeeper_max_price is not None:
        payload["goalkeeper_max_price"] = float(goalkeeper_max_price)
        payload["minimum_goalkeepers_at_or_below_price"] = int(minimum_goalkeepers_at_or_below_price)

    request = urllib.request.Request(
        "https://zeus-teal.vercel.app/api/benchboost-compare",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "ZEUS-Letta-Advanced/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"ZEUS returned HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not reach ZEUS: {exc.reason}") from exc

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"ZEUS returned invalid JSON: {raw[:2000]}") from exc
    if data.get("ok") is not True:
        raise RuntimeError(json.dumps(data, ensure_ascii=False, sort_keys=True))

    requested_gameweeks = sorted(payload["candidate_chip_gameweeks"])
    returned_gameweeks = sorted(int(build.get("chip_gw")) for build in data.get("builds", []))
    if returned_gameweeks != requested_gameweeks:
        raise RuntimeError(
            f"Candidate gameweek mismatch: requested {requested_gameweeks}, returned {returned_gameweeks}."
        )
    if data.get("exclusions_verified_absent_from_all_builds") is not True:
        raise RuntimeError("ZEUS did not prove hard exclusions absent from all builds.")
    report = data.get("report_markdown")
    if not isinstance(report, str) or not report.strip():
        raise RuntimeError("ZEUS returned no report_markdown.")
    return report
''').strip()
COMMON_SOURCE_BODY_INDENTED = textwrap.indent(COMMON_SOURCE_BODY, "    ")

COMPARE_SOURCE = f'''
def compare_and_save_benchboost_squads_strict(
    gw_from: int,
    gw_to: int,
    candidate_chip_gameweeks: list,
    excluded_player_names: list = [],
    excluded_player_ids: list = [],
    minimum_bench_spend: float = 16.5,
    budget: float = 100.0,
    minimum_money_in_bank: float = 0.0,
    maximum_money_in_bank: float = None,
    exact_money_in_bank: float = None,
    goalkeeper_max_price: float = None,
    minimum_goalkeepers_at_or_below_price: int = 1,
    bench_order_policy: str = "{BENCH_ORDER_POLICY}",
    suggest_always_benched_replacements: bool = False,
    replacement_option_count: int = 3,
    replacement_max_xpts_drop: float = 1.0,
    save_names: list = [],
    delete_plan_ids: list = [],
) -> str:
    """Compare independently optimised ZEUS Bench Boost scenarios with advanced constraints."""
{COMMON_SOURCE_BODY_INDENTED}
'''.strip()

FRESH_SOURCE = f'''
def get_fpl_benchboost_squad_strict(
    gw_from: int,
    gw_to: int,
    chip_gw: int,
    excluded_player_names: list = [],
    excluded_player_ids: list = [],
    minimum_bench_spend: float = 16.5,
    budget: float = 100.0,
    minimum_money_in_bank: float = 0.0,
    maximum_money_in_bank: float = None,
    exact_money_in_bank: float = None,
    goalkeeper_max_price: float = None,
    minimum_goalkeepers_at_or_below_price: int = 1,
    bench_order_policy: str = "{BENCH_ORDER_POLICY}",
    suggest_always_benched_replacements: bool = False,
    replacement_option_count: int = 3,
    replacement_max_xpts_drop: float = 1.0,
) -> str:
    """Build one independently optimised ZEUS Bench Boost squad with advanced constraints."""
    candidate_chip_gameweeks = [int(chip_gw)]
    save_names = []
    delete_plan_ids = []
{COMMON_SOURCE_BODY_INDENTED}
'''.strip()


def common_properties(candidate_field: str):
    properties = {
        "gw_from": {"type": "integer", "minimum": 1, "maximum": 8},
        "gw_to": {"type": "integer", "minimum": 1, "maximum": 8},
        "excluded_player_names": {
            "type": "array",
            "items": {"type": "string"},
            "default": [],
            "description": "Current player names. Qualify ambiguity as Name (TEAM).",
        },
        "excluded_player_ids": {"type": "array", "items": {"type": "integer"}, "default": []},
        "minimum_bench_spend": {"type": "number", "minimum": 0, "default": 16.5},
        "budget": {"type": "number", "exclusiveMinimum": 0, "default": 100},
        "minimum_money_in_bank": {"type": "number", "minimum": 0, "default": 0},
        "maximum_money_in_bank": {"type": ["number", "null"], "minimum": 0, "default": None},
        "exact_money_in_bank": {"type": ["number", "null"], "minimum": 0, "default": None},
        "goalkeeper_max_price": {"type": ["number", "null"], "exclusiveMinimum": 0, "default": None},
        "minimum_goalkeepers_at_or_below_price": {"type": "integer", "minimum": 1, "maximum": 2, "default": 1},
        "bench_order_policy": {"type": "string", "enum": [BENCH_ORDER_POLICY], "default": BENCH_ORDER_POLICY},
        "suggest_always_benched_replacements": {"type": "boolean", "default": False},
        "replacement_option_count": {"type": "integer", "minimum": 1, "maximum": 10, "default": 3},
        "replacement_max_xpts_drop": {"type": "number", "minimum": 0, "default": 1},
    }
    if candidate_field == "candidate_chip_gameweeks":
        properties[candidate_field] = {
            "type": "array",
            "minItems": 1,
            "uniqueItems": True,
            "items": {"type": "integer", "minimum": 1, "maximum": 8},
        }
        properties["save_names"] = {"type": "array", "items": {"type": "string"}, "default": []}
        properties["delete_plan_ids"] = {"type": "array", "items": {"type": "string"}, "default": []}
    else:
        properties[candidate_field] = {"type": "integer", "minimum": 1, "maximum": 8}
    return properties


COMPARE_ARGS = {
    "title": "CompareAndSaveBenchboostSquadsStrictAdvancedArgs",
    "type": "object",
    "properties": common_properties("candidate_chip_gameweeks"),
    "required": ["gw_from", "gw_to", "candidate_chip_gameweeks"],
    "additionalProperties": False,
}
FRESH_ARGS = {
    "title": "GetFplBenchboostSquadStrictAdvancedArgs",
    "type": "object",
    "properties": common_properties("chip_gw"),
    "required": ["gw_from", "gw_to", "chip_gw"],
    "additionalProperties": False,
}


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


def upsert(api_key, name, source, args_schema, description):
    tool = api_request(api_key, "PUT", "/v1/tools/", {
        "source_code": source,
        "source_type": "python",
        "description": description,
        "json_schema": {"name": name, "description": description, "parameters": args_schema},
        "args_json_schema": args_schema,
        "default_requires_approval": False,
        "enable_parallel_execution": False,
        "return_char_limit": 200000,
        "tags": ["zeus", "fpl", "benchboost", "advanced-controls"],
    })
    if not tool or not tool.get("id"):
        raise RuntimeError(f"Letta returned no tool ID for {name}: {tool!r}")
    return tool


def attach(api_key, agent_id, tool):
    try:
        api_request(
            api_key,
            "PATCH",
            f"/v1/agents/{urllib.parse.quote(agent_id)}/tools/attach/{urllib.parse.quote(tool['id'])}",
            {},
        )
    except RuntimeError as exc:
        if "409" not in str(exc).lower() and "already" not in str(exc).lower():
            raise


def main():
    print("ZEUS Letta advanced tool updater")
    print("=================================")
    print("This updates only the two strict Bench Boost tools and leaves every other tool attached.")
    api_key = getpass.getpass("Paste your Letta API key (hidden): ").strip()
    if not api_key:
        raise RuntimeError("No API key supplied.")
    agent_id = input(f"Agent ID [{DEFAULT_AGENT_ID}]: ").strip() or DEFAULT_AGENT_ID

    compare = upsert(
        api_key,
        "compare_and_save_benchboost_squads_strict",
        COMPARE_SOURCE,
        COMPARE_ARGS,
        "Compare independent ZEUS Bench Boost builds with exclusions by name, bank reserve, goalkeeper price, deterministic bench order and cheaper always-benched alternatives.",
    )
    fresh = upsert(
        api_key,
        "get_fpl_benchboost_squad_strict",
        FRESH_SOURCE,
        FRESH_ARGS,
        "Build one ZEUS Bench Boost squad with exclusions by name, bank reserve, goalkeeper price, deterministic bench order and cheaper always-benched alternatives.",
    )
    attach(api_key, agent_id, compare)
    attach(api_key, agent_id, fresh)
    api_request(api_key, "POST", f"/v1/agents/{urllib.parse.quote(agent_id)}/recompile?update_timestamp=true", None)

    print("\nSUCCESS")
    print(f"Updated and attached: {compare['name']} [{compare['id']}]")
    print(f"Updated and attached: {fresh['name']} [{fresh['id']}]")
    print("No other Letta tools were detached or changed.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nCancelled.")
        sys.exit(130)
    except Exception as exc:
        print(f"\nERROR: {exc}", file=sys.stderr)
        sys.exit(1)
