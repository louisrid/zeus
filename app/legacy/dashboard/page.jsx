/* RETIRED. An older duplicate UI that was still reachable in the deployed app. It now sends anyone who
   lands here to the live dashboard rather than showing a stale interface. */
import { redirect } from "next/navigation";
export default function RetiredLegacyRoute() { redirect("/"); }
