# FPLBot — what this is and how to work on it

Read this first in any new session. It is written for Claude, and it assumes nothing from earlier chats.

FPLBot is Louis's Fantasy Premier League planner, live at **https://zeus-teal.vercel.app**. Next.js app
router, Supabase for stored data, a HiGHS MILP solver for squad building, deployed on Vercel. The repo
folder is still called `zeus`; the app is called FPLBot and the logo wordmark says FPLPAL.

Louis's FPL entry id is **4812**. "My team" on the site is his real FPL squad.

---

## 1. The two repositories — read this before touching anything

The code lives in two places, and they do different jobs. Getting this wrong wastes a session.

| | GitLab `louisjridland/zeus` (project id 87770487) | GitHub `louisrid/zeus` |
|---|---|---|
| Role | **Source of truth.** Vercel builds the live site from here | Runs the twice-daily data update (free CI minutes) |
| Claude can push code? | **Yes**, with Louis's GitLab token | **No** — the connector is read-only (`403` on any write) |
| Claude can edit `.github/workflows/*`? | n/a | **No**, never — GitHub blocks it outright |

Why split: GitHub banned the account in October, so everything moved to GitLab. GitHub was restored in
November, but GitLab's free CI minutes ran out mid-month and stopped the updates for two days. So the data
update moved back to GitHub (free), while Vercel still builds from GitLab. Data published on GitHub is
copied to GitLab automatically — see section 5.

**Do not try to "finish" the migration by pointing Vercel at GitHub.** That needs Louis's Vercel login. It
is optional and he has been told; do not keep raising it.

### Working copy and pushing

```bash
# the clone usually already exists at /tmp/glz; if the container was reset, re-clone:
git clone https://<GITLAB_TOKEN>@gitlab.com/louisjridland/zeus.git /tmp/glz
cd /tmp/glz && npm ci

# normal change
cd /tmp/glz && git pull -q --rebase
# ...edit...
npx next build                      # must compile
timeout 300 node --test tests/*.test.mjs   # must be 0 fail (780+ pass)
git add -A && git commit -F - <<'EOF'
<one line saying what changed and why>

Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: <session url>
EOF
git pull -q --rebase && git push -q origin HEAD:main
```

The GitLab token is a `glpat-…` personal access token. **It is not in this repo and must never be committed.**
Ask Louis for it, or read it from the existing clone's remote (`git remote get-url origin`). Always mask it
in any output: `| sed "s/glpat-[A-Za-z0-9._-]*/***/g"`. It has been pasted in plain text in chat before and
should be rotated at some point.

Louis never runs git or terminal commands himself. Claude pushes directly. Do not hand him commands.

### Verifying a deploy reached the site

Every page carries a `data-build` attribute holding the short commit SHA.

```bash
h=$(cd /tmp/glz && git rev-parse --short HEAD)
for i in $(seq 1 40); do b=$(curl -s https://zeus-teal.vercel.app/ | grep -o 'data-build="[^"]*"' | head -1); \
  echo "$b" | grep -q "$h" && { echo "live"; break; }; sleep 15; done
```

A deploy normally takes 2–5 minutes. Always verify live before telling Louis something is fixed, and where
behaviour is visual, check it with Playwright (installed; see section 8).

---

## 2. The data update

One GitHub Actions workflow, `update-all.yml`, does everything in order: prices and injury flags → Louis's
team, bank and selling prices → projections → predicted line-ups → derived line-up config → data checks →
commit. The Dashboard's UPDATE DATA button and the status card both read this run.

`/api/update-data` picks the service: **GitHub when its token works, GitLab only as fallback**, so the
button is never dead. `POST` starts a run, `GET` reports progress and, when a run has finished, copies the
new data to GitLab so the site deploys it.

### Scheduling — the part that has broken twice

- `update-all.yml` has its own `schedule:` (06:00 and 18:00 UTC, plus retry slots). **Do not rely on it.**
  GitHub switches a repository's scheduled workflows off after 60 idle days, which it did here; the crons
  were silently dead on 23–24 Nov and the site went 33 hours stale. Louis can re-enable it in one click:
  GitHub → the repo → Actions → update-all → "Enable workflow".
- The reliable path is **Vercel cron → `/api/scheduled-update`** (`vercel.json`, 06:20 and 18:20 UTC). That
  route copies anything GitHub published since last time, then starts a fresh update unless one finished in
  the last 3 hours or is already running. `workflow_dispatch` is never subject to GitHub's idle rule.

### Running an update by hand

