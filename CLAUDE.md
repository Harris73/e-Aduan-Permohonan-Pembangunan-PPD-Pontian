# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

i-Pantas (formerly e-Aduan) for PPD Pontian: a school maintenance complaint system. Headmasters (`headmaster`) submit reports with an optional photo and PDF letter. PPD officers (`ppd_officer`) work through a FIFO queue, **must submit an investigation feedback (maklum balas siasatan) for a report before they can mark it `Selesai`**, and can browse the history of all reports. All UI text, error messages and DB enum values are in Malay — keep it that way.

## Stack and commands

- **Frontend:** plain static files in `public/` (`index.html`, `app.js`, `style.css`). No build step, no bundler, no framework. supabase-js is loaded from the jsDelivr CDN as `window.supabase`. HTML uses inline handlers (`onsubmit="submitReport(event)"`, `onclick="showPpdTab('queue')"`), so functions in `public/app.js` must stay global.
- **Backend:** Supabase (Auth, Postgres with RLS, Storage) plus two scheduled Netlify Functions (CommonJS, Node built-in `fetch`). `@supabase/supabase-js` in `package.json` is only used by the functions.
- **Deploy:** Netlify publishes `public/` (`netlify.toml`). There are no tests, lint or build scripts.
- **Local dev (frontend only):** serve `public/` over HTTP, e.g. `npx serve public` or VS Code Live Server on `public/index.html`. For functions: `npm install`, copy `env.example` to `.env`, then `netlify dev`; trigger a scheduled function with `netlify functions:invoke archive-to-drive` (or `cleanup-old-files`).
- **Database:** paste `supabase/schema.sql` into the Supabase SQL Editor, then `supabase/migration-drive.sql`. Both are idempotent (`if not exists` / `drop ... if exists`). Schema changes go in a new migration file, not as edits to an already-applied script. **See "Config gotchas": the SQL for the feedback feature is not in the repo yet.**

## Architecture

**Security lives in Postgres, not in the client.** `public/app.js` uses only the anon/publishable key and trusts RLS and triggers:
- `reports_before_insert` overwrites `school_id`, `school_name`, `status`, `submitted_at` and generates `ref_no` (`ADU-YYYYMMDD-NNNN`, MY time). It also rejects non-headmasters and file paths outside the caller's own folder. The client only sends category/priority/emergency_level/title/description/paths.
- `reports_after_insert` creates the `file_metadata` rows. `reports_before_update` sets `completed_at`.
- PPD officers have column-level `UPDATE` only on `status, completed_at`. Officers are recognised by `is_ppd()` (security definer).
- Check constraints in `schema.sql` define the allowed `category`/`priority`/`status` values. They must stay in sync with the `<select>` options in `public/index.html`.

**Auth:** the login form has a role select (`#role`: `headmaster` / `ppd_officer`) plus a username (e.g. `jba6001`). The client signs in as `username@EMAIL_DOMAIN` (`aduan.ppdpontian.my`), then loads the `profiles` row. If the chosen role does not match `profiles.role`, or there is no profile, the user is signed out. Users and profiles are created by hand (see step 6 in `schema.sql`).

