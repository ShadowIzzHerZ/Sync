// ---------------------------------------------------------------------------
// Supabase project configuration.
//
// The key below is a *publishable* key (safe to ship to the browser — it has
// no privileges beyond what Row Level Security grants the `anon` /
// `authenticated` roles). It is intentionally not a secret.
// ---------------------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SUPABASE_URL = "https://mpduaztlanucevfbpaip.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_rDXMQ1jB-V2RGPhcWqPbEg_dIpxKZBl";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export const REPORT_PHOTO_BUCKET = "report-photos";

export const STATUS_LABELS = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};
