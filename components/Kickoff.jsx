"use client";
import React from "react";

/* A KICKOFF IN THE READER'S OWN CLOCK.
 *
 * The fixtures table formatted kickoffs on the server, which runs in UTC. Through the winter that is an
 * hour off for anyone in Britain and further out elsewhere, so a 15:00 Saturday match was listed as
 * 14:00 with nothing to say it was not local. Formatting on the server is also what makes a page crash
 * rather than merely mislead when the component is interactive: the server and the browser produce
 * different text for the same instant and React treats that as a hydration mismatch.
 *
 * So it is rendered twice on purpose. The first pass, which the server also produces, shows the plain
 * UTC form and is therefore identical in both places. Once mounted, the browser replaces it with the
 * local reading. Nothing flickers between two wrong answers: it goes from a correct UTC time to a
 * correct local one.
 */
export default function Kickoff({ iso }) {
  const [local, setLocal] = React.useState(null);

  React.useEffect(() => {
    if (!iso) return;
    const when = new Date(iso);
    if (Number.isNaN(when.getTime())) return;
    setLocal(when.toLocaleString(undefined, {
      weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    }));
  }, [iso]);

  if (!iso) return "TBC";
  if (local) return local;
  /* Deterministic on both sides: the stored instant, trimmed, with its zone named rather than implied. */
  return `${String(iso).slice(0, 16).replace("T", " ")} UTC`;
}
