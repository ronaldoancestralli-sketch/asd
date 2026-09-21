import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.2?bundle';

const SUPABASE_URL =
  'https://nqklhsfaqpbjqmfzjzxk.supabase.co';

const SUPABASE_ANON_KEY =
  'sb_publishable_20kuwDQ9LpRI10-hR2kXkA_pu4eVBmC';

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'echo-arena-auth'
    }
  }
);