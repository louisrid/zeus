import { createClient } from "@supabase/supabase-js";

export const revalidate = 60;

export default async function Home() {
  let rows = [];
  let error = null;
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    const { data, error: e } = await supabase
      .from("pipeline_heartbeats")
      .select("*")
      .order("job_name");
    if (e) error = e.message;
    rows = data || [];
  } catch (e) {
    error = String(e);
  }
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "60px 24px" }}>
      <h1 style={{ letterSpacing: "0.06em" }}>FPL. <span style={{ color: "#00FF85" }}>DATA SPINE</span></h1>
      <p style={{ opacity: 0.7 }}>A-01 placeholder — B-12 replaces this with the real scaffold. Heartbeats below prove the pipeline and read-only RLS both work.</p>
      {error && <p style={{ color: "#E90052" }}>Read failed: {error}</p>}
      {!error && rows.length === 0 && <p style={{ opacity: 0.7 }}>No heartbeats yet — run the fpl-pull Action.</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {rows.map((r) => (
          <li key={r.job_name} style={{ padding: "10px 14px", margin: "8px 0", background: "#1E0630", borderRadius: 10, display: "flex", justifyContent: "space-between" }}>
            <span>{r.job_name}</span>
            <span style={{ color: r.status === "ok" ? "#00FF85" : "#E90052" }}>
              {r.status} · {r.last_success_at ? new Date(r.last_success_at).toUTCString() : "never"}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
