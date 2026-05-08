// Injects Supabase credentials from environment variables at build time.
// Never hardcode credentials. Add supabase-config.js to .gitignore.

const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
const vapidKey = (process.env.VAPID_PUBLIC_KEY || '').trim();

if (!url || !key) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.');
  process.exit(1);
}

const content = `// Auto-generated at build time. Do not edit or commit.
const SUPABASE_URL = "${url}";
const SUPABASE_ANON_KEY = "${key}";
const CTB_VAPID_PUBLIC_KEY = "${vapidKey}";
`;

fs.writeFileSync(path.join(__dirname, '..', 'supabase-config.js'), content);
console.log('✅ supabase-config.js generated.');
