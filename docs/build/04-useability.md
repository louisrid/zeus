# 04 — Useability

Implements the interaction model of `docs/campaign-plan.md` (v3: open-anytime, pull-based, self-driven, desktop-only). This is the human side of the machine: what Louis actually touches, entirely on his own schedule.

**The model, stated once:** there is no Friday ritual, no decision doc, no accept/override ceremony, and **no notifications of any kind**. The tool is intelligence, not a boss. Louis opens it on his desktop whenever he wants, presses Refresh, reads, and decides. Everything the machine computes is sitting there when he arrives; nothing is ever pushed at him. There is no login gate — the tool opens instantly at its (unguessable) URL.

**Cost rule (binding, restated):** all squad scoring, projections, and evaluations are internally coded against the database — zero AI calls in any interactive computation. AI spend is exactly two things: the scheduled Haiku presser pipeline, and **the Analyst**, which fires only when Louis presses Ask and shows its cost before and after every call. Total project cap: **$17/month**.

---

## 1. The interaction loop

```
Whenever you feel like it:
  open tool → ⟳ Refresh → read → (optionally) plan in Builder / Squad
  → (optionally) ✦ Ask the Analyst, or Copy Payload into your own Claude Project
  → make your own transfers/captain/chips in the official FPL app
  → done

Meanwhile, invisibly:
  scheduled jobs keep odds, xG, pressers, prices current (doc 02 §3)
  the team-ID pick sync logs your submitted squad after each deadline
  the Monday audit settles predicted vs actual for YOUR picks
  post-GW records are appended to the Analyst's memory
```

- **Refresh** (header, every page): re-pulls FPL API data on demand — prices, flags, ownership, fixtures, live points during matches — and recomputes derived views. Debounced 60s. **Odds are deliberately excluded** and stay on the scheduled Thu/Fri pulls to protect the 500-credit budget; the freshness strip always shows the odds vintage.
- **Freshness, not nagging:** the strip shows per-source age; amber past threshold. The status sheet behind it holds heartbeats, the odds credit counter, the Analyst spend meter, and model/ruleset versions. If something was degraded when a number was computed, it says so — visible when you look, silent otherwise.
- **Deadlines are your job, on purpose.** The header shows the GW and a passive countdown on every page. Nothing will ever remind you — there is nothing to acknowledge, snooze, or mute.

## 2. Pick logging and predicted-vs-actual (automatic)

Setup asks once for your **FPL team ID** (the number in your team's URL); it's stored as config — never a login, never a password. From then on, with zero input:

1. **At each GW deadline**, current projections for all players are frozen (snapshot keyed to the deadline timestamp).
2. **~30 minutes after the deadline**, the pick sync reads your submitted squad from the public picks endpoint for your team ID and writes XI, bench order, captain/vice, chip to `gw_picks`, paired with the frozen projections. Your predicted GW total is computed then and never revised.
3. **After scores finalise** (09:00 the day after the GW's last match), the audit writes actuals alongside. Predicted vs actual per GW and cumulative, on the Dashboard My Team expansion and the Squad page season strip.
4. **The same settlement feeds the Analyst's memory**: decision outcomes, per-pick prediction gaps, captaincy results, and component misses are appended as structured records after every GW.

The Monday audit stays disciplined per the campaign plan: calibration is judged on rolling multi-week drift; single-GW misses — yours or the model's — are logged as variance, not "explained".

## 3. The Analyst: how you actually use it

- **Ask from any screen.** The drawer opens with the screen's context already assembled — squad, bank, chips, full projections with distributions, fixtures/odds, relevant strategy findings, and memory records. Type a question or fire the default "analyse this screen". Cost shown before you press; actual cost and month-to-date spend shown after. It responds like a quant colleague: dense, numbers-first, ending with the single highest-leverage action if one exists.
- **It remembers.** Post-GW records and its own past conclusions are in its memory table; it cites them when relevant ("your last three captaincy overrides cost −9 net"). The learning lives in the database, not in any chat thread.
- **Zero-cost path.** **Copy Analyst Payload** puts the identical context on the clipboard as formatted text; paste it into your own Claude Project and ask there on your existing plan. Same payload builder, so the API route and the copy route never diverge. Use whichever suits the moment — quick in-tool answer vs a long back-and-forth in a Project.
- **It cannot spend without you.** No scheduled calls exist; the server enforces the monthly cap; every call is logged with its cost.

## 4. Typical sessions (illustrative, none required)

| Session | What you'd do | Time |
|---|---|---|
| Casual check-in | open → Refresh → Dashboard quadrants → close | 1–2 min |
| Transfer thinking | Squad page → click a player → sell/replace comparisons → maybe Ask | 5–15 min |
| Captaincy | Squad page captaincy module → tails/EO → maybe Ask | 2–5 min |
| Wildcard / Free Hit | Builder → Guided or Free Build → save drafts → compare → Ask on the shortlist | 30–60 min |
| Chip timing | Squad page chip tools → placements vs expiry wall | 5–10 min |
| Deep dive | Analysis page; Players filters; payload into a Claude Project for a long think | as long as it's fun |
| News catch-up | News page: pressers, price risk, blanks/doubles | 1–3 min |

**Required time: zero.** The machine runs whether you show up or not; your picks get logged and settled regardless. The GW15/GW25 gate agreements and chip commitments (campaign plan) are things you do *in* the tool when you choose — the relevant screens have everything pre-computed when you arrive.

## 5. Deadline day, exactly

1. Open the tool when you want; Refresh; glance at News for overnight price moves and late pressers; sanity-check intended moves on the Squad page; Ask if something feels unresolved.
2. Open the official FPL app yourself and enter transfers, captain/vice, bench order. (~2 minutes.)
3. Nothing else. The pick sync logs what you actually submitted; if it differs from a plan-of-record draft, the Squad page shows the diff without comment.

## 6. Principles this doc enforces

- **You decide, always.** Every number is advisory; every action is yours, taken in the official app. Nothing auto-submits; nothing is pushed.
- **Pull, never push.** The entire interaction surface is "open it and look". Notification count: zero, forever.
- **Metered AI is opt-in and priced.** The Analyst fires on your press only, shows cost before and after, and is capped server-side. Everything else is free arithmetic.
- **Honest record-keeping without ceremony.** Predictions frozen at the deadline, settled after finalisation, displayed without judgement — and fed to the Analyst so its advice sharpens on your actual season.
- **Fun is load-bearing.** If opening it stops being enjoyable, that's a defect — file it like one.
