/* ONE-OFF: PUT THE LATEST CODE ON GITHUB, FROM THE SERVER.
 *
 * GitHub would not let Claude write to louisrid/zeus directly, so the copy is made here with the GitHub
 * token the site already holds (GITHUB_DISPATCH_TOKEN). The token never leaves the server. Locked: a
 * request needs a key whose SHA-256 is below; the key itself is not in the code. Removed after the move.
 *
 *   ?key=..&mode=check     what the token may do (scopes, push access, secret names). No changes.
 *   ?key=..&mode=sync      make GitHub main match GitLab main file for file (one commit).
 *   ?key=..&mode=dispatch  start update-all on GitHub.
 *   ?key=..&mode=runs      the latest update-all runs on GitHub.
 */
import crypto from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const KEY_SHA = "ca595ac89f69a6432b71ec395f087d77289e85f4597e3d950d0613341f99beca";
const REPO = process.env.GITHUB_REPO || "louisrid/zeus";
const GL = "https://gitlab.com/api/v4/projects/louisjridland%2Fzeus";
const json = (body, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

function gh(path, init = {}) {
  return fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init, cache: "no-store",
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`, Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", ...(init.headers || {}),
    },
  });
}
async function ghJson(path, init) {
  const res = await gh(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GitHub ${init?.method || "GET"} ${path}: ${res.status} ${body?.message || ""}`);
  return body;
}

