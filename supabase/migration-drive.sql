-- Run after schema.sql: columns for the Supabase -> Google Drive hybrid
alter table public.reports
  add column if not exists drive_photo_link text,
  add column if not exists drive_pdf_link   text;

alter table public.file_metadata
  add column if not exists drive_file_id text,
  add column if not exists drive_link    text,
  add column if not exists archived_at   timestamptz;

create index if not exists file_metadata_unarchived_idx
  on public.file_metadata (created_at) where archived_at is null;
