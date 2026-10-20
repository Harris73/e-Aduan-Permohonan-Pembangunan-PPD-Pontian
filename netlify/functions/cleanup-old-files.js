// Runs daily (see netlify.toml). Deletes evidence files older than 6 months that are
// already archived on Google Drive (reports keep their drive_*_link)
// through the Storage API (deleting rows from storage.objects with SQL does NOT
// remove the real file), then clears the paths on the report and the metadata rows.
//
// Env vars (Netlify > Site settings > Environment variables):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   <- service_role key, server-side ONLY
const { createClient } = require('@supabase/supabase-js');

const BUCKET = 'evidence';
const BATCH = 200;

exports.handler = async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return { statusCode: 500, body: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set' };
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 6);

  const { data: old, error } = await sb
    .from('file_metadata')
    .select('id, file_path')
    .eq('bucket_name', BUCKET)
    .not('archived_at', 'is', null) // only files already copied to Google Drive
    .lt('created_at', cutoff.toISOString())
    .limit(BATCH);

  if (error) return { statusCode: 500, body: 'Query error: ' + error.message };
  if (!old.length) return { statusCode: 200, body: 'Nothing to delete' };

  const paths = old.map((f) => f.file_path);
  const ids = old.map((f) => f.id);

  const { error: rmErr } = await sb.storage.from(BUCKET).remove(paths);
  if (rmErr) return { statusCode: 500, body: 'Storage remove error: ' + rmErr.message };

  await sb.from('reports').update({ photo_path: null }).in('photo_path', paths);
  await sb.from('reports').update({ pdf_path: null }).in('pdf_path', paths);
  await sb.from('report_feedback').update({ photo_path: null }).in('photo_path', paths);
  await sb.from('report_feedback').update({ pdf_path: null }).in('pdf_path', paths);

  const { error: delErr } = await sb.from('file_metadata').delete().in('id', ids);
  if (delErr) return { statusCode: 500, body: 'Metadata delete error: ' + delErr.message };

  console.log(`Deleted ${paths.length} files older than ${cutoff.toISOString()}`);
  return { statusCode: 200, body: `Deleted ${paths.length} files` };
};