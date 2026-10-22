// Build the dashboard into dist/ for Cloudflare Pages (no bundler needed).
// Cloudflare Pages settings: build command `node scripts/build-web.mjs`, output directory `dist`.
// Environment variables (public by design, protected by row-level security):
//   PUBLIC_SUPABASE_URL       https://your-project-id.supabase.co
//   PUBLIC_SUPABASE_ANON_KEY  the publishable / anon key (never the secret key)
// Without them the site builds in preview mode with demo data only.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const url = (process.env.PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const key = (process.env.PUBLIC_SUPABASE_ANON_KEY || '').trim();

if (key.startsWith('sb_secret_') || /service_role/.test(Buffer.from(key.split('.')[1] || '', 'base64').toString())) {
  console.error('PUBLIC_SUPABASE_ANON_KEY is a SECRET key. Use the publishable (anon) key instead. Build stopped.');
  process.exit(1);
}
if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
  console.error('PUBLIC_SUPABASE_URL should look like https://your-project-id.supabase.co. Build stopped.');
  process.exit(1);
}

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/shared', { recursive: true });
cpSync('web', 'dist', { recursive: true });
cpSync('shared/mock.mjs', 'dist/shared/mock.mjs');
writeFileSync('dist/config.js', `export default ${JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key }, null, 2)};\n`);
console.log(url ? `Built dist/ connected to ${url}` : 'Built dist/ in PREVIEW mode (demo data only)');
