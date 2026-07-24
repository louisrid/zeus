import Link from "next/link";

export default function LegacyIndex() {
  const items = [
    ["Dashboard v0", "/legacy/dashboard"],
    ["Players v0", "/legacy/players"],
  ];
  return (
    <div style={{ maxWidth: 640, paddingTop: 40, display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ color: "rgba(255,255,255,0.85)", fontFamily: "'Outfit',sans-serif", fontSize: 17, lineHeight: 1.6, margin: 0 }}>
        Frozen copies of previous screen versions, kept on live data for side-by-side comparison. These never change.
      </p>
      {items.map(([name, href]) => (
        <Link key={href} href={href} style={{ textDecoration: "none" }}>
          <div style={{ background: "#1E0630", border: "1px solid #3A1150", borderRadius: 16, padding: "18px 22px",
            color: "#FFFFFF", fontFamily: "'Outfit',sans-serif", fontSize: 17, fontWeight: 700 }}>
            {name} →
          </div>
        </Link>
      ))}
    </div>
  );
}