```bash
curl -s -X POST https://zeus-teal.vercel.app/api/update-data      # start
curl -s https://zeus-teal.vercel.app/api/update-data              # phase: running | done | failed
curl -s https://zeus-teal.vercel.app/api/data-mirror              # copy GitHub's data to GitLab
```

Takes about 1–6 minutes. If the Dashboard says minutes are used up, that is GitLab's quota message and
means the GitHub path is not being used — check the GitHub token first.

### The workflow files on GitHub are stale, on purpose

Claude cannot write `.github/workflows/*` on GitHub, so the copies there are older than the ones in this
repo. They are brought up to date **from inside the run** by `scripts/github-run-hooks.mjs`, which npm
calls:

- `postinstall` — clones the latest code from GitLab over the checkout (excluding data files and workflow
  files) and stages it, so the run uses current code and its publish commit carries it to GitHub.
- `after-lineups` (end of `npm run sync:lineups`) — runs the steps the older workflow lacks: the
  mean-of-three projections and the Defences results.

Both hooks do nothing unless `GITHUB_ACTIONS=true` and `GITHUB_WORKFLOW=update-all`, so local runs, Vercel
builds and GitLab CI are unaffected. **If you change what the update must do, change the hook, not the
workflow file.**

---

## 3. Projections (xPTS)

Default is the **mean of three** sources, per player per gameweek:

- Sideline Quant — next gameweek only (CC BY 4.0)
- FPL GO — next five gameweeks
- FPL Copilot — every gameweek

`config/blend-xpts-2026-27.mjs` holds the mean, built by `jobs/blend_xpts_pull.mjs` from
`config/external-xpts-2026-27.mjs` (Copilot, built by `jobs/external_xpts_pull.mjs`). A week is the mean of
whichever sources cover it — a missing source is **never** counted as zero. Settings has a switch back to
Copilot alone; the cookie is `zeus_xpts_source_v2`, served by `lib/xpts-source.mjs` and `/api/xpts-source`.

Terminology is **xP / xPTS**, never "EP". Data keeps two decimals; only the screens round to one.

Public read endpoint: `/api/xpts?gw_from=X&gw_to=Y`.

---

## 4. Plans, squads and the save rules

A plan is a `base` fifteen plus a `weeks` map. Each week may carry `transfers` (`{out,in,…}`),
`startingIds`, `benchOrder`, `captain`, `vice`, `structure`, `chip`. `squadAt(plan, gw)` in `lib/plan.mjs`
folds the weeks up to that gameweek onto the base.

Rows live in Supabase `plans`. The live "My team" row is `kind: "live"`, id
`72e37f35-33a2-4272-86ae-2d2352ee3ce4`, entry 4812.

`lib/plan-write-validation.mjs` is the server's gate, and it is strict: any week that names a line-up must
name exactly 11 starters and 4 reserves, together exactly that week's fifteen, a legal shape, and a captain
and vice who both start.

**`lib/plan-sanitize.mjs` is the safety net — keep it.** Before any save, Builder and Squad run that same
validator on the client and strip **only the line-up** from any week it would reject, keeping the squad,
transfers and chips. Without it, an ordinary edit (remove one player, add another in a different position)
produced a wall of red and the save was lost. A week stripped this way simply has its line-up laid out
again next time it opens.

Other plan rules Louis has set:

- A padlock keeps a player in the fifteen only — never "must start".
- Removing a player leaves his slot **empty**. Never auto-promote a bench player or change the formation.
- Optimise fills empty slots and picks who starts; only Build Best Squad replaces players.
- Team value comes from the official API (bank plus selling prices), never from current prices. Free Hit
  weeks are skipped when reading entry money, or the budget comes out ~£4m light.

---

## 5. Where things are

```
app/                 pages: builder, squad, players, transfers, attacks, defences,
                     fixtures, lineups, settings, analysis, player, status
app/api/             update-data, scheduled-update, data-mirror, plans, xpts, exact-squad,
                     players, fixtures, entry-money, entry-picks, health, build-info, …
lib/plan*.mjs        plan model, validation, the save safety net, range optimisation
lib/solver/          squad rules and the exact solver request
lib/row-order.mjs    every pitch row reads best first by the figure on the plate
lib/routes.mjs       nav: ALL_ROUTES, MENU_ROUTES (desktop bar), MOBILE_TAB_KEYS, MOBILE_MORE_KEYS
lib/club-results.mjs Attacks and Defences tables over any gameweek range
lib/server/data-mirror.mjs   copies GitHub's published data onto GitLab
scripts/github-run-hooks.mjs the update hooks described above
jobs/                the data pulls run by update-all
config/              generated data files — never hand-edit
tests/               780+ tests, many are contract pins (see gotchas)
```

