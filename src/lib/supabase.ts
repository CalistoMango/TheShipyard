import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

// Browser client (for client-side use)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server client factory (for API routes)
export function createServerClient() {
  return createClient(supabaseUrl, supabaseAnonKey);
}
