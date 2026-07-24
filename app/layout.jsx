import "./globals.css";
import Shell from "../components/Shell";

export const metadata = { title: "FPL. Rank One", description: "FPL 2026/27 campaign tool" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
