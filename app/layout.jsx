import "./globals.css";
import Shell from "../components/Shell";

export const metadata = { title: "FPLBot", description: "FPLBot , the FPL 2026/27 campaign tool" };

/* THE SINGLE MOST IMPORTANT LINE FOR MOBILE.
 *
 * Without a viewport declaration a phone assumes the page was written for a desktop, lays it out at a
 * notional 980px and then zooms the whole thing out to fit. Every font becomes unreadable and every tap
 * target becomes too small, no matter how well the layout is written. Declaring device width tells the
 * browser to use the real screen instead.
 *
 * maximumScale is deliberately absent. Locking zoom is a common habit and it is an accessibility
 * failure: someone who needs to pinch to read a price must be able to. viewportFit=cover lets the
 * background reach the edges on notched phones, and the safe-area insets in globals.css keep the
 * bottom navigation clear of the home indicator. */
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0D0014",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