---

## 6. Recent additions (Oct–Nov 2026)

- **Rows always read best first.** Every pitch — Builder, Squad, Dashboard, Line-ups — sorts each row by
  the figure shown on the plate, captain counted at his doubled figure. `lib/row-order.mjs`. ORDER FIX
  still exists but no longer changes what you see.
- **Attacks page**, mirroring Defences, left of it everywhere. Both rank on plain figures only (goals,
  per game, form, clean sheets) — Louis had the "rating" removed. Both take a gameweek range with
  Season / Last 6 / Last 3 shortcuts.
- **Mean-of-three projections** with a Settings page to switch back to Copilot alone.
- **Gameweek time travel** on Builder and Squad, with the live gameweek marked in blue (`GW12 · live`).
  Selections reset to the live gameweek after 3 hours (`lib/use-persistent-state.jsx`).
- **Squad has parity with Builder**: remove, lock into squad, lock into XI, exclude, FILL & OPTIMISE, and
  PLAN FROM MY TEAM as its own separate white button (not a dropdown item).
- **Desktop controls fold behind one OPEN/CLOSE button**, excluded list included.
- **Squad's pitch-corner arrows cycle through My team as well as saved squads.**
- **Line-ups is hidden from the desktop bar and the phone More sheet**; the page and its Dashboard tile
  still work.
- **The save safety net** (section 4) and **the Vercel-cron refresh** (section 2).

---

## 7. Gotchas that have cost time

- **Contract-pin tests.** Many tests assert exact source strings (`min={1}`, prop order on
  `GameweekStepper`, button labels). A harmless refactor fails them. Read the failing assertion and either
  match it or update the pin deliberately.
- **A guard test requires every bare identifier to resolve to an import.** Combined default-plus-named
  imports on one line are not parsed — split them into two lines.
- **`config/*` are generated.** Hand-editing them is overwritten by the next update.
- **Line-ups can lag a gameweek.** The source (Fantasy Football Pundit) publishes team news late in the
  week; the stale-sheet rule in `lib/lineup-xpts.mjs` stops an old sheet zeroing anyone's projection.
- **Never mix up the two repos' remotes.** `origin` in `/tmp/glz` is GitLab. A `gh` remote may exist for
  reading GitHub; never push to it.
- **The GitHub connector is read-only.** `add_repo`/`check_repo_access` will say push is gated on linking
  a GitHub account. Do not loop on it — ask once, then work via GitLab.
- **The workspace is ephemeral.** `/tmp/glz`, Playwright and installed packages can vanish between
  sessions. Re-clone and reinstall rather than assuming.

---

## 8. Checking work with a browser

Playwright and Chromium are available. Useful checks: load every page at 390px and 1280px, watch for page
errors and 5xx responses, and compare the site's numbers against the official FPL API
(`https://fantasy.premierleague.com/api/bootstrap-static/`, `/api/entry/4812/event/<gw>/picks/`).

Scripts written during a session belong in the scratchpad, not the repo.

---

## 9. Design rules Louis has set

- Top navigation bar, never a sidebar.
- Purple theme only. One meaning per colour: neon green for actions and the selected/sorted highlight
  (black text on it), cyan for xPTS, pink/red only for genuine warnings and costs.
- Dense, compact layouts with generous left and right page padding — but type comfortably large, never
  small. White body text, never grey. No italics. No thin weights. Sentence case; no wide letter-spacing
  or all-caps labels.
- Bold is for headings and the emphasised part of a sentence only.
- Plain, obvious page and section names. Every page must have an obvious purpose.
- Phone first at 390px, then 1280px. Controls thumb-sized (44px), nothing cut off, no sideways scroll.
- Goalkeeper at the bottom of pitch views. Every bench shows each player's xPTS, never names only.
- Three radii only (8 cards, 6 controls, 4 chips), one spacing scale.

---

## 10. How to talk to Louis about this work

- Tell him upfront about anything that risks his accounts — heavy automated commits got his GitHub
  flagged once already.
- He is not watching the terminal. Say what changed, what you verified live, and what (if anything) he
  must do. Keep it short.
- Never give him git or terminal commands to run.
- If something cannot be done from here (anything needing his GitHub, Vercel or Supabase login), say so
  plainly once, with the exact click path, and get on with what can be done.
