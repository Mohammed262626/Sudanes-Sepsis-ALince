import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

// Build-time client only; pages prerender and the form islands use their own client.
export const supabase = url && key ? createClient(url, key) : null;
