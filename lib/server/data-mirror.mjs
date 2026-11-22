/* GITHUB DATA TO THE LIVE SITE (Nov 2026).
 *
 * The data update runs on GitHub (free), but Vercel still builds the site from GitLab. After an update has
 * published on GitHub, this copies the changed data files into GitLab in one commit, and Vercel deploys
 * that as usual. It only ever copies GitHub's data files, only when GitHub's are newer, and does nothing
 * when the two already match, so calling it often is harmless. Uses the tokens already set in Vercel:
 * GITHUB_DISPATCH_TOKEN (read) and GITLAB_TOKEN (write). Once Vercel builds from GitHub, it has nothing
 * left to do. */
const REPO = process.env.GITHUB_REPO || "louisrid/zeus";
const GL = `${process.env.GITLAB_HOST || "https://gitlab.com"}/api/v4/projects/${encodeURIComponent(process.env.GITLAB_PROJECT_ID || "louisjridland/zeus")}`;
export const DATA_FILES = [
  "config/external-xpts-2026-27.mjs", "config/blend-xpts-2026-27.mjs", "tests/fpl-players.json",
  "config/defcon-live-2026-27.mjs", "config/fdr-2026-27.mjs", "config/season-actuals-2026-27.mjs",
  "config/lineups.json", "config/defences.json", "lib/server/lineups-config.generated.mjs",
];
const ghHeaders = () => ({ Authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" });
const glHeaders = () => ({ "PRIVATE-TOKEN": process.env.GITLAB_TOKEN, "Content-Type": "application/json" });

async function lastChange(host, path) {
  const res = host === "github"
    ? await fetch(`https://api.github.com/repos/${REPO}/commits?sha=main&path=${encodeURIComponent(path)}&per_page=1`, { headers: ghHeaders(), cache: "no-store" })
    : await fetch(`${GL}/repository/commits?ref_name=main&path=${encodeURIComponent(path)}&per_page=1`, { headers: glHeaders(), cache: "no-store" });
  if (!res.ok) throw new Error(`${host} commits: ${res.status}`);
  const rows = await res.json();
  const row = rows[0];
  if (!row) return null;
  return { sha: row.sha || row.id, at: Date.parse(host === "github" ? row.commit.committer.date : row.committed_date) };
}

export async function mirrorData() {
  if (!process.env.GITHUB_DISPATCH_TOKEN || !process.env.GITLAB_TOKEN) return { ok: false, reason: "tokens missing" };
  const [gh, gl] = await Promise.all([lastChange("github", "config/external-xpts-2026-27.mjs"), lastChange("gitlab", "config/external-xpts-2026-27.mjs")]);
  if (!gh) return { ok: true, copied: 0, reason: "no data on GitHub" };
  if (gl && gl.at >= gh.at) return { ok: true, copied: 0, reason: "GitLab already has the newest data" };
  const head = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, { headers: ghHeaders(), cache: "no-store" }).then((r) => r.json());
  const ref = head.sha;
  const actions = [];
  for (const path of DATA_FILES) {
    const raw = await fetch(`https://raw.githubusercontent.com/${REPO}/${ref}/${path}`, { cache: "no-store" });
    if (!raw.ok) continue;
    const content = Buffer.from(await raw.arrayBuffer());
    const current = await fetch(`${GL}/repository/files/${encodeURIComponent(path)}/raw?ref=main`, { headers: glHeaders(), cache: "no-store" });
    const same = current.ok && Buffer.from(await current.arrayBuffer()).equals(content);
    if (!same) actions.push({ action: current.ok ? "update" : "create", file_path: path, content: content.toString("base64"), encoding: "base64" });
  }
  if (!actions.length) return { ok: true, copied: 0, reason: "files already match" };
  const res = await fetch(`${GL}/repository/commits`, {
    method: "POST", headers: glHeaders(), cache: "no-store",
    body: JSON.stringify({ branch: "main", commit_message: `data update from GitHub ${ref.slice(0, 7)}`, actions }),
  });
  if (!res.ok) return { ok: false, reason: `GitLab commit ${res.status}: ${(await res.text()).slice(0, 200)}` };
  return { ok: true, copied: actions.length, from: ref.slice(0, 7) };
}
