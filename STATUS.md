> **DATES SUPERSEDED.** Every deadline in this document was rewritten on 26 Jul 2026.
> The binding schedule is `config/schedule.json` and `docs/DECISIONS.md` section 14:
> working MVP 26 Jul, complete project 28 Jul 22:00. Any date below is indicative only.

# FPLBot — Master Status (25 Jul 2026)

The goal is world rank 1 in the 2026/27 season.

Two documents matter. This one is the plain-language status: what the thing is, what works, what's left, in order. `docs/tickets.md` is the detailed version with all 53 tickets and their acceptance criteria. If the two disagree, trust `docs/tickets.md` for detail and this file for current state.

Season starts 28 Julust. GW1 drafts are due 28 Julust.

---

## What the app is

A desktop-only web tool, private, no login, at an unguessable URL. Six pages.

| Page | What it's for | State |
|---|---|---|
| Dashboard | Deadline, template squad, price moves, data health | Working |
| Squad Builder | Build a 15-man squad three ways: guided, free, or from a saved draft | Working, the main screen |
| Squad | Your actual team, replacements, captaincy, horizon | Working |
| Players | The full database with filters and comparison | Working |
| Analysis | Ten seasons of strategy evidence | Empty placeholder |
| News | Press conference signals and price moves | Empty placeholder |

Stack: Next.js on Vercel, Supabase for the database, GitHub Actions for the scheduled jobs, plus the FPL API, The Odds API and Understat for data. Budget cap $14/month.

---

## How the points prediction works

Five steps, each feeding the next.

1. **Market.** Turn betting odds into how many goals each team is expected to score.
2. **Scoreline.** Turn those into the odds of every possible score, including clean sheets.
3. **Allocation.** Work out each player's share of his team's goals and assists.
4. **Minutes.** Work out how likely he is to start and how long he plays.
5. **Simulation.** Run the match ten thousand times to get a range, not a single number.

**Important: these numbers are not yet proven.** Nothing has checked whether they beat simply picking last season's top scorers. Until that check exists, every screen says INTERIM SCORE rather than xP. That is deliberate.

Three parts are on placeholder settings until then:

- The Dixon-Coles correlation is at a neutral default, not fitted to real data.
- The minutes model has no trained start predictor.
- Fatigue is not included at all.

And right now there are no betting odds published for GW1, so step 1 falls back to last season's team strength. The engine is running at its weakest.

---

## What is done and running

**Data pipeline.** All five jobs are installed in GitHub Actions and have run green:

- `fpl-pull` — players, prices, ownership, fixtures, every 6 hours
- `archive-2526` — last season's every-player-every-match archive
- `understat-pull` — season xG and xA per player
- `odds-pull` — betting odds with a credit counter
- `presser-pull` — press conference parsing, Fridays

**Database.** All tables live, migrations 003 and 004 applied, read-only access from the browser, all writing done server-side.

**Engine.** All five prediction layers built and producing rows. BPS (bonus points) simulation built, backtest has run.

**Interface.** Dashboard, Squad Builder with all three modes, Squad page, Players page with filters, profiles and comparison. Live feedback panel that re-scores as you build.

---

## What is left, in priority order

### Critical, blocks everything

**1. Calibration and ablation (B-08).**
Not built. This is the test that proves the model works. It measures the predictions against what actually happened, compares them to simpler alternatives, and checks whether each of the five layers actually helps. If a layer makes things worse, this is what reveals it.

Until this exists you cannot know whether the tool helps or hurts. It is also the gate that turns INTERIM SCORE into real xP everywhere.

**2. BPS backtest results (A-11, due 28 Jul).**
The job has run. Nobody has read the output yet. It decides whether bonus points can be trusted in the model.

### Deadline-driven

**3. Fatigue study (B-01, due 28 Jul).** Feeds the minutes model. Needs the 2018/19 archive loaded first (A-12).

**4. Strategy study (B-18, due 28 Jul).** Ten seasons of what actually won. Unblocks the Analysis page, and unblocks the formation history evidence that currently cannot be shown.

**5. GW1 three-variant drafts (B-16, due 28 Jul).** The actual deliverable. Everything above serves this.

### Before the season starts

**6. Squad Builder interaction pass.** Captaincy needs to show its reasoning at the moment you choose. Bench order has no control at all. Guided steps cannot be jumped between. Loading a draft cannot be undone. Candidate lists do not break down why a player ranks where he does.

**7. Team ID connect (B-14).** So the tool can track your real picks against its predictions.

**8. The Analyst (B-22, B-23, B-24).** The AI analyst with memory and a spend cap, plus a copy-payload button for zero-cost use in your own Claude project. Open decision: Sonnet at roughly ten cents a call is too expensive, so either find a cheaper model or lean on the copy-payload route.

**9. Analysis page (C-07).** Blocked on item 4.

**10. News page (C-08).** The data pipeline is running. The page is still a placeholder.

**11. Chip planning (B-11).** Wildcard, bench boost, triple captain, free hit. No surface exists.

**12. Launch-day rules verification (B-15).** Confirm the 2026/27 scoring rules against the live API before GW1.

### During the season

- Price rise prediction, nightly price digest (C-01, C-02)
- Blank and double gameweek flags, cup watcher (C-03)
- Monday audit, pick settlement, post-gameweek review (C-04, C-14)
- Set-piece matrix (C-13)
- Multi-gameweek transfer planner (C-15)
- Comparison upgraded with projection ranges (C-11)
- International break reports (C-09)
- Rival scraper and effective ownership (B-09, B-17)

### Final step

**Section 7 full pass.** One sweep at the end: nothing removed, design consistent at 1440 and 1920, every number traceable to real data, every control does something, all text correct, real verification run and reported honestly.

---

## Known gaps and honest limits

**No formation history exists.** FPL does not publish what formation any manager used, so historical points by formation cannot be calculated. The shape cards show what can be calculated: value per million and how steep the drop-off is at each position. The strategy study on 28 Julust is the closest available substitute.

**Team xG against is permanently unavailable.** Understat removed the only public source. The field is left empty rather than filled with a guess. Nothing reads it today, but if defensive strength is needed later it will have to be derived from the match archive, and the archive currently records only one side of each fixture. That is a real gap to close.

**No betting odds yet.** They arrive closer to the season. Every projection is weaker until then.

**Design rules are locked.** Michroma for titles, Outfit for body, Martian Mono for numbers. Desktop only, minimum 1440px. Navigation on the right. Goalkeeper at the bottom of pitch views. Minimum 12px text. Numbers always on dark plates. Pink #FF2ECC for captain, top badges and value. xP is the only term used, never EP.

---

## Recent changes (25 Jul)

- Fixed a crash in the archive job caused by duplicate rows in the source data.
- Rewrote the Understat job after Understat stopped embedding data in their pages.
- Installed all five workflow files, which had never been present. This is why no data existed before today.
- Ran migrations 003 and 004.
- Shape cards no longer show a points figure before any player is picked, and now carry real per-position evidence.
- Formation clearly labelled as changeable at any time without losing the squad.
- Players page: every sort explains what it is evidence of, filters show counts, differential thresholds visible, clear-all added.
- Squad page: horizon slider reports how much to trust the number.
- Dashboard tiles report live state.
