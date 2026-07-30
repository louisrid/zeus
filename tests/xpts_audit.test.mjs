import test from "node:test";
import assert from "node:assert/strict";
import { auditRows, findPlayer, parseCsv, renderMarkdown } from "../jobs/xpts_audit.mjs";

const header = [
  "web_name","team","position","status","xpts","expected_minutes","start_probability",
  "cameo_probability","probability_60_minutes","minutes_source","rate_source","historical_nineties",
  "e_goals","e_assists","e_bonus","e_defcon","used_npxg90","used_xa90","price","p_cs",
].join(",");

function row(name, team, position, start, mins, source, xpts = 3) {
  return [name,team,position,"a",xpts,mins,start,0,Math.min(start,1),source,"understat",30,0.2,0.1,0.2,0.1,0.2,0.1,7,0.3].join(",");
}

test("the audit parser handles quoted commas and exact team-aware player matching", () => {
  const rows = parseCsv(`${header}\n"Palmer, Cole",CHE,MID,a,5,85,1,0,0.9,lineup-starter,understat,30,0.5,0.3,0.6,0,0.5,0.3,10,0.4\nPalmer,BHA,GKP,a,3,90,1,0,1,lineup-starter,understat,30,0,0,0.2,0,0,0,5,0.4\n`);
  assert.equal(rows[0].web_name, "Palmer, Cole");
  assert.equal(findPlayer(rows, "Palmer", "BHA").position, "GKP");
});

test("the audit reports structural gates deterministically", () => {
  const lines = [header];
  for (const team of ["AAA", "BBB"]) {
    lines.push(row(`${team} GK`, team, "GKP", 1, 90, "lineup-starter"));
    for (let i = 0; i < 10; i++) lines.push(row(`${team} P${i}`, team, i < 4 ? "DEF" : i < 8 ? "MID" : "FWD", 1, 90, "lineup-starter"));
  }
  const report = auditRows(parseCsv(lines.join("\n") + "\n"), "test.csv");
  assert.equal(report.checks.teams_start_sum_11.pass, true);
  assert.equal(report.checks.teams_gk_sum_1.pass, true);
  assert.equal(report.checks.team_minutes_990.pass, true);
  assert.match(renderMarkdown(report), /PASS.*Team starts sum to 11/);
});
