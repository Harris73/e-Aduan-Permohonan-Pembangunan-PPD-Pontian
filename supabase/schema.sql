-- ============================================================
-- e-Aduan PPD Pontian  -  run once in Supabase > SQL Editor
-- ============================================================

-- 1. TABLES ---------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,                       -- e.g. jba6001, ppd102
  full_name   text not null,
  role        text not null check (role in ('headmaster','ppd_officer')),
  school_code text,
  school_name text
);

create table if not exists public.reports (
  id           bigint generated always as identity primary key,
  ref_no       text unique,                               -- set by trigger
  school_id    uuid not null references public.profiles(id),
  school_name  text not null,
  category     text not null check (category in
                 ('Bangunan','Elektrik','Paip/Sanitasi','Infrastruktur/Padang','Lain-lain')),
  priority     text not null default 'Sederhana'
                 check (priority in ('Rendah','Sederhana','Tinggi','Kecemasan')),
  title        text not null check (char_length(title) between 3 and 150),
  description  text not null check (char_length(description) between 3 and 3000),
  photo_path   text,                                      -- path inside bucket 'evidence'
  pdf_path     text,
  status       text not null default 'Menunggu' check (status in ('Menunggu','Selesai')),
  submitted_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists reports_queue_idx  on public.reports (submitted_at) where status <> 'Selesai';
create index if not exists reports_school_idx on public.reports (school_id, submitted_at desc);

create table if not exists public.file_metadata (
  id          bigint generated always as identity primary key,
  report_id   bigint references public.reports(id) on delete cascade,
  bucket_name text not null default 'evidence',
  file_path   text not null unique,
  created_at  timestamptz not null default now()
);
create index if not exists file_metadata_created_idx on public.file_metadata (created_at);

-- 2. HELPERS --------------------------------------------------
create or replace function public.is_ppd() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'ppd_officer');
$$;

create or replace function public.file_is_attached(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.file_metadata where file_path = p_path);
$$;

-- 3. TRIGGERS (server decides identity, ref no, status) -------
create or replace function public.reports_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null or p.role <> 'headmaster' then
    raise exception 'Hanya Guru Besar boleh menghantar aduan';
  end if;

  if new.photo_path is not null and split_part(new.photo_path,'/',1) <> auth.uid()::text then
    raise exception 'Laluan fail gambar tidak sah';
  end if;
  if new.pdf_path is not null and split_part(new.pdf_path,'/',1) <> auth.uid()::text then
    raise exception 'Laluan fail PDF tidak sah';
  end if;

  new.school_id    := p.id;
  new.school_name  := coalesce(p.school_name, p.full_name);
  new.status       := 'Menunggu';
  new.completed_at := null;
  new.submitted_at := now();
  new.ref_no := 'ADU-' || to_char(now() at time zone 'Asia/Kuala_Lumpur','YYYYMMDD')
                || '-' || lpad(new.id::text, 4, '0');
  return new;
end $$;

drop trigger if exists trg_reports_before_insert on public.reports;
create trigger trg_reports_before_insert before insert on public.reports
  for each row execute function public.reports_before_insert();

create or replace function public.reports_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.photo_path is not null then
    insert into public.file_metadata (report_id, file_path) values (new.id, new.photo_path);
  end if;
  if new.pdf_path is not null then
    insert into public.file_metadata (report_id, file_path) values (new.id, new.pdf_path);
  end if;
  return new;
end $$;

drop trigger if exists trg_reports_after_insert on public.reports;
create trigger trg_reports_after_insert after insert on public.reports
  for each row execute function public.reports_after_insert();

create or replace function public.reports_before_update() returns trigger
language plpgsql as $$
begin
  if new.status = 'Selesai' and old.status <> 'Selesai' then
    new.completed_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_reports_before_update on public.reports;
create trigger trg_reports_before_update before update on public.reports
  for each row execute function public.reports_before_update();

-- 4. ROW LEVEL SECURITY --------------------------------------
alter table public.profiles      enable row level security;
alter table public.reports       enable row level security;
alter table public.file_metadata enable row level security;

revoke all on public.profiles, public.reports, public.file_metadata from anon;

-- profiles: read own row only
drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own" on public.profiles for select to authenticated
  using (id = auth.uid());

-- reports
drop policy if exists "reports read own or ppd" on public.reports;
create policy "reports read own or ppd" on public.reports for select to authenticated
  using (school_id = auth.uid() or public.is_ppd());

drop policy if exists "reports insert own" on public.reports;
create policy "reports insert own" on public.reports for insert to authenticated
  with check (school_id = auth.uid());

drop policy if exists "reports ppd update" on public.reports;
create policy "reports ppd update" on public.reports for update to authenticated
  using (public.is_ppd()) with check (public.is_ppd());

-- PPD may only change status / completed_at
revoke update on public.reports from authenticated;
grant  update (status, completed_at) on public.reports to authenticated;

-- file_metadata: PPD read only (written by trigger, cleaned by service role)
drop policy if exists "file_metadata ppd read" on public.file_metadata;
create policy "file_metadata ppd read" on public.file_metadata for select to authenticated
  using (public.is_ppd());

-- 5. STORAGE (private bucket, 5 MB, images + pdf only) --------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence','evidence', false, 5242880,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'];

drop policy if exists "evidence upload own folder" on storage.objects;
create policy "evidence upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "evidence read own or ppd" on storage.objects;
create policy "evidence read own or ppd" on storage.objects for select to authenticated
  using (bucket_id = 'evidence'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_ppd()));

-- allow rollback of an upload ONLY while it is not yet attached to a report
drop policy if exists "evidence delete unattached own" on storage.objects;
create policy "evidence delete unattached own" on storage.objects for delete to authenticated
  using (bucket_id = 'evidence'
         and (storage.foldername(name))[1] = auth.uid()::text
         and not public.file_is_attached(name));

-- 6. CREATE USERS ---------------------------------------------
-- a) Supabase Dashboard > Authentication > Users > Add user
--      email: jba6001@aduan.ppdpontian.my   (must match EMAIL_DOMAIN in app.js)
--      password: <strong password>, tick "Auto Confirm User"
-- b) Then link a profile:
--
-- insert into public.profiles (id, username, full_name, role, school_code, school_name)
-- select id, 'jba6001', 'Guru Besar SK Pontian Utama', 'headmaster', 'JBA6001', 'SK Pontian Utama (JBA6001)'
-- from auth.users where email = 'jba6001@aduan.ppdpontian.my';
--
-- insert into public.profiles (id, username, full_name, role)
-- select id, 'ppd102', 'Pegawai Pembangunan PPD Pontian', 'ppd_officer'
-- from auth.users where email = 'ppd102@aduan.ppdpontian.my';
