# Message to send to the existing Letta chat

Paste the message below into the existing Letta Code agent. This is a one-time tool setup request, not a replacement system prompt.

---

The ZEUS backend now supports saved-squad range analysis, but this agent does not yet have the Letta tool that exposes it. Add and register that missing tool now.

## Missing tool

Create or update a Letta tool named:

`get_saved_fpl_squads`

This tool is for Louis's real saved ZEUS squads and plans. It is not the same as `get_fpl_squad`, which builds a new theoretical squad from the full player pool.

## Where the backend already exists

The backend is already deployed in ZEUS at:

`GET /api/brief?view=squads&format=json`

Use the same ZEUS base URL, API-key header, HTTP helper, timeout, retry logic and error handling already used by the existing ZEUS tools. Do not create a second hard-coded base URL or duplicate secret.

The supporting server code is in the ZEUS GitHub repository at:

- `app/api/brief/route.js`
- `lib/server/squad-brief.mjs`
- `lib/plan-range.mjs`
- `lib/squad-range.mjs`

Do not copy that JavaScript into Letta. The Letta tool should call the deployed HTTP endpoint.

## Tool inputs

Register the tool with these inputs:

- `gw_from`: required integer; first gameweek of the exact inclusive range
- `gw_to`: required integer; last gameweek of the exact inclusive range
- `plan`: optional string; `active`, a saved-plan name or a one-based visible index
- `plan_id`: optional integer for an exact database plan ID
- `simulate_chip`: optional string; `wildcard`, `benchboost` or `triplecaptain`
- `simulate_gw`: optional integer; required when `simulate_chip` is used and must be inside the requested range
- `include_players`: optional boolean; default `true`

Always send:

- `view=squads`
- `format=json`
- the exact `gw_from` and `gw_to`

Do not send both `plan` and `plan_id` unless the existing ZEUS tool pattern explicitly supports that combination.

## Request examples

Active saved plan across GW2-GW4:

`/api/brief?view=squads&format=json&gw_from=2&gw_to=4&plan=active&include_players=true`

Read-only Bench Boost simulation in GW3:

`/api/brief?view=squads&format=json&gw_from=2&gw_to=4&plan=active&simulate_chip=benchboost&simulate_gw=3&include_players=true`

## Response handling

Return the ZEUS JSON without silently dropping fields needed for analysis. Preserve at least:

- `saved_squad_count`
- `available_squads`
- `selected_squad`
- `selected_squad.weekly`
- `selected_squad.range_total`
- `selected_squad.range_simulation`
- `selected_squad.range_error`
- weekly formation, XI, captain, vice-captain, bench order, chip, transfers, transfer hit, gross xPTS and net xPTS
- player `raw_imported_xpts`, effective `xpts` and role fields when players are included
- `persisted`, which must remain `false` for simulations

Surface ZEUS API errors directly. Do not replace unsupported ranges or failed requests with guesses.

Team 4812 is hidden and must not be counted or presented as a saved squad; the endpoint already filters it.

## When to use it

Use `get_saved_fpl_squads` when Louis asks about:

- "my squad" or his active squad
- his owned 15
- saved plans
- planned transfers
- weekly line-ups, captains, benches or chips
- projected totals over an exact range
- read-only chip simulations

Continue using `get_fpl_squad` only when Louis asks ZEUS to create a brand-new theoretical squad.

## Complete the setup

1. Inspect the currently registered ZEUS tools and locate the shared HTTP helper/config used by `get_fpl_squad` or the current ZEUS data tool.
2. Implement `get_saved_fpl_squads` using that same helper and deployed ZEUS base URL.
3. Register or attach the tool to this existing agent.
4. Reload the active tool list so it is callable in this chat.
5. Run one small verification call only: retrieve the active saved squad for GW1-GW2 with `include_players=false`.
6. Report the registered tool name, its input schema, the endpoint path used and whether that one verification call succeeded.

Do not run a broad smoke-test suite. Do not rewrite the agent's system prompt or replace its persona. This task is only to add the missing ZEUS saved-squads tool and make it available in the current Letta chat.

---
