// B-04 · Layer 3 — minutes as hazard.
// Minutes multiply every other component, so this layer gets the most careful treatment and the
// loudest honesty about its current state: v1 is an empirical-Bayes start rate, not the
// isotonic-calibrated LightGBM classifier the spec targets. That upgrade is B-04 proper, after
// the archive supports walk-forward training. Every value it produces is stamped with its source.

const MODEL_SOURCE = "empirical_bayes_v1";

function priorFromPrice(price, params) {
  const bands = params.layer3.start_prior_by_price_band.value;
  for (const b of bands) if (price <= b.max_price) return b.p_start;
  return bands[bands.length - 1].p_start;
}

/* P(start), shrunk from the trailing start rate toward the price-band prior.
   Presser signals and FPL's own chance_of_playing then act as multipliers — the presser is
   information the market has not priced, chance_of_playing is information it has. */
export function pStart(player, params) {
  const k = params.layer3.start_prior_k.value;
  const prior = priorFromPrice(Number(player.price || 4.5), params);
  const apps = Number(player.recent_apps || 0);
  const starts = Number(player.recent_starts || 0);
  let p = (starts + k * prior) / (apps + k);

  const sig = player.presser_signal;
  if (sig) {
    const effects = params.layer3.presser_signal_effect.value;
    const eff = effects[sig.signal];
    if (eff !== undefined) {
      const c = Math.max(0, Math.min(1, Number(sig.confidence ?? 0.5)));
      p = p * ((1 - c) + c * eff);
    }
  }
  if (player.chance_of_playing !== null && player.chance_of_playing !== undefined) {
    p = p * (Number(player.chance_of_playing) / 100);
  }
  if (player.status && player.status !== "a" && player.status !== "d") p = 0;
  if (player.wc_load_flag) p = p * params.layer3.wc_load_flag_effect.value;

  return Math.max(0, Math.min(1, p));
}

export function minutesForecast(player, params) {
  const ps = pStart(player, params);
  const appearRate = Number(player.recent_apps || 0) > 0
    ? Math.min(1, Number(player.recent_appearances || player.recent_apps) / Number(player.recent_apps))
    : ps;
  const pAppear = Math.max(ps, Math.min(1, ps + (1 - ps) * Math.max(0, appearRate - ps)));
  const pCameo = Math.max(0, pAppear - ps);
  const p60GivenStart = Number(player.p60_given_start ?? params.layer3.p60_given_start.value);
  const p60 = ps * p60GivenStart + pCameo * params.layer3.p_sub_on_before_30.value;

  return {
    p_start: +ps.toFixed(4),
    p_cameo: +pCameo.toFixed(4),
    p60: +p60.toFixed(4),
    exp_min_start: Number(player.exp_min_start ?? params.layer3.start_minutes.value),
    exp_min_cameo: Number(player.exp_min_cameo ?? params.layer3.cameo_minutes.value),
    wc_load_flag: Boolean(player.wc_load_flag),
    source: MODEL_SOURCE,
  };
}

/* Lineup coherence. Two strikers competing for one slot must never both start in the same
   simulation, so XIs are generated as whole scenarios and sampled as units.
   Beam search over P(start) respecting the formation minimums in the rules JSON. */
export function lineupScenarios(players, rules, params, M) {
  const limit = M || params.layer3.lineup_scenarios.value;
  const mins = rules.squad.formation_minimums.value;
  const sorted = [...players].sort((a, b) => b.p_start - a.p_start);

  const byPos = { GKP: [], DEF: [], MID: [], FWD: [] };
  for (const p of sorted) if (byPos[p.position]) byPos[p.position].push(p);

  // Beam over the plausible band: everyone above a floor is a candidate, the rest are locked out.
  const candidates = sorted.filter((p) => p.p_start > 0.02);
  let beam = [{ xi: [], logp: 0, counts: { GKP: 0, DEF: 0, MID: 0, FWD: 0 }, i: 0 }];

  for (let idx = 0; idx < candidates.length; idx++) {
    const p = candidates[idx];
    const next = [];
    for (const st of beam) {
      const remaining = candidates.length - idx - 1;
      const slotsLeft = 11 - st.xi.length;
      if (slotsLeft > 0 && remaining >= slotsLeft - 1) {
        // option: exclude
        next.push({ ...st, logp: st.logp + Math.log(Math.max(1e-6, 1 - p.p_start)) });
      }
      if (slotsLeft > 0 && canAdd(st.counts, p.position, st.xi.length, mins)) {
        next.push({
          xi: [...st.xi, p],
          logp: st.logp + Math.log(Math.max(1e-6, p.p_start)),
          counts: { ...st.counts, [p.position]: st.counts[p.position] + 1 },
        });
      }
    }
    next.sort((a, b) => b.logp - a.logp);
    beam = next.slice(0, Math.max(limit * 4, 80));
  }

  const complete = beam.filter((s) => s.xi.length === 11 && legal(s.counts, mins)).slice(0, limit);
  const fallback = complete.length ? complete : [{ xi: greedyXI(byPos, mins), logp: 0 }];
  const max = Math.max(...fallback.map((s) => s.logp));
  const weights = fallback.map((s) => Math.exp(s.logp - max));
  const sum = weights.reduce((a, b) => a + b, 0);
  return fallback.map((s, i) => ({ xi: s.xi, p: weights[i] / sum }));
}

function canAdd(counts, pos, size, mins) {
  if (pos === "GKP" && counts.GKP >= mins.GKP_exact) return false;
  const caps = { GKP: mins.GKP_exact, DEF: 5, MID: 5, FWD: 3 };
  if (counts[pos] >= caps[pos]) return false;
  const after = { ...counts, [pos]: counts[pos] + 1 };
  const slotsAfter = 11 - (size + 1);
  const need = Math.max(0, mins.GKP_exact - after.GKP) + Math.max(0, mins.DEF_min - after.DEF)
    + Math.max(0, mins.MID_min - after.MID) + Math.max(0, mins.FWD_min - after.FWD);
  return need <= slotsAfter;
}
function legal(c, mins) {
  return c.GKP === mins.GKP_exact && c.DEF >= mins.DEF_min && c.MID >= mins.MID_min && c.FWD >= mins.FWD_min;
}
function greedyXI(byPos, mins) {
  const xi = [...byPos.GKP.slice(0, mins.GKP_exact), ...byPos.DEF.slice(0, mins.DEF_min),
    ...byPos.MID.slice(0, mins.MID_min), ...byPos.FWD.slice(0, mins.FWD_min)];
  const rest = [...byPos.DEF.slice(mins.DEF_min), ...byPos.MID.slice(mins.MID_min), ...byPos.FWD.slice(mins.FWD_min)]
    .sort((a, b) => b.p_start - a.p_start);
  while (xi.length < 11 && rest.length) xi.push(rest.shift());
  return xi;
}

/* Sample a scenario index from the weighted list. */
export function sampleScenario(scenarios, rand) {
  const u = rand();
  let acc = 0;
  for (const s of scenarios) { acc += s.p; if (u <= acc) return s; }
  return scenarios[scenarios.length - 1];
}
