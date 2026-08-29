import { supabase, REPORT_PHOTO_BUCKET } from "./config.js";

const TICKET_COLUMNS = `id, description, photo_url, lat, lng, status, ai_label, ai_confidence,
   severity, severity_label, cluster_id, duplicate_count, confirmation_count,
   reporter_id, reporter_display_name, created_at, eta_status, eta_updated_at,
   assigned_staff_id, assigned_staff_name,
   category:categories ( id, name, slug, icon )`;

export async function fetchCategories() {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, icon, is_active")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data;
}

/** One row per cluster (its master report) — duplicates are folded in, not listed separately. */
export async function fetchReports() {
  const { data, error } = await supabase
    .from("report_tickets")
    .select(TICKET_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/**
 * Every report a citizen personally submitted — unlike fetchReports(),
 * this includes ones that got folded into someone else's cluster (those
 * are excluded from report_tickets since they're not a cluster's master).
 */
export async function fetchMyReports(userId) {
  const { data, error } = await supabase
    .from("reports")
    .select(
      `id, description, photo_url, lat, lng, status, ai_label, ai_confidence,
       severity, severity_label, cluster_id, eta_status, eta_updated_at,
       reporter_id, reporter_display_name, created_at,
       category:categories ( id, name, slug, icon )`,
    )
    .eq("reporter_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

async function fetchTicketByClusterId(clusterId) {
  const { data, error } = await supabase
    .from("report_tickets")
    .select(TICKET_COLUMNS)
    .eq("cluster_id", clusterId)
    .single();
  if (error) throw error;
  return data;
}

export async function uploadReportPhoto(userId, file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(REPORT_PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(REPORT_PHOTO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Inserts the report, then resolves what actually happened to it: a
 * database trigger may have folded it into an existing nearby cluster of
 * the same category instead of making it a new independent pin. Returns
 * the resulting ticket (the cluster's master row, with fresh counts) plus
 * whether this submission was the one that created that cluster.
 */
export async function createReport({
  reporterId,
  reporterDisplayName,
  categoryId,
  description,
  photoUrl,
  lat,
  lng,
  aiLabel,
  aiConfidence,
  severity,
  severityLabel,
}) {
  const { data: inserted, error } = await supabase
    .from("reports")
    .insert({
      reporter_id: reporterId,
      reporter_display_name: reporterDisplayName,
      category_id: categoryId,
      description,
      photo_url: photoUrl,
      lat,
      lng,
      ai_label: aiLabel ?? null,
      ai_confidence: aiConfidence ?? null,
      severity: severity ?? null,
      severity_label: severityLabel ?? null,
    })
    .select("id, cluster_id")
    .single();
  if (error) throw error;

  const ticket = await fetchTicketByClusterId(inserted.cluster_id);
  return { ticket, merged: inserted.cluster_id !== inserted.id };
}

export async function updateReportStatus(reportId, status) {
  const { data, error } = await supabase
    .from("reports")
    .update({ status })
    .eq("id", reportId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteReport(reportId) {
  const { error } = await supabase.from("reports").delete().eq("id", reportId);
  if (error) throw error;
}

/** Admin/staff-only (RLS-enforced): sets the expected-fix-time shown to the reporting citizen. */
export async function updateReportEta(reportId, etaStatus, staffId) {
  const { data, error } = await supabase
    .from("reports")
    .update({
      eta_status: etaStatus,
      eta_updated_at: new Date().toISOString(),
      eta_set_by: staffId,
    })
    .eq("id", reportId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** One tap "still an issue?" — bumps a cluster's confidence. Idempotent per user. */
export async function confirmReport(masterReportId, userId) {
  const { error } = await supabase
    .from("report_confirmations")
    .insert({ master_report_id: masterReportId, user_id: userId });
  if (error) {
    if (error.code === "23505") {
      // unique_violation — they've already confirmed this one.
      const alreadyConfirmed = new Error("You've already confirmed this report.");
      alreadyConfirmed.alreadyConfirmed = true;
      throw alreadyConfirmed;
    }
    throw error;
  }
}

export async function submitFeedback({ userId, message, rating }) {
  const { error } = await supabase
    .from("feedback")
    .insert({ user_id: userId, message, rating: rating ?? null });
  if (error) throw error;
}

/**
 * Sets/clears a staff member's own "coverage point" — the location new
 * reports auto-route toward by nearest distance (assign_nearest_staff() DB
 * trigger). Pass lat/lng as null to opt this account out of auto-assignment.
 */
export async function updateMyCoverageLocation(userId, lat, lng) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ coverage_lat: lat, coverage_lng: lng })
    .eq("id", userId)
    .select("id, coverage_lat, coverage_lng")
    .single();
  if (error) throw error;
  return data;
}

/**
 * Live updates for the admin dashboard: fires `onChange(eventType)` — one of
 * "INSERT"/"UPDATE"/"DELETE" — whenever any row in `reports` changes.
 * Callers refetch rather than trying to patch the payload in by hand (the
 * payload is the raw `reports` row, not the report_tickets/category-joined
 * shape the dashboard actually renders). Returns an unsubscribe function.
 * Requires `reports` to be in the `supabase_realtime` publication (already
 * done via migration).
 */
export function subscribeToReportChanges(onChange) {
  const channel = supabase
    .channel("admin-reports-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, (payload) =>
      onChange(payload.eventType),
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

/** Staff/admin-only (RLS-enforced via feedback_select_own_or_staff): every citizen's feedback, newest first. */
export async function fetchFeedback() {
  const { data, error } = await supabase
    .from("feedback")
    .select("id, message, rating, created_at, user:profiles ( id, display_name, email )")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