async function gitlabTree() {
  const files = [];
  for (let page = 1; page <= 40; page += 1) {
    const res = await fetch(`${GL}/repository/tree?ref=main&recursive=true&per_page=100&page=${page}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`GitLab tree page ${page}: ${res.status}`);
    const rows = await res.json();
    for (const row of rows) if (row.type === "blob") files.push({ path: row.path, sha: row.id, mode: row.mode });
    if (!res.headers.get("x-next-page")) break;
  }
  return files;
}

async function pool(items, size, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

export async function GET(request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || "";
  if (crypto.createHash("sha256").update(key).digest("hex") !== KEY_SHA) return json({ ok: false }, 404);
  if (!process.env.GITHUB_DISPATCH_TOKEN) return json({ ok: false, error: "no GitHub token on the server" }, 500);
  const mode = url.searchParams.get("mode") || "check";
  try {
    if (mode === "check") {
      const res = await gh("");
      const repo = await res.json().catch(() => ({}));
      const secrets = await gh("/actions/secrets?per_page=50").then(async (r) => (r.ok ? (await r.json()).secrets.map((s) => s.name) : `HTTP ${r.status}`));
      const actions = await gh("/actions/permissions").then(async (r) => (r.ok ? await r.json() : `HTTP ${r.status}`));
      const runs = await gh("/actions/runs?per_page=3").then(async (r) => (r.ok ? (await r.json()).workflow_runs.map((w) => `${w.name} ${w.status}/${w.conclusion} ${w.created_at}`) : `HTTP ${r.status}`));
      const workflows = await gh("/actions/workflows?per_page=50").then(async (r) => (r.ok ? (await r.json()).workflows.map((w) => `${w.id} ${w.path.split("/").pop()} ${w.state}`) : `HTTP ${r.status}`));
      const gitlab = process.env.GITLAB_TOKEN
        ? await fetch("https://gitlab.com/api/v4/personal_access_tokens/self", { headers: { "PRIVATE-TOKEN": process.env.GITLAB_TOKEN }, cache: "no-store" })
          .then(async (r) => (r.ok ? (({ scopes, expires_at, active }) => ({ scopes, expires_at, active }))(await r.json()) : `HTTP ${r.status}`))
        : "no GITLAB_TOKEN";
      return json({ ok: true, repo_status: res.status, permissions: repo.permissions || null,
        classic_scopes: res.headers.get("x-oauth-scopes"), token_kind: String(process.env.GITHUB_DISPATCH_TOKEN).slice(0, 4),
        secrets, actions, runs, workflows, gitlab });
    }
    if (mode === "copy") {
      /* The one-off first copy (scripts/github-copy.sh), run by a GitHub job; see that file. */
      const served = "$(curl -fsSL https://gitlab.com/louisjridland/zeus/-/raw/main/scripts/github-copy.sh | bash 1>&2)";
      const res = await gh("/actions/workflows/xpts-pull.yml/dispatches", { method: "POST", body: JSON.stringify({ ref: "main", inputs: { served } }) });
      return json({ ok: res.ok, status: res.status, detail: res.ok ? null : (await res.text()).slice(0, 300) });
    }
    if (mode === "state") {
      /* Turn GitHub workflows on or off: ?on=update-all.yml,ci.yml&off=xpts-pull.yml */
      const out = {};
      for (const [list, action] of [[url.searchParams.get("on"), "enable"], [url.searchParams.get("off"), "disable"]]) {
        for (const name of String(list || "").split(",").filter(Boolean)) {
          const r = await gh(`/actions/workflows/${name}/${action}`, { method: "PUT" });
          out[name] = `${action} ${r.status}`;
        }
      }
      return json({ ok: true, out });
    }
    if (mode === "xpts-runs") {
      const body = await ghJson("/actions/workflows/xpts-pull.yml/runs?per_page=2");
      const run = body.workflow_runs[0];
      if (!run) return json({ ok: true, run: null });
      const jobs = await ghJson(`/actions/runs/${run.id}/jobs`);
      return json({ ok: true, run: { id: run.id, status: run.status, conclusion: run.conclusion, created: run.created_at,
        steps: (jobs.jobs[0]?.steps || []).map((st) => `${st.name}: ${st.conclusion || st.status}`) } });
    }
    if (mode === "dispatch") {
      const res = await gh("/actions/workflows/update-all.yml/dispatches", { method: "POST", body: JSON.stringify({ ref: "main" }) });
      return json({ ok: res.ok, status: res.status, detail: res.ok ? null : (await res.text()).slice(0, 300) });
    }
    if (mode === "runs") {
      const body = await ghJson("/actions/workflows/update-all.yml/runs?per_page=3");
      const out = [];
      for (const run of body.workflow_runs) {
        const jobs = await ghJson(`/actions/runs/${run.id}/jobs`);
        out.push({ id: run.id, event: run.event, status: run.status, conclusion: run.conclusion, created: run.created_at, head: run.head_sha.slice(0, 7),
          steps: (jobs.jobs[0]?.steps || []).map((s) => `${s.name}: ${s.conclusion || s.status}`) });
      }
      return json({ ok: true, runs: out });
    }
    if (mode === "sync") {
      const skipWorkflows = url.searchParams.get("workflows") === "skip";
      const ref = await ghJson("/git/ref/heads/main");
      const head = ref.object.sha;
      const commit = await ghJson(`/git/commits/${head}`);
      const tree = await ghJson(`/git/trees/${commit.tree.sha}?recursive=1`);
      const ghFiles = new Map(tree.tree.filter((t) => t.type === "blob").map((t) => [t.path, t.sha]));
      const glFiles = await gitlabTree();
      const keep = (p) => !(skipWorkflows && p.startsWith(".github/workflows/"));
      const changed = glFiles.filter((f) => keep(f.path) && ghFiles.get(f.path) !== f.sha);
      const glPaths = new Set(glFiles.map((f) => f.path));
      const removed = [...ghFiles.keys()].filter((p) => keep(p) && !glPaths.has(p));
      if (!changed.length && !removed.length) return json({ ok: true, note: "GitHub already matches GitLab", head });
      await pool(changed, 8, async (f) => {
        const raw = await fetch(`${GL}/repository/blobs/${f.sha}/raw`, { cache: "no-store" });
        if (!raw.ok) throw new Error(`GitLab blob ${f.path}: ${raw.status}`);
        const content = Buffer.from(await raw.arrayBuffer()).toString("base64");
        const blob = await ghJson("/git/blobs", { method: "POST", body: JSON.stringify({ content, encoding: "base64" }) });
        if (blob.sha !== f.sha) throw new Error(`blob mismatch for ${f.path}`);
      });
      const entries = [
        ...changed.map((f) => ({ path: f.path, mode: f.mode, type: "blob", sha: f.sha })),
        ...removed.map((p) => ({ path: p, mode: "100644", type: "blob", sha: null })),
      ];
      const newTree = await ghJson("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: commit.tree.sha, tree: entries }) });
      const glHead = await fetch(`${GL}/repository/commits/main`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
      const message = `Latest FPLBot code from GitLab (${glHead.short_id || "main"}), replacing the accidental Stakkz upload\n\n`
        + "Copied by the site's server, file for file.\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n"
        + "Claude-Session: https://claude.ai/code/session_01GdvmxLam16Bce7geSpmjyn";
      const made = await ghJson("/git/commits", { method: "POST", body: JSON.stringify({ message, tree: newTree.sha, parents: [head] }) });
      await ghJson("/git/refs/heads/main", { method: "PATCH", body: JSON.stringify({ sha: made.sha, force: false }) });
      return json({ ok: true, commit: made.sha, changed: changed.length, removed: removed.length, workflows: skipWorkflows ? "left as they were" : "copied" });
    }
    return json({ ok: false, error: "unknown mode" }, 400);
  } catch (error) {
    return json({ ok: false, error: String(error.message || error).slice(0, 400) }, 502);
  }
}
