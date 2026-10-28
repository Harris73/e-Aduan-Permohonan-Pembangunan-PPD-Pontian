// Menjalankan fungsi dalam netlify/functions/ dari cron cPanel (tanpa Netlify).
// Guna: node cpanel/run-function.js archive-to-drive
//       node cpanel/run-function.js cleanup-old-files
// Pembolehubah persekitaran dibaca dari fail .env di akar projek (lihat env.example).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const name = process.argv[2];
if (!['archive-to-drive', 'cleanup-old-files'].includes(name)) {
  console.error('Guna: node cpanel/run-function.js <archive-to-drive|cleanup-old-files>');
  process.exit(2);
}

const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

require(path.join(root, 'netlify', 'functions', name + '.js'))
  .handler()
  .then((res) => {
    console.log(`[${new Date().toISOString()}] ${name}: ${res.statusCode} ${res.body}`);
    process.exit(res.statusCode >= 400 ? 1 : 0);
  })
  .catch((e) => {
    console.error(`[${new Date().toISOString()}] ${name}: ralat`, e);
    process.exit(1);
  });
