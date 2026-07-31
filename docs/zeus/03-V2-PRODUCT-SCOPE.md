# ZEUS V2 Product Scope

This is the intended product scope. It is not a claim that every item currently works.

## 1. Preserve the working application

V2 must retain:

- Existing page routes and navigation
- Existing plans, drafts, shortlist, locks, exclusions, and undo behaviour
- Existing ZEUS design language
- Existing data loading and API contracts that are proven working
- Existing legal-squad rules
- Existing payload export
- Existing private desktop use case

The first requirement is that the application builds, deploys, and loads.

## 2. Players gameweek range

The Players page should:

- Show separate FROM and TO gameweek controls
- Allow any valid range within the available horizon
- Prevent FROM exceeding TO
- Display the selected range clearly
- Sum direct per-gameweek xP rows across that range
- Use the same sum for VALUE
- Sort and compare players using the selected range
- Reset to the current gameweek
- Avoid overlapping range handles or hidden controls

The fixture column can remain a fixture view rather than being redefined by the xP range.

## 3. Builder gameweek range

The Builder should:

- Use the same shared range component as Players
- Default to the current gameweek through the next three, where available
- Offer quick 1 GW, 4 GWs, and 8 GWs presets
- Show the exact selected range
- Use that range for player xP, squad totals, candidate ranking, value, and every optimiser action

A longer horizon must be able to change player selection. It must not merely change a label.

## 4. Builder toolbar

The intended controls are:

1. Saved-plan selector or NEW PLAN
2. UNDO
3. BUILD SQUAD, FILL GAPS, or IMPROVE depending on state
4. OPTIMISE XI
5. CLEAR
6. Plan name
7. COPY PAYLOAD
8. SAVE PLAN
9. Budget left

### Build Squad

Build a legal 15-player squad using:

- Selected xP range
- Budget
- Position quotas
- Maximum three players per club
- Locks
- Exclusions
- Formation constraints where relevant

### Fill Gaps

Keep selected players and legally fill empty slots.

### Improve

Search for legal upgrades without discarding valid user choices unnecessarily.

### Optimise XI

Keep the 15 players and choose:

- Best legal starting XI
- Legal formation
- Bench order
- Captain
- Vice-captain

### Clear

Clear the current squad state safely.

### Save Plan

Persist the plan name, players, formation, locks, exclusions, and relevant gameweek state.

## 5. Squad gameweek optimisation

Each saved plan should support `OPTIMISE GWn`.

It must:

- Keep the same 15 players
- Select the best legal XI for that gameweek
- Select formation
- Order the bench
- Select captain and vice-captain
- Apply as one atomic state change
- Support undo

## 6. Visual and responsive quality

New controls must use existing ZEUS:

- Colours
- Type system
- Button heights
- Border radii
- Cards
- Press and hover states
- Disabled states
- Spacing

### Wide desktop

Keep the full toolbar on one deliberate row only when it genuinely fits.

### Normal laptop

Switch to a deliberate grid before controls compress, clip, or overlap. Account for the fixed navigation area.

### Narrower width

Stack controls predictably. Stack the Builder pitch and player panel before the fixed-width panel causes horizontal overflow.

The product remains desktop-first. Responsive work exists to prevent breakage on normal desktop and laptop widths, not to redesign ZEUS as a mobile app.

## 7. Eight-gameweek product horizon

The eventual stable product should:

- Generate and store at least eight gameweeks
- Serve real per-gameweek rows
- Use one coherent generation per gameweek
- Avoid GW1 being relabelled as future weeks
- Support blank and double gameweeks correctly
- Keep future rows on the same engine route

This belongs to data-pipeline Phase 3, not the initial UI PRs.

## 8. Current-team identity

A transferred player must use one resolved current club across:

- Projection engine
- Fixture lookup
- Players labels and filters
- Builder and Squad club limits
- Browser and server loaders
- API brief
- Stored projection rows

The fix must be systematic, not a hard-coded player exception.

## 9. Minutes and predicted line-ups

For a fully validated GW1 predicted XI:

- Named starters receive 100% predicted start probability
- Unnamed players receive zero predicted start probability but may retain realistic substitute probability
- Backup goalkeepers do not receive generic cameo probability
- Start probability is separate from expected minutes when starting
- Unavailable players are zeroed
- Vacated places are redistributed realistically
- Team totals reconcile to 11 starters, one goalkeeper, and 990 expected player-minutes
- GW1 line-up evidence does not leak into later gameweeks

These are model requirements for Phase 4 unless needed to preserve an already working path.

## 10. Coherent projection display

The product must not combine:

- Different generation timestamps
- Different model versions without an explicit migration rule
- Engine projections for some players and final fallback projections for others
- Partial Supabase pages
- Old and new generation rows

Read failures must be visible. Missing current coverage must not become a plausible-looking fallback table.

## 11. Named regression examples

Named players are tests of systems, not targets for manual adjustment:

- Palmer should separate sensibly from Neto and Caicedo through role, minutes, team output, and penalties
- Virgil and Alisson should not collapse through broken starter minutes
- Matheus Nunes should reflect the predicted line-up correctly
- Gomes and Lavia should not inherit obsolete tiny-sample starter minutes
- Lacroix should resolve to his current club
- Osula should not amplify a tiny hot sample through circular role classification
- Gabriel's high output should be decomposed before changing team strength or defender weights

## 12. Not part of baseline recovery

Do not mix these into the first recovery stages:

- Defender-role rebuild
- Full clean-sheet recalibration
- Full BPS implementation
- Goalkeeper penalty-save simulation
- New team-strength model
- New penalty-frequency model
- Player-prop integration
- Full on-pitch interval simulation
- New chip optimisation
- Broad UI redesign
