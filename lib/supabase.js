"use client";
// Browser client: anon key, read-only under RLS. Re-exported from lib/data so the app holds
// exactly one instance. Creating a second here caused duplicate GoTrueClient instances.
import { sb } from "./data";

export const supabase = sb();