**Report workflow:**
1. Headmaster submits a report. Choosing priority `Kecemasan` reveals `#emergency_level` (`Kritikal` / `Tidak Kritikal`, required only then; `null` otherwise). `Kritikal` reports get a red card (`fifo-critical`, `badge-critical`) in the PPD queue.
2. PPD queue (`fetchFifoQueue`) loads `reports` with `status <> 'Selesai'` plus the embedded `report_feedback(*)` row (1-to-1, read through `one()`).
3. **Investigation feedback gate:** a card without feedback shows a per-card form (`.fb-form`: findings, action taken, optional photo/PDF) and a **disabled** "Tanda Selesai". `submitFeedback` uploads the files and inserts into `report_feedback` (`report_id`, `findings`, `action_taken`, `photo_path`, `pdf_path`; `officer_name`/`created_at` are not sent by the client, so the live DB must fill them). Once feedback exists the card shows the feedback block and "Tanda Selesai" is enabled. **The DB does NOT enforce this** (tested 2026-10-20: a PPD officer's `update({ status: 'Selesai' })` on a report without feedback succeeded from the browser console), despite the comment in `markCompleted` saying it does. Until a DB trigger is added (see `PANDUAN-UI-REDESIGN.md`), the disabled button is the only guard.
4. `markCompleted` sets `status = 'Selesai'`; the trigger fills `completed_at`.

**PPD tabs and history:** `showPpdTab('queue' | 'history')` switches `#ppd-queue-panel` / `#ppd-history-panel`. `loadHistory(scope)` serves both the headmaster (`scope = 'school'`, RLS limits rows to own school) and PPD (`scope = 'ppd'`, all schools). It reads `#${scope}-search` (debounced via `debouncedHistory`) and `#${scope}-status`, renders `<details class="history-item">` rows, and only fetches signed URLs and builds the detail body (description, files, completed date, feedback) when a row is opened.

**File lifecycle (private `evidence` bucket, 5 MB, jpeg/png/webp/pdf):**
1. The client compresses photos to JPEG (max 1600px), uploads to `<auth.uid()>/<uuid>.<ext>` (`uploadOptionalFiles`, shared by reports and feedback), then inserts the row. If the insert fails, it deletes the uploads; storage policy allows deleting only files not yet attached via `file_metadata`.
2. `archive-to-drive` (every 10 min, at most 8 files and a 22 s budget per run) copies files with no `archived_at` to Google Drive via OAuth refresh token. `file_metadata.kind` (`photo`, `pdf`, `fb_photo`, `fb_pdf`) decides the Drive file name and whether the link goes to `reports.drive_*_link` or `report_feedback.drive_*_link`. Files that fail are retried on the next run.
3. `cleanup-old-files` (daily) removes archived files older than 6 months **through the Storage API**. Deleting `storage.objects` rows with SQL leaves the real file behind. It then nulls `photo_path`/`pdf_path` on `reports` and `report_feedback` and deletes the metadata rows.
4. The UI shows a 1-hour signed URL while the file is still in Supabase, and the Drive link after that (`reportLinks`, `feedbackBlock`).

Functions use `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS) and must stay server-side. The required env var names are listed in `env.example` and at the top of each function.

## Config gotchas

- **The SQL for `report_feedback`, `reports.emergency_level`, `file_metadata.kind` and the "no `Selesai` without feedback" rule is not in `supabase/`.** It exists only in the live Supabase project. A database built from `schema.sql` + `migration-drive.sql` will break the current frontend and functions. Add it as a new migration file before relying on the repo to recreate the DB.
- `public/app.js` points at Supabase project `hlxspdqxkvjwlbnifzkg` with a publishable key (safe to be public). Testing against it writes real data.
- `.env` is no longer tracked, but an old `.env` with a Google service-account private key is still in git history; that key should be rotated.

## UI work rules

- Only edit `public/index.html` and `public/style.css`. In `public/app.js`, only touch code that builds
  HTML/DOM for display; do not change Supabase calls, auth, upload or validation logic.
- Keep all functions referenced by inline handlers global and with the same names: `handleLogin`, `logout`, `submitReport`, `previewLocalImage`, `previewLocalPdf`, `removeFile`, `onPriorityChange`, `showPpdTab`, `loadHistory`, `debouncedHistory`, `fetchFifoQueue`.
- PPD queue auto-refreshes every 60 s. Two fetches must never overlap (`fetchFifoQueue` coalesces calls), and the auto refresh must skip while `queueIsBusy()` (open/typed feedback form, chosen file, upload or `markCompleted`/confirm in progress, animating card, expanded description). Re-renders keep unsent drafts via `captureQueueState`/`restoreQueueState`. Don't rely on `requestAnimationFrame` for anything functional (e.g. unlocking Tanda Selesai) — it doesn't run in background tabs.
- `previewLocalPdf` rejects a non-PDF or >5 MB file as soon as it is picked (clears the input, shows a toast). This is an early warning only; `uploadOptionalFiles` still validates on submit — keep both.
- Keep the element IDs and the classes `public/app.js` queries (`.btn-done`, `.fb-form`, `.fb-findings`, `.fb-action`, `.fb-photo`, `.fb-pdf`, `.fb-submit`, `.hist-body`, `.btn-close`).
- Never change `value` attributes of `<select>` options (they must match DB check
  constraints and `profiles.role`). Labels may change.
- Keep all user-facing text in Malay.
- No frameworks, no build step, no new npm deps. Plain CSS; CDN fonts are fine.
- Must stay responsive (headmasters likely use phones).
- `preview.html` (repo root, git-excluded locally) is the design sandbox: it links `public/style.css` and uses dummy data only.
