// Scheduled (see netlify.toml). Copies new evidence files from Supabase Storage
// to a Google Drive folder, then stores the Drive link on the report.
//
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//           GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN,
//           GDRIVE_FOLDER_ID, DRIVE_PUBLIC_LINKS (optional, "true" = anyone with link can view)
const { createClient } = require('@supabase/supabase-js');

const BUCKET = 'evidence';
const MAX_FILES_PER_RUN = 8;
const TIME_BUDGET_MS = 22000; // scheduled functions are limited to ~30 s
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error('Google token error: ' + (json.error_description || json.error));
  return json.access_token;
}

async function uploadToDrive(token, name, mime, buffer) {
  const boundary = 'eaduan' + Date.now();
  const meta = JSON.stringify({ name, parents: [process.env.GDRIVE_FOLDER_ID] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error('Drive upload error: ' + (json.error?.message || res.status));

  if (process.env.DRIVE_PUBLIC_LINKS === 'true') {
    await fetch(`https://www.googleapis.com/drive/v3/files/${json.id}/permissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });
  }
  return json; // { id, webViewLink }
}

async function run() {
  const started = Date.now();
  const need = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GDRIVE_FOLDER_ID'];
  const missing = need.filter((k) => !process.env[k]);
  if (missing.length) return { statusCode: 500, body: 'Missing env: ' + missing.join(', ') };

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: files, error } = await sb
    .from('file_metadata')
    .select('id, report_id, file_path, kind')
    .is('archived_at', null)
    .order('created_at', { ascending: true })
    .limit(MAX_FILES_PER_RUN);
  if (error) return { statusCode: 500, body: 'Query error: ' + error.message };
  if (!files.length) return { statusCode: 200, body: 'Nothing to archive' };

  const { data: reports } = await sb
    .from('reports').select('id, ref_no, photo_path, pdf_path')
    .in('id', [...new Set(files.map((f) => f.report_id))]);
  const byId = Object.fromEntries((reports || []).map((r) => [r.id, r]));

  let token;
  try { token = await getAccessToken(); } catch (e) { return { statusCode: 500, body: e.message }; }

  let ok = 0, failed = 0;
  for (const f of files) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    try {
      const report = byId[f.report_id];
      if (!report) throw new Error('report not found');

      const { data: blob, error: dlErr } = await sb.storage.from(BUCKET).download(f.file_path);
      if (dlErr) throw dlErr;
      const buffer = Buffer.from(await blob.arrayBuffer());

      const ext = f.file_path.split('.').pop().toLowerCase();
      const kind = f.kind || (report.photo_path === f.file_path ? 'photo' : 'pdf');
      const LABEL = { photo: 'gambar', pdf: 'surat', fb_photo: 'maklumbalas-gambar', fb_pdf: 'maklumbalas-borang' };
      const name = `${report.ref_no}_${LABEL[kind] || 'fail'}.${ext}`;

      const drive = await uploadToDrive(token, name, MIME[ext] || 'application/octet-stream', buffer);

      await sb.from('file_metadata').update({
        drive_file_id: drive.id, drive_link: drive.webViewLink, archived_at: new Date().toISOString(),
      }).eq('id', f.id);
      const link = drive.webViewLink;
      if (kind === 'photo')         await sb.from('reports').update({ drive_photo_link: link }).eq('id', report.id);
      else if (kind === 'pdf')      await sb.from('reports').update({ drive_pdf_link: link }).eq('id', report.id);
      else if (kind === 'fb_photo') await sb.from('report_feedback').update({ drive_photo_link: link }).eq('report_id', report.id);
      else if (kind === 'fb_pdf')   await sb.from('report_feedback').update({ drive_pdf_link: link }).eq('report_id', report.id);
      ok++;
    } catch (e) {
      failed++;
      console.error('Archive failed for', f.file_path, e.message); // retried next run
    }
  }
  return { statusCode: 200, body: `Archived ${ok}, failed ${failed}` };
}

exports.handler = async () => {
  const result = await run();
  console.log(`[archive-to-drive] ${result.statusCode}: ${result.body}`);
  return result;
};