import "./globals.css";
import Shell from "../components/Shell";

/* EVERY TAB NAMED FOR WHAT IT IS.
 *
 * Every page reported the same title, so six open tabs read "FPLBot" six times and browser history was
 * a list of identical entries. The template lets each page supply its own name and keeps the app's name
 * after it, which is the convention every browser tab bar is designed around.
 *
 * The Apple entries are what make "Add to Home Screen" behave like an app rather than a bookmark: the
 * status bar blends into the dark header instead of sitting as a white strip above it. */
export const metadata = {
  title: { template: "%s · FPLBot", default: "FPLBot" },
  description: "FPLBot, the FPL 2026/27 campaign tool",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "FPLBot" },
  /* The standard tag alongside the Apple one. Chrome warns that the Apple-only form is deprecated;
     iOS still reads its own. Both are needed, so both are here. */
  other: { "mobile-web-app-capable": "yes" },
};

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

/* data-build on <html> is the build this page was made from, stamped on the page itself so the reload
   check knows what it is running without having to ask. Asking first and remembering the answer fails
   when a phone restores a tab from memory after a deploy: the first answer is already the new build,
   and the old page never learns it is old. */
export default function RootLayout({ children }) {
  return (
    <html lang="en" data-build={(process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "").slice(0, 7) || undefined}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
