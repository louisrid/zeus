"use client";
import React from "react";

/* WHERE MOBILE STARTS.
 *
 * 768 rather than a phone's real width, because the desktop layout is not merely wide, it is built from
 * fixed grid tracks that total about 1330px on the players table alone. Anything under 768 is a phone
 * held upright; between 768 and 1100 is a tablet or a narrow window, where the desktop layout still
 * works because it can scroll horizontally without becoming unreadable. */
export const MOBILE_MAX_WIDTH = 767;
export const MOBILE_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`;

/* HYDRATION IS WHY THIS IS NOT A ONE-LINER.
 *
 * The server has no window, so it cannot know the screen width. If the first client render disagreed
 * with the server's HTML, React would throw a hydration mismatch and remount the tree, which on a phone
 * shows as a visible flash and loses any state the page had already built.
 *
 * useSyncExternalStore exists precisely for this: getServerSnapshot returns false so the server always
 * renders the desktop tree, getSnapshot reads the real media query on the client, and React reconciles
 * the difference in a single pass rather than treating it as an error. The CSS in globals.css hides the
 * desktop rail below the same breakpoint, so the one frame before this settles is not visible either. */
const subscribe = (onChange) => {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const list = window.matchMedia(MOBILE_QUERY);
  /* Safari below 14 has no addEventListener on MediaQueryList, only the deprecated addListener. Falling
     back keeps older iPhones working rather than silently never updating on rotate. */
  if (list.addEventListener) {
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }
  list.addListener(onChange);
  return () => list.removeListener(onChange);
};

const getSnapshot = () => {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(MOBILE_QUERY).matches;
};

const getServerSnapshot = () => false;

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/* True only once the browser has taken over. Some things genuinely cannot render on the server, and a
   component that needs to measure or read the viewport should wait rather than guess. */
export function useMounted() {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return mounted;
}
