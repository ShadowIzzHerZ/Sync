import { supabase } from "./config.js";
import { setState } from "./state.js";

/** Fetch (or lazily wait for) this user's profile row created by the DB trigger. */
export async function loadProfile(userId) {
  // The `handle_new_user` trigger inserts the profile row on signup, but on a
  // brand new signup there can be a brief race before it lands. Retry a few
  // times with a short backoff instead of failing the whole session load.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, role, display_name, created_at, coverage_lat, coverage_lng")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
    await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  return null;
}

export async function signUpWithEmail(email, password, displayName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: displayName ? { display_name: displayName } : undefined,
    },
  });
  if (error) throw error;

  // If email confirmation is required, supabase returns a user but no
  // session — the caller needs to know which happened.
  const needsEmailConfirmation = !data.session;

  if (data.session && displayName) {
    await supabase
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", data.user.id);
  }

  return { needsEmailConfirmation, user: data.user };
}

export async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  await supabase.auth.signOut();
  setState({ session: null, profile: null, reports: [] });
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}
