import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = "https://kkrbmuwwaxejfdqiczee.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrcmJtdXd3YXhlamZkcWljemVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0ODc4MjYsImV4cCI6MjA3ODA2MzgyNn0.YtBWvo2DA9x49dN5C14jHRxWD4Hes7tOMnxMAdED86A";

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
