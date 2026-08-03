# Letta saved-squad tool update

Paste the prompt below into the existing Letta Code agent after the ZEUS deployment is live.

## One-shot installation prompt

You need to repair the saved-squad retrieval gap in your ZEUS toolset without changing or replacing the existing optimiser tools.

Create and register a new tool named `get_saved_fpl_squads`.

Reuse the same ZEUS base URL, authentication header, timeout, retry behaviour and HTTP helper already used by `get_fpl_data`. Do not hard-code a second API key or base URL.

The tool must call:

`GET /api/brief?view=squads`

Supported parameters:

- `gw` — integer, default 1, currently limited to GW1-GW8 because external xPTS is available only in that window.
- `plan` — optional saved-squad name, `active`, or one-based visible squad index.
- `plan_id` — optional exact database plan id.
- `simulate_chip` — optional: `wildcard`, `benchboost`, or `triplecaptain`.
- `include_players` — boolean, default true.

The function schema must be:

```json
{
  "name": "get_saved_fpl_squads",
  "description": "List Louis's saved ZEUS squads, retrieve one by name/index/id, show its active chip and transfer cost, and optionally simulate Wildcard, Bench Boost or Triple Captain without mutating the saved plan.",
  "parameters": {
    "type": "object",
    "properties": {
      "gw": { "type": "integer", "minimum": 1, "maximum": 8, "default": 1 },
      "plan": { "type": "string", "description": "Optional squad name, active, or one-based visible index." },
      "plan_id": { "type": "integer", "description": "Optional exact ZEUS plan id." },
      "simulate_chip": {
        "type": "string",
        "enum": ["wildcard", "benchboost", "triplecaptain"]
      },
      "include_players": { "type": "boolean", "default": true }
    },
    "additionalProperties": false
  }
}
```

Return the ZEUS JSON without renaming or dropping these fields:

- `saved_squad_count`
- `available_squads`
- `selected_squad`
- `selected_squad.chip`
- `selected_squad.transfers_made`
- `selected_squad.free_transfers_available`
- `selected_squad.transfer_hit`
- `selected_squad.starting_xpts`
- `selected_squad.captain_bonus`
- `selected_squad.bench_boost_bonus`
- `selected_squad.wildcard_saving`
- `selected_squad.net_xpts`
- `selected_squad.players`
- `selected_squad.simulation`

Rules:

1. This tool retrieves saved squads. `get_fpl_squad` remains the optimiser and must not be overloaded or broken.
2. A simulation is read-only. Never persist a simulated chip unless Louis explicitly asks for a separate save action.
3. The hard-coded live Team 4812 slot is intentionally hidden and must not be counted as a saved squad.
4. Effective xPTS is line-up gated: predicted starters have start probability 1.0; every other player has effective xPTS and start probability 0.0. Preserve `raw_imported_xpts` for audit.
5. When Louis asks “how many saved squads do I have?”, call this tool rather than guessing from memory.
6. When Louis asks about “my squad” without naming one, use the active saved squad, then the first visible saved squad if none is active.

After registration, run these smoke tests and report the exact results:

1. `get_saved_fpl_squads(gw=1, include_players=false)`
2. `get_saved_fpl_squads(gw=1, plan="active", include_players=true)`
3. `get_saved_fpl_squads(gw=1, plan="active", simulate_chip="benchboost", include_players=false)`

Then write a durable memory note recording that saved-squad retrieval is handled by `get_saved_fpl_squads`, while `get_fpl_squad` remains the optimiser.
