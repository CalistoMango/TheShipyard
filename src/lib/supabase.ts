import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

// Browser client (for client-side use - read only)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server client factory (for API routes - uses service role key for writes)
// IMPORTANT: This bypasses RLS, use only in API routes with proper auth validation
export function createServerClient() {
  // Use service role key if available, otherwise fall back to anon key
  const key = supabaseServiceKey || supabaseAnonKey;
  if (!supabaseServiceKey) {
    console.warn("SUPABASE_SERVICE_ROLE_KEY not set - server writes may fail with RLS");
  }
  return createClient(supabaseUrl, key);
}
