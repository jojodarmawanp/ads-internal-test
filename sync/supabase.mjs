// Create a Supabase admin client, with clear errors for the most common setup mistakes.
import { createClient } from '@supabase/supabase-js';

export function checkSupabaseEnv(url = '', key = '') {
  const u = url.trim().replace(/\/+$/, '');
  if (!u) throw new Error('SUPABASE_URL secret is empty.');
  if (/supabase\.com/.test(u)) {
    const ref = u.match(/project\/([a-z0-9]+)/)?.[1];
    throw new Error(`SUPABASE_URL is the dashboard address, not the API address. It should look like ` +
      `https://${ref ?? 'your-project-id'}.supabase.co — update the GitHub secret.`);
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(u)) {
    throw new Error('SUPABASE_URL should look like https://your-project-id.supabase.co (nothing after .co).');
  }
  const k = key.trim();
  if (!k) throw new Error('SUPABASE_SERVICE_ROLE_KEY secret is empty.');
  if (k.startsWith('sb_publishable_')) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is the publishable (public) key. Use the secret key (sb_secret_...) or the legacy service_role key.');
  }
  return { url: u, key: k };
}

export function adminClient() {
  const { url, key } = checkSupabaseEnv(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
