export const metadata = { title: "FPL. Rank One" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0D0014", color: "#FFFFFF", fontFamily: "sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
