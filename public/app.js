// ==========================================
// i-Pantas  -  Sistem Aduan Penyelenggaraan PPD Pontian
// Netlify (static) + Supabase (Auth, Postgres, Storage) + Google Drive archive
// ==========================================

const SUPABASE_URL = 'https://hlxspdqxkvjwlbnifzkg.supabase.co';
// Public anon / publishable key only (never the secret or service_role key).
const SUPABASE_ANON_KEY = 'sb_publishable_bA7zrZeCVG4v-6v-o2pjDA_-qwzt1eo';

const EMAIL_DOMAIN = 'aduan.ppdpontian.my'; // username -> username@EMAIL_DOMAIN
const BUCKET = 'evidence';
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const ROLE_LABEL = { headmaster: 'Pengetua / Guru Besar', ppd_officer: 'Pegawai PPD' };
const STARTUP_TIMEOUT_MS = 8000; // never leave the user stuck on the loading screen

// null when the supabase-js CDN script failed to load
const sb = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
let profile = null;

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Sambungan ke pelayan tamat masa.')), ms))]);
}

// ---------- UI helpers (display only) ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// Toast slides in, shows a ~4 s progress bar (pauses on hover) and can be closed
function showToast(message, type = 'info') {
    const region = $('toast');
    const glyph = { info: 'mark-info', ok: 'check', error: 'mark-alert' }[type] || 'mark-info';
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast-icon">${icon(glyph)}</span><div class="toast-msg"></div>
        <button type="button" class="btn-close" aria-label="Tutup">${icon('x')}</button>
        <span class="toast-progress"></span>`;
    el.querySelector('.toast-msg').textContent = message;

    const close = () => {
        if (el.classList.contains('is-leaving')) return;
        el.classList.add('is-leaving');
        setTimeout(() => el.remove(), reducedMotion() ? 0 : 200);
    };
    el.querySelector('.btn-close').addEventListener('click', close);
    el.querySelector('.toast-progress').addEventListener('animationend', close);
    region.appendChild(el);
    while (region.children.length > 3) region.firstElementChild.remove();
}

// Ripple on every .btn
document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn || btn.disabled || reducedMotion()) return;
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2;
    const dot = document.createElement('span');
    dot.className = 'ripple';
    dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    btn.appendChild(dot);
    dot.addEventListener('animationend', () => dot.remove());
});

// state: 'idle' | 'loading' (spinner) | 'success' (animated check). Button needs .btn-label/.btn-spinner/.btn-check.
function setButtonState(btn, state, loadingText) {
    const label = btn.querySelector('.btn-label');
    if (label && btn.dataset.label === undefined) btn.dataset.label = label.textContent;
    btn.classList.remove('is-loading', 'is-success');
    btn.disabled = state !== 'idle';
    btn.setAttribute('aria-busy', String(state === 'loading'));
    if (label) label.textContent = state === 'loading' && loadingText ? loadingText : btn.dataset.label;
    if (state !== 'idle') btn.classList.add('is-' + state);
}

function showLoginError(message) {
    const err = $('login-error');
    err.textContent = message;
    err.classList.remove('hidden', 'shake');
    void err.offsetWidth; // restart the shake animation
    err.classList.add('shake');
}

// Animated expand/collapse for a .reveal block; .hidden is added after closing so it leaves the tab order
function setReveal(el, open) {
    clearTimeout(el._revealTimer);
    if (open) {
        el.classList.remove('hidden');
        void el.offsetHeight; // commit the collapsed state so the transition runs
        el.classList.add('is-open');
    } else {
        el.classList.remove('is-open');
        el._revealTimer = setTimeout(() => el.classList.add('hidden'), reducedMotion() ? 0 : 300);
    }
}

// ---------- file pickers: drag & drop zone + preview card ----------
function formatSize(bytes) {
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// Early warning while picking a file; uploadOptionalFiles still validates again on submit
function pdfProblem(file) {
    if (file.type !== 'application/pdf') return 'Dokumen sokongan mesti dalam format PDF.';
    if (file.size > MAX_PDF_BYTES) return 'Saiz PDF melebihi 5 MB.';
    return null;
}

function renderFilePreview(box, file) {
    const img = box.querySelector('img');
    if (img) {
        if (box._url) URL.revokeObjectURL(box._url);
        box._url = URL.createObjectURL(file);
        img.src = box._url;
    }
    box.querySelector('.file-name').textContent = file.name;
    box.querySelector('.file-size').textContent = formatSize(file.size) + (img ? ' · akan dimampatkan sebelum dimuat naik' : '');
    box.classList.remove('hidden', 'is-leaving');
}

function clearFilePreview(box, input) {
    input.value = '';
    if (box.classList.contains('hidden')) return;
    box.classList.add('is-leaving');
    setTimeout(() => {
        box.classList.add('hidden');
        box.classList.remove('is-leaving');
        const img = box.querySelector('img');
        if (img && box._url) { URL.revokeObjectURL(box._url); box._url = null; img.removeAttribute('src'); }
    }, reducedMotion() ? 0 : 200);
}

// The real <input type=file> covers the zone; a drop is copied into it and fires its normal change handler
function setupDropzone(zone) {
    const input = zone.querySelector('input[type="file"]');
    const accepted = input.accept.split(',').map((s) => s.trim());
    let depth = 0;
    zone.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; zone.classList.add('is-dragover'); });
    zone.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    zone.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; zone.classList.remove('is-dragover'); } });
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        depth = 0;
        zone.classList.remove('is-dragover');
        const file = e.dataTransfer.files[0];
        if (!file) return;
        if (!accepted.includes(file.type)) return showToast('Jenis fail tidak disokong untuk medan ini.', 'error');
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
}
// a file dropped outside a drop zone must not navigate away from the page
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

// "n / max" counter that turns amber at 80% and red at 95% of maxlength
function setupCounter(field, out) {
    const max = field.maxLength;
    const update = () => {
        const n = field.value.length;
        out.textContent = `${n} / ${max}`;
        out.classList.toggle('is-near', n / max >= .8 && n / max < .95);
        out.classList.toggle('is-limit', n / max >= .95);
    };
    field.addEventListener('input', update);
    update();
    return update;
}

function setupReportFormUi() {
    document.querySelectorAll('#report-form .dropzone').forEach(setupDropzone);
    const updateTitle = setupCounter($('title'), $('title-count'));
    const updateDesc = setupCounter($('description'), $('description-count'));
    // form.reset() fires before the values change, so refresh on the next tick
    $('report-form').addEventListener('reset', () => setTimeout(() => {
        updateTitle();
        updateDesc();
        removeFile('photo');
        removeFile('pdf');
    }, 0));
}
const one = (x) => (Array.isArray(x) ? x[0] : x) || null; // embedded 1-to-1 relation

const DAY_MS = 86400000;
const PRIO_CLASS = { Rendah: 'prio-rendah', Sederhana: 'prio-sederhana', Tinggi: 'prio-tinggi', Kecemasan: 'prio-kecemasan' };

function fullDate(d) {
    return new Date(d).toLocaleString('ms-MY', { dateStyle: 'full', timeStyle: 'short' });
}
// "Baru sahaja", "5 minit lalu", "3 jam lalu", "Semalam", "4 hari lalu", else a short date
function relTime(d) {
    const date = new Date(d);
    const now = new Date();
    const sec = Math.round((now - date) / 1000);
    if (sec < 45) return 'Baru sahaja';
    const min = Math.round(sec / 60);
    if (min < 60) return `${min} minit lalu`;
    const dayStart = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
    const days = Math.round((dayStart(now) - dayStart(date)) / DAY_MS);
    if (days === 0) return `${Math.round(min / 60)} jam lalu`;
    if (days === 1) return 'Semalam';
    if (days < 7) return `${days} hari lalu`;
    return date.toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}
// relative date with the full date in a tooltip
function timeTag(d, withIcon = false) {
    const date = new Date(d);
    return `<time datetime="${esc(date.toISOString())}" title="${esc(fullDate(date))}">` +
           `${withIcon ? icon('calendar') : ''}${esc(relTime(date))}</time>`;
}

function priorityBadge(r) {
    if (r.priority === 'Kecemasan') {
        if (r.emergency_level === 'Kritikal') return `<span class="badge badge-critical">${icon('alert-triangle')}Kecemasan · Kritikal</span>`;
        return `<span class="badge badge-dot prio-kecemasan">Kecemasan${r.emergency_level ? ' · ' + esc(r.emergency_level) : ''}</span>`;
    }
    return `<span class="badge badge-dot ${PRIO_CLASS[r.priority] || ''}">${esc(r.priority)}</span>`;
}

// items: [{ kind: 'img' | 'pdf', label, url }] → file chips (items without a url are skipped)
function linkButtons(items) {
    const ok = items.filter((i) => i.url);
    return ok.length
        ? ok.map((i) => fileChip(i.kind, i.label, i.url)).join('')
        : '<small class="muted">Tiada lampiran</small>';
}

document.addEventListener('DOMContentLoaded', async () => {
    setupReportFormUi();

    if (!sb) {
        $('app-loading').classList.add('hidden');
        $('app-fatal').classList.remove('hidden');
        return;
    }

    let session = null;
    try {
        const { data } = await withTimeout(sb.auth.getSession(), STARTUP_TIMEOUT_MS);
        session = data.session;
    } catch (err) {
        console.error('getSession:', err);
    }
    await applySession(session);

    sb.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') showLogin();
    });
});

// ==========================================
// 1. Authentication (role is chosen at login and must match the account)
// ==========================================

async function handleLogin(e) {
    e.preventDefault();
    const role = $('role').value;
    const username = $('username').value.trim().toLowerCase();
    const password = $('password').value;
    const btn = $('login-btn');

    setButtonState(btn, 'loading');
    $('login-error').classList.add('hidden');

    const { data, error } = await sb.auth.signInWithPassword({
        email: `${username}@${EMAIL_DOMAIN}`,
        password,
    });

    if (error) {
        setButtonState(btn, 'idle');
        showLoginError('ID atau kata laluan tidak sah.');
        $('password').select();
        return;
    }
    setButtonState(btn, 'success');
    await sleep(reducedMotion() ? 0 : 450); // let the check mark draw before the screen changes
    $('password').value = '';
    await applySession(data.session, role);
    setButtonState(btn, 'idle');
}

function showLogin() {
    profile = null;
    $('app-loading').classList.add('hidden');
    $('submit-success').classList.add('hidden');
    $('login-modal').classList.remove('hidden');
    $('user-session').classList.add('hidden');
    $('headmaster-view').classList.add('hidden');
    $('ppd-view').classList.add('hidden');
    stopQueueTimers();
    setTimeout(() => $('username').focus({ preventScroll: true }), 60);
}

async function applySession(session, expectedRole = null) {
    if (!session) return showLogin();

    let data, error;
    try {
        ({ data, error } = await withTimeout(
            sb.from('profiles').select('*').eq('id', session.user.id).single(), STARTUP_TIMEOUT_MS));
    } catch (err) {
        console.error('applySession:', err);
        showToast('Gagal menyambung ke pelayan. Sila cuba log masuk semula.', 'error');
        return showLogin();
    }
    // PGRST116 = no profile row; anything else is a connection/server problem
    if (error && error.code !== 'PGRST116') {
        console.error('applySession:', error);
        showToast('Gagal mengambil maklumat akaun: ' + error.message, 'error');
        return showLogin();
    }
    if (!data) {
        showToast('Akaun anda belum didaftarkan dalam sistem. Sila hubungi pentadbir PPD.', 'error');
        await sb.auth.signOut();
        return showLogin(); // the SIGNED_OUT listener is not registered yet on first load
    }
    if (expectedRole && data.role !== expectedRole) {
        showLoginError('Peranan yang dipilih tidak sepadan dengan akaun ini.');
        await sb.auth.signOut();
        return showLogin();
    }
    profile = data;

    $('app-loading').classList.add('hidden');
    $('login-modal').classList.add('hidden');
    $('user-session').classList.remove('hidden');
    $('nav-user-name').textContent = profile.full_name;
    $('nav-user-role').textContent = ROLE_LABEL[profile.role] || profile.role;
    $('nav-user-avatar').textContent = String(profile.full_name || '')
        .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

    if (profile.role === 'headmaster') {
        $('hm-school-name').textContent = profile.school_name || profile.full_name || '';
        $('headmaster-view').classList.remove('hidden');
        $('ppd-view').classList.add('hidden');
        setTimeout(() => $('category').focus({ preventScroll: true }), 60);
        loadHistory('school');
    } else {
        $('ppd-view').classList.remove('hidden');
        $('headmaster-view').classList.add('hidden');
        showPpdTab('queue');
    }
}

async function logout() {
    await sb.auth.signOut();
}

// ==========================================
// 2. Form helpers: previews, compression, upload
// ==========================================

function onPriorityChange() {
    const isEmergency = $('priority').value === 'Kecemasan';
    setReveal($('emergency-level-group'), isEmergency);
    $('emergency_level').required = isEmergency;
    if (!isEmergency) $('emergency_level').value = '';
}

function previewLocalImage(event) {
    const file = event.target.files[0];
    if (!file) return clearFilePreview($('image-preview-container'), event.target);
    renderFilePreview($('image-preview-container'), file);
}

function previewLocalPdf(event) {
    const file = event.target.files[0];
    if (!file) return clearFilePreview($('pdf-preview-info'), event.target);
    const problem = pdfProblem(file);
    if (problem) {
        event.target.value = '';
        return showToast(problem, 'error');
    }
    renderFilePreview($('pdf-preview-info'), file);
}

// "Buang" button on a preview card
function removeFile(kind) {
    if (kind === 'photo') clearFilePreview($('image-preview-container'), $('photo_file'));
    else clearFilePreview($('pdf-preview-info'), $('pdf_file'));
}

// Shrink phone photos (4-8 MB) to a few hundred KB so free storage lasts
async function compressImage(file, maxDim = 1600, quality = 0.8) {
    let bmp;
    try {
        bmp = await createImageBitmap(file);
    } catch {
        throw new Error('Format gambar tidak disokong. Sila guna JPG, PNG atau WebP.');
    }
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Gagal memampat gambar.'))), 'image/jpeg', quality));
}

async function uploadEvidence(blob, ext, contentType) {
    const path = `${profile.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType, upsert: false });
    if (error) throw error;
    return path;
}

// Validates + uploads an optional photo and PDF. Pushes uploaded paths to `uploaded` for rollback.
async function uploadOptionalFiles(photo, pdf, uploaded) {
    if (pdf && pdf.type !== 'application/pdf') throw new Error('Dokumen sokongan mesti dalam format PDF.');
    if (pdf && pdf.size > MAX_PDF_BYTES) throw new Error('Saiz PDF melebihi 5 MB.');

    let photo_path = null;
    let pdf_path = null;
    if (photo) {
        photo_path = await uploadEvidence(await compressImage(photo), 'jpg', 'image/jpeg');
        uploaded.push(photo_path);
    }
    if (pdf) {
        pdf_path = await uploadEvidence(pdf, 'pdf', 'application/pdf');
        uploaded.push(pdf_path);
    }
    return { photo_path, pdf_path };
}

// ==========================================
// 3. Headmaster: submit report
// ==========================================

async function submitReport(e) {
    e.preventDefault();
    const btn = $('submit-btn');
    const uploaded = [];
    let succeeded = false;

    try {
        const priority = $('priority').value;
        const emergency_level = priority === 'Kecemasan' ? $('emergency_level').value : null;
        if (priority === 'Kecemasan' && !emergency_level) throw new Error('Sila pilih Tahap Kecemasan (Kritikal / Tidak Kritikal).');

        setButtonState(btn, 'loading', 'Memuat naik & menghantar...');
        hideSubmitSuccess();

        const { photo_path, pdf_path } = await uploadOptionalFiles(
            $('photo_file').files[0], $('pdf_file').files[0], uploaded);

        const { data, error } = await sb.from('reports').insert({
            category: $('category').value,
            priority,
            emergency_level,
            title: $('title').value.trim(),
            description: $('description').value.trim(),
            photo_path,
            pdf_path,
        }).select('ref_no').single();
        if (error) throw error;

        succeeded = true;
        setButtonState(btn, 'success');
        showSubmitSuccess(data.ref_no);
        $('report-form').reset(); // the reset listener also clears counters and file previews
        onPriorityChange();
        loadHistory('school');
    } catch (err) {
        console.error('submitReport:', err);
        if (uploaded.length) await sb.storage.from(BUCKET).remove(uploaded);
        showToast('Ralat: ' + (err.message || err), 'error');
    } finally {
        if (succeeded) await sleep(reducedMotion() ? 0 : 900); // let the check mark show
        setButtonState(btn, 'idle');
    }
}

// Stays visible (unlike a toast) so the headmaster can note down the reference number
function showSubmitSuccess(refNo) {
    const panel = $('submit-success');
    panel.innerHTML = `
        <span class="success-icon">${icon('check')}</span>
        <div>
            <strong>Aduan berjaya dihantar ke PPD Pontian!</strong>
            <div>No Rujukan: <span class="ref-no">${esc(refNo)}</span></div>
        </div>
        <button type="button" class="btn-close" aria-label="Tutup">${icon('x')}</button>`;
    panel.querySelector('.btn-close').addEventListener('click', hideSubmitSuccess);
    clearTimeout(panel._hideTimer); // a fast submit must not be hidden by the previous fade-out
    panel.classList.remove('hidden', 'is-leaving');
    panel.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
}

function hideSubmitSuccess() {
    const panel = $('submit-success');
    if (panel.classList.contains('hidden')) return;
    panel.classList.add('is-leaving');
    panel._hideTimer = setTimeout(() => panel.classList.add('hidden'), reducedMotion() ? 0 : 200);
}

// ==========================================
// 4. Signed URLs for private files
// ==========================================

async function signedUrlMap(paths) {
    const list = [...new Set(paths.filter(Boolean))];
    if (!list.length) return {};
    const { data } = await sb.storage.from(BUCKET).createSignedUrls(list, 3600);
    const map = {};
    (data || []).forEach((d) => { if (d.signedUrl) map[d.path] = d.signedUrl; });
    return map;
}

function reportPaths(r) {
    const fb = one(r.report_feedback);
    return [r.photo_path, r.pdf_path, fb && fb.photo_path, fb && fb.pdf_path];
}

// Signed URL while the file is in Supabase, Google Drive link after the 6-month cleanup
function reportLinks(r, urls) {
    return [
        { kind: 'img', label: 'Gambar Kerosakan', url: urls[r.photo_path] || r.drive_photo_link },
        { kind: 'pdf', label: 'Surat Rasmi (PDF)', url: urls[r.pdf_path] || r.drive_pdf_link },
    ];
}

const fileChip = (kind, label, url) =>
    `<a class="file-chip" href="${esc(url)}" target="_blank" rel="noopener">` +
    `${icon(kind === 'pdf' ? 'file' : 'image', kind === 'pdf' ? 'icon-pdf' : 'icon-img')}${esc(label)}${icon('external', 'icon-ext')}</a>`;

// Feedback summary (queue card + history detail). Signed URL first, Drive link after archiving.
function feedbackBlock(fb, urls, isNew = false) {
    const photoUrl = urls[fb.photo_path] || fb.drive_photo_link;
    const pdfUrl = urls[fb.pdf_path] || fb.drive_pdf_link;
    const chips = [photoUrl ? fileChip('img', 'Gambar Siasatan', photoUrl) : '',
                   pdfUrl ? fileChip('pdf', 'Borang Maklum Balas (PDF)', pdfUrl) : ''].join('');
    return `
        <div class="fb-summary${isNew ? ' is-new' : ''}">
            <div class="fb-summary-head">
                <span class="success-icon sm">${icon('check')}</span>
                <div>
                    <strong>Maklum Balas Siasatan PPD</strong>
                    <span class="muted">${esc(fb.officer_name)} · ${timeTag(fb.created_at)}</span>
                </div>
            </div>
            <dl class="fb-fields">
                <div><dt>Dapatan</dt><dd>${esc(fb.findings)}</dd></div>
                <div><dt>Tindakan</dt><dd>${esc(fb.action_taken)}</dd></div>
            </dl>
            ${chips ? `<div class="evidence-grid">${chips}</div>` : ''}
        </div>`;
}

// ==========================================
// 5. PPD officer: tabs
// ==========================================

function moveTabIndicator() {
    const tabs = document.querySelector('#ppd-view .tabs');
    const active = tabs && tabs.querySelector('.tab.active');
    if (!active || !active.offsetWidth) return; // hidden view: nothing to measure yet
    const ind = tabs.querySelector('.tab-indicator');
    ind.style.width = active.offsetWidth + 'px';
    ind.style.transform = `translateX(${active.offsetLeft}px)`;
}
window.addEventListener('resize', moveTabIndicator);

function showPpdTab(name) {
    const queue = name === 'queue';
    $('ppd-queue-panel').classList.toggle('hidden', !queue);
    $('ppd-history-panel').classList.toggle('hidden', queue);
    $('tab-queue').classList.toggle('active', queue);
    $('tab-history').classList.toggle('active', !queue);
    $('tab-queue').setAttribute('aria-selected', String(queue));
    $('tab-history').setAttribute('aria-selected', String(!queue));
    requestAnimationFrame(() => {
        moveTabIndicator();
        document.querySelector('#ppd-view .tabs').classList.add('is-ready'); // slide only after first placement
    });
    stopQueueTimers();
    if (queue) { fetchFifoQueue(); startQueueTimers(); } else loadHistory('ppd');
}

// ==========================================
// 6. PPD officer: FIFO queue + feedback form + mark completed
// ==========================================

const REFRESH_MS = 60000;   // auto refresh interval
const BUSY_RETRY_MS = 15000; // re-check this often while the officer is busy in the queue
let queueFetch = null;       // the in-flight fetch: two fetches never overlap
let queueRefetch = null;     // options for one more fetch requested while one was running
let queueBusy = 0;           // feedback uploads / markCompleted (incl. its confirm dialog) in progress
let lastUpdated = 0;
let refreshTimer = null;
let tickTimer = null;

const LOCK_TIP = 'Hantar maklum balas siasatan dahulu';

function skeletonCards(n = 3) {
    return '<span class="sr-only">Memuatkan senarai aduan...</span>' + Array.from({ length: n }, () => `
        <div class="sk-card" aria-hidden="true">
            <div class="sk-head">
                <div class="sk-head-left"><div class="skeleton sk-circle"></div><div class="skeleton sk-pill"></div>
                    <div class="skeleton sk-line sk-w-120"></div></div>
                <div class="skeleton sk-pill"></div>
            </div>
            <div class="sk-stack sk-body">
                <div class="skeleton sk-line lg w-60"></div><div class="skeleton sk-line w-40"></div>
                <div class="skeleton sk-line w-90"></div><div class="skeleton sk-line w-70"></div>
            </div>
            <div class="sk-head sk-foot"><div class="skeleton sk-line w-40"></div><div class="skeleton sk-btn"></div></div>
        </div>`).join('');
}
const emptyQueueHtml = () => `
    <div class="empty-state is-success">
        <span class="empty-icon">${icon('check-circle')}</span>
        <strong>Tiada aduan menunggu</strong>
        <span>Tiada aduan dalam senarai menunggu (semua selesai).</span>
    </div>`;

function restartStagger(container) {
    container.classList.remove('stagger');
    void container.offsetWidth;
    container.classList.add('stagger');
}

// stage 1 = Siasatan (no feedback yet), 3 = feedback sent / ready to close
function stepperHtml(stage) {
    return `<ol class="stepper" aria-label="Aliran tindakan aduan">${['Siasatan', 'Maklum Balas', 'Selesai'].map((label, i) => {
        const n = i + 1;
        const cls = n < stage ? 'is-done' : n === stage ? 'is-current' : '';
        return `<li class="step ${cls}"${n === stage ? ' aria-current="step"' : ''}>
            <span class="step-dot"><span class="step-num">${n}</span>${icon('check')}</span>
            <span class="step-label">${label}</span></li>`;
    }).join('')}</ol>`;
}
function setStepperStage(stepper, stage) {
    stepper.querySelectorAll('.step').forEach((li, i) => {
        const n = i + 1;
        li.classList.toggle('is-done', n < stage);
        li.classList.toggle('is-current', n === stage);
        if (n === stage) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
}

// Disabled buttons get no hover events, so the tooltip lives on a focusable wrapper
function doneButtonHtml(locked) {
    const btn = `
        <button class="btn btn-success btn-sm btn-done"${locked ? ' disabled aria-disabled="true"' : ''}>
            <span class="btn-spinner" aria-hidden="true"></span>
            ${icon(locked ? 'lock' : 'check', 'btn-lead')}
            <span class="btn-label">Tanda Selesai</span>
            <svg class="icon btn-check" aria-hidden="true"><use href="#i-check"/></svg>
        </button>`;
    return locked
        ? `<span class="lock-wrap" tabindex="0" data-tooltip="${LOCK_TIP}">${btn}<span class="sr-only">${LOCK_TIP}</span></span>`
        : btn;
}
function unlockDoneButton(card) {
    const btn = card.querySelector('.btn-done');
    const wrap = btn.closest('.lock-wrap');
    if (wrap) wrap.replaceWith(btn);
    btn.disabled = false;
    btn.removeAttribute('aria-disabled');
    btn.querySelector('.btn-lead use').setAttribute('href', '#i-check');
    btn.classList.remove('is-unlocking');
    void btn.offsetWidth;
    btn.classList.add('is-unlocking');
    btn.addEventListener('animationend', () => btn.classList.remove('is-unlocking'), { once: true });
}

function fbFormHtml(r) {
    const id = esc(r.id);
    return `
        <div class="fb-section">
            <button type="button" class="fb-toggle" aria-expanded="false" aria-controls="fb-panel-${id}">
                <span class="fb-toggle-icon">${icon('clipboard')}</span>
                <span><strong>Hantar Maklum Balas Siasatan</strong>
                    <small>Wajib sebelum aduan boleh ditanda selesai</small></span>
                ${icon('chevron-down', 'chev')}
            </button>
            <div class="reveal hidden" id="fb-panel-${id}">
                <div class="reveal-inner">
                    <form class="fb-form">
                        <div class="form-group">
                            <label for="fb-findings-${id}">Dapatan siasatan <span class="req">*</span></label>
                            <textarea id="fb-findings-${id}" class="fb-findings" rows="3" maxlength="3000" required
                                placeholder="Apa yang didapati semasa siasatan / lawatan..."></textarea>
                            <div class="field-foot"><span>Keadaan sebenar di lokasi</span><span class="char-count"></span></div>
                        </div>
                        <div class="form-group">
                            <label for="fb-action-${id}">Tindakan yang diambil / dicadangkan <span class="req">*</span></label>
                            <textarea id="fb-action-${id}" class="fb-action" rows="3" maxlength="3000" required
                                placeholder="Contoh: Kerja baik pulih dijadualkan, kontraktor dilantik..."></textarea>
                            <div class="field-foot"><span>Tindakan dan jangkaan masa</span><span class="char-count"></span></div>
                        </div>
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="fb-photo-${id}">Gambar siasatan <span class="muted">(pilihan)</span></label>
                                <div class="dropzone">
                                    <input type="file" id="fb-photo-${id}" class="fb-photo" accept="image/jpeg,image/png,image/webp">
                                    <span class="dz-icon">${icon('image')}</span>
                                    <span class="dz-text">Seret gambar ke sini atau <strong>pilih fail</strong><small>JPG, PNG atau WebP</small></span>
                                </div>
                                <div class="file-preview file-preview--image hidden">
                                    <img alt="Pratonton gambar siasatan">
                                    <div class="file-info"><span class="file-name"></span><span class="file-size"></span></div>
                                    <button type="button" class="btn-close" data-remove aria-label="Buang gambar">${icon('x')}</button>
                                </div>
                            </div>
                            <div class="form-group">
                                <label for="fb-pdf-${id}">Surat maklum balas PDF <span class="muted">(pilihan, maks 5 MB)</span></label>
                                <div class="dropzone">
                                    <input type="file" id="fb-pdf-${id}" class="fb-pdf" accept="application/pdf">
                                    <span class="dz-icon">${icon('file')}</span>
                                    <span class="dz-text">Seret PDF ke sini atau <strong>pilih fail</strong><small>PDF, maksimum 5 MB</small></span>
                                </div>
                                <div class="file-preview hidden">
                                    <span class="file-thumb">${icon('file')}</span>
                                    <div class="file-info"><span class="file-name"></span><span class="file-size"></span></div>
                                    <button type="button" class="btn-close" data-remove aria-label="Buang PDF">${icon('x')}</button>
                                </div>
                            </div>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn btn-ghost fb-cancel">Batal</button>
                            <button type="submit" class="btn btn-primary fb-submit">
                                <span class="btn-spinner" aria-hidden="true"></span>
                                ${icon('send')}
                                <span class="btn-label">Hantar Maklum Balas</span>
                                <svg class="icon btn-check" aria-hidden="true"><use href="#i-check"/></svg>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>`;
}

// animateUnlock: the card whose feedback was just sent renders "before" and then animates to "after"
function fifoCardHtml(r, idx, urls, animateUnlock) {
    const fb = one(r.report_feedback);
    const days = Math.floor((Date.now() - new Date(r.submitted_at)) / 86400000);
    const dayClass = days === 0 ? 'is-today' : days >= 14 ? 'is-overdue' : '';
    const dayText = days === 0 ? 'Hari ini' : `${days} hari menunggu`;
    const photoUrl = urls[r.photo_path] || r.drive_photo_link;
    const pdfUrl = urls[r.pdf_path] || r.drive_pdf_link;
    const evidence = [
        urls[r.photo_path] ? `<a class="evidence-thumb-link" href="${esc(photoUrl)}" target="_blank" rel="noopener" title="Buka gambar">
            <img src="${esc(photoUrl)}" class="evidence-thumb" alt="Foto bukti"></a>`
            : (photoUrl ? fileChip('img', 'Gambar (Google Drive)', photoUrl) : ''),
        pdfUrl ? fileChip('pdf', 'Surat Rasmi (PDF)', pdfUrl) : '',
    ].join('');

    return `
        <article class="fifo-card${r.emergency_level === 'Kritikal' ? ' fifo-critical' : ''}" data-id="${esc(r.id)}"
                 data-priority="${esc(r.priority)}" data-days="${days}" style="--i:${Math.min(idx, 10)}">
            <div class="fifo-header">
                <div>
                    <span class="queue-no">${idx + 1}</span>
                    ${priorityBadge(r)}
                    <span class="ref">${esc(r.ref_no)}</span>
                </div>
                <span class="day-counter ${dayClass}">${icon('clock')}${dayText}</span>
            </div>
            <h4>${esc(r.title)}</h4>
            <div class="fifo-school">${icon('building')}${esc(r.school_name)}</div>
            ${stepperHtml(fb && !animateUnlock ? 3 : 1)}
            <p class="desc">${esc(r.description)}</p>
            ${evidence ? `<div class="evidence-grid">${evidence}</div>` : ''}
            ${fb ? feedbackBlock(fb, urls, animateUnlock) : fbFormHtml(r)}
            <div class="fifo-footer">
                <div class="meta">
                    <span>${icon('tag')}${esc(r.category)}</span>
                    ${timeTag(r.submitted_at, true)}
                </div>
                ${doneButtonHtml(!fb || animateUnlock)}
            </div>
        </article>`;
}

function setupClamp(card) {
    const desc = card.querySelector('.desc');
    desc.classList.add('is-clamped');
    if (desc.scrollHeight <= desc.clientHeight + 2) return desc.classList.remove('is-clamped');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'link-btn';
    toggle.textContent = 'Baca lagi';
    toggle.addEventListener('click', () => {
        const clamped = desc.classList.toggle('is-clamped');
        desc.classList.toggle('is-expanded', !clamped);
        toggle.textContent = clamped ? 'Baca lagi' : 'Tutup';
    });
    desc.after(toggle);
}

function wireCard(card, reportId) {
    const doneBtn = card.querySelector('.btn-done');
    doneBtn.addEventListener('click', () => markCompleted(reportId));
    setupClamp(card);

    const form = card.querySelector('.fb-form');
    if (!form) return;
    const toggle = card.querySelector('.fb-toggle');
    const panel = card.querySelector('.fb-section .reveal');
    const setOpen = (open) => {
        toggle.setAttribute('aria-expanded', String(open));
        setReveal(panel, open);
        if (open) setTimeout(() => form.querySelector('.fb-findings').focus({ preventScroll: true }), reducedMotion() ? 0 : 300);
    };
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    form.querySelector('.fb-cancel').addEventListener('click', () => setOpen(false));
    form.addEventListener('submit', (ev) => submitFeedback(ev, reportId, form));
    form.querySelectorAll('textarea').forEach((t) => setupCounter(t, t.parentElement.querySelector('.char-count')));
    form.querySelectorAll('.dropzone').forEach((zone) => {
        setupDropzone(zone);
        const input = zone.querySelector('input');
        const box = zone.parentElement.querySelector('.file-preview');
        input.addEventListener('change', () => {
            const file = input.files[0];
            if (!file) return clearFilePreview(box, input);
            const problem = input.classList.contains('fb-pdf') ? pdfProblem(file) : null;
            if (problem) { input.value = ''; return showToast(problem, 'error'); }
            renderFilePreview(box, file);
        });
        box.querySelector('[data-remove]').addEventListener('click', () => clearFilePreview(box, input));
    });
}

// Unsent work on each card (typed text, chosen files, open form, expanded text) survives a re-render
function captureQueueState() {
    const state = {};
    document.querySelectorAll('#fifo-queue-list .fifo-card').forEach((card) => {
        const form = card.querySelector('.fb-form');
        state[card.dataset.id] = {
            expanded: !!card.querySelector('.desc.is-expanded'),
            open: !!card.querySelector('.fb-toggle[aria-expanded="true"]'),
            findings: form ? form.querySelector('.fb-findings').value : '',
            action: form ? form.querySelector('.fb-action').value : '',
            photo: form ? form.querySelector('.fb-photo').files[0] : null,
            pdf: form ? form.querySelector('.fb-pdf').files[0] : null,
        };
    });
    return state;
}
function restoreQueueState(state) {
    document.querySelectorAll('#fifo-queue-list .fifo-card').forEach((card) => {
        const s = state[card.dataset.id];
        if (!s) return;
        if (s.expanded) { const more = card.querySelector('.desc + .link-btn'); if (more) more.click(); }
        const form = card.querySelector('.fb-form');
        if (!form) return;
        const setText = (sel, v) => { const t = form.querySelector(sel); t.value = v; t.dispatchEvent(new Event('input')); };
        setText('.fb-findings', s.findings);
        setText('.fb-action', s.action);
        [['.fb-photo', s.photo], ['.fb-pdf', s.pdf]].forEach(([sel, file]) => {
            if (!file) return;
            const input = form.querySelector(sel);
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            input.dispatchEvent(new Event('change'));
        });
        if (s.open) {
            card.querySelector('.fb-toggle').setAttribute('aria-expanded', 'true');
            const panel = card.querySelector('.fb-section .reveal');
            panel.classList.remove('hidden');
            panel.classList.add('is-open');
        }
    });
}

// recount + renumber from the cards still on screen
function updateQueueSummary() {
    const cards = [...document.querySelectorAll('#fifo-queue-list .fifo-card:not(.is-leaving)')];
    cards.forEach((card, i) => { card.querySelector('.queue-no').textContent = i + 1; });
    animateCount($('stat-total'), cards.length);
    animateCount($('stat-emergency'), cards.filter((c) => c.dataset.priority === 'Kecemasan').length);
    animateCount($('stat-high'), cards.filter((c) => c.dataset.priority === 'Tinggi').length);
    animateCount($('stat-oldest'), cards.reduce((max, c) => Math.max(max, Number(c.dataset.days)), 0));
    $('tab-queue-count').textContent = cards.length;
    requestAnimationFrame(moveTabIndicator); // the count pill can change the tab width
}

function animateCount(el, to, duration = 500) {
    const from = Number(el.dataset.value || 0);
    el.dataset.value = to;
    if (reducedMotion() || from === to) { el.textContent = to; return; }
    const start = performance.now();
    const step = (now) => {
        const t = Math.min(1, Math.max(0, (now - start) / duration)); // rAF time can precede `start`
        el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
        if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

// options: silent (no skeleton, used by auto refresh / after feedback), unlockId (card to animate)
async function fetchFifoQueue(options = {}) {
    if (queueFetch) {                       // never overlap: run once more after the current fetch
        queueRefetch = Object.assign(queueRefetch || {}, options);
        return queueFetch;
    }
    queueFetch = loadQueue(options);
    try {
        await queueFetch;
    } finally {
        queueFetch = null;
    }
    if (queueRefetch) {
        const next = queueRefetch;
        queueRefetch = null;
        return fetchFifoQueue(next);
    }
}

async function loadQueue({ silent = false, unlockId = null } = {}) {
    const container = $('fifo-queue-list');
    const refreshBtn = $('refresh-btn');
    const saved = captureQueueState();
    refreshBtn.classList.add('is-spinning');
    refreshBtn.disabled = true;
    if (!silent) {
        container.setAttribute('aria-busy', 'true');
        container.innerHTML = skeletonCards(3);
    }

    try {
        const { data: pending, error } = await sb
            .from('reports')
            .select('*, report_feedback(*)')
            .neq('status', 'Selesai')
            .order('submitted_at', { ascending: true })
            .limit(100);

        if (error) {
            container.innerHTML = '<p class="error-msg">Ralat mengambil data: ' + esc(error.message) + '</p>';
            return;
        }
        if (!pending.length) {
            container.innerHTML = emptyQueueHtml();
            return;
        }

        const urls = await signedUrlMap(pending.flatMap(reportPaths));
        container.innerHTML = pending.map((r, idx) => fifoCardHtml(r, idx, urls, r.id === unlockId)).join('');
        pending.forEach((r) => wireCard(container.querySelector(`.fifo-card[data-id="${CSS.escape(String(r.id))}"]`), r.id));
        restoreQueueState(saved);
        if (silent) container.classList.remove('stagger'); else restartStagger(container);
        lastUpdated = Date.now();

        const fresh = unlockId != null && container.querySelector(`.fifo-card[data-id="${CSS.escape(String(unlockId))}"]`);
        if (fresh && fresh.querySelector('.fb-summary')) {
            // let the "before" state paint, then animate stepper + button to "after".
            // setTimeout (not rAF): the unlock must still happen if the tab is in the background.
            setTimeout(() => {
                setStepperStage(fresh.querySelector('.stepper'), 3);
                unlockDoneButton(fresh);
            }, 50);
        }
    } finally {
        container.removeAttribute('aria-busy');
        refreshBtn.classList.remove('is-spinning');
        refreshBtn.disabled = false;
        updateQueueSummary();
        updateLastUpdated();
        scheduleRefresh();
    }
}

// Auto refresh must not disturb an officer who is working in the queue
function queueIsBusy() {
    if (queueBusy > 0 || queueFetch) return true;
    const list = $('fifo-queue-list');
    if (list.querySelector('.is-loading, .is-leaving, .fb-toggle[aria-expanded="true"], .desc.is-expanded')) return true;
    return [...list.querySelectorAll('.fb-form')].some((f) =>
        [...f.querySelectorAll('textarea')].some((t) => t.value.trim()) ||
        [...f.querySelectorAll('input[type="file"]')].some((i) => i.files.length));
}
function queueTabVisible() {
    return !!profile && profile.role === 'ppd_officer' && !$('ppd-view').classList.contains('hidden')
        && !$('ppd-queue-panel').classList.contains('hidden') && !document.hidden;
}
function scheduleRefresh(ms = REFRESH_MS) {
    clearTimeout(refreshTimer);
    if (!queueTabVisible()) return;
    refreshTimer = setTimeout(() => {
        if (!queueTabVisible()) return;
        if (queueIsBusy()) return scheduleRefresh(BUSY_RETRY_MS);
        fetchFifoQueue({ silent: true });
    }, ms);
}
function updateLastUpdated() {
    const el = $('last-updated-text');
    if (!lastUpdated) { el.textContent = 'Memuatkan...'; return; }
    const sec = Math.floor((Date.now() - lastUpdated) / 1000);
    el.textContent = sec < 5 ? 'Dikemas kini baru sahaja'
        : sec < 60 ? `Dikemas kini ${sec} saat lalu`
        : `Dikemas kini ${Math.floor(sec / 60)} minit lalu`;
}
function startQueueTimers() {
    clearInterval(tickTimer);
    tickTimer = setInterval(updateLastUpdated, 1000);
}
function stopQueueTimers() {
    clearInterval(tickTimer);
    clearTimeout(refreshTimer);
}
document.addEventListener('visibilitychange', () => {
    if (!profile || profile.role !== 'ppd_officer' || $('ppd-queue-panel').classList.contains('hidden')) return;
    $('last-updated').classList.toggle('is-paused', document.hidden);
    if (document.hidden) return stopQueueTimers();
    startQueueTimers();
    scheduleRefresh(Date.now() - lastUpdated >= REFRESH_MS ? 0 : REFRESH_MS - (Date.now() - lastUpdated));
});

async function submitFeedback(e, reportId, form) {
    e.preventDefault();
    const btn = form.querySelector('.fb-submit');
    const uploaded = [];
    let saved = false;
    queueBusy++;

    try {
        setButtonState(btn, 'loading', 'Menghantar maklum balas...');

        const { photo_path, pdf_path } = await uploadOptionalFiles(
            form.querySelector('.fb-photo').files[0],
            form.querySelector('.fb-pdf').files[0],
            uploaded);

        const { error } = await sb.from('report_feedback').insert({
            report_id: reportId,
            findings: form.querySelector('.fb-findings').value.trim(),
            action_taken: form.querySelector('.fb-action').value.trim(),
            photo_path,
            pdf_path,
        });
        if (error) throw error;
        saved = true;
    } catch (err) {
        console.error('submitFeedback:', err);
        if (uploaded.length) await sb.storage.from(BUCKET).remove(uploaded);
        showToast('Ralat: ' + (err.message || err), 'error');
        setButtonState(btn, 'idle');
    } finally {
        queueBusy--;
    }
    if (!saved) return;

    // Saved: show the check, collapse the form, then reload; the card animates its stepper + Tanda Selesai unlock
    setButtonState(btn, 'success');
    await sleep(reducedMotion() ? 0 : 500);
    const card = form.closest('.fifo-card');
    card.querySelector('.fb-toggle').setAttribute('aria-expanded', 'false');
    setReveal(card.querySelector('.fb-section .reveal'), false);
    form.reset(); // so this card's draft is not restored into the refreshed card
    await sleep(reducedMotion() ? 0 : 300);
    showToast('Maklum balas berjaya dihantar. Anda kini boleh menandakan aduan sebagai SELESAI.', 'ok');
    fetchFifoQueue({ silent: true, unlockId: reportId });
}

// Slide the card out, then collapse its height so the cards below move up
function removeCard(card) {
    return new Promise((resolve) => {
        if (reducedMotion()) { card.remove(); return resolve(); }
        card.style.height = card.offsetHeight + 'px';
        card.classList.add('is-leaving');
        setTimeout(() => {
            card.classList.add('is-collapsing');
            card.style.height = '0px';
            setTimeout(() => { card.remove(); resolve(); }, 320);
        }, 200);
    });
}

async function markCompleted(id) {
    const card = document.querySelector(`#fifo-queue-list .fifo-card[data-id="${CSS.escape(String(id))}"]`);
    const btn = card && card.querySelector('.btn-done');
    queueBusy++; // covers the confirm dialog too
    try {
        if (!confirm('Adakah anda pasti ingin menandakan aduan ini sebagai SELESAI?')) return;
        if (btn) setButtonState(btn, 'loading');

        // The database also enforces this: it refuses "Selesai" without PPD feedback.
        const { data, error } = await sb.from('reports').update({ status: 'Selesai' }).eq('id', id).select();

        if (error) {
            if (btn) setButtonState(btn, 'idle');
            return showToast('Ralat mengemaskini status: ' + error.message, 'error');
        }
        if (!data || !data.length) {
            if (btn) setButtonState(btn, 'idle');
            return showToast('Tiada kebenaran untuk mengemaskini aduan ini.', 'error');
        }

        showToast('Aduan telah ditandakan SELESAI.', 'ok');
        if (!card) return void fetchFifoQueue({ silent: true });
        setButtonState(btn, 'success');
        await sleep(reducedMotion() ? 0 : 500);
        const leaving = removeCard(card);
        updateQueueSummary();
        await leaving;
        if (!document.querySelector('#fifo-queue-list .fifo-card')) $('fifo-queue-list').innerHTML = emptyQueueHtml();
    } finally {
        queueBusy--;
    }
}

// ==========================================
// 7. History (school: own reports via RLS; PPD: all schools)
// ==========================================

let historyTimer;
function debouncedHistory(scope) {
    clearTimeout(historyTimer);
    historyTimer = setTimeout(() => loadHistory(scope), 350);
}

const historySeq = { school: 0, ppd: 0 }; // only the newest search per list may render

function skeletonRows(n = 4) {
    return '<span class="sr-only">Memuatkan rekod aduan...</span>' + Array.from({ length: n }, () => `
        <div class="sk-row" aria-hidden="true">
            <div class="sk-stack"><div class="skeleton sk-line lg w-80"></div><div class="skeleton sk-line w-50"></div></div>
            <div class="skeleton sk-pill"></div>
        </div>`).join('');
}
const emptyHistoryHtml = (filtered) => filtered ? `
    <div class="empty-state">
        <span class="empty-icon">${icon('search')}</span>
        <strong>Tiada padanan</strong>
        <span>Tiada rekod aduan dijumpai. Cuba kata kunci atau status lain.</span>
    </div>` : `
    <div class="empty-state">
        <span class="empty-icon">${icon('inbox')}</span>
        <strong>Belum ada aduan</strong>
        <span>Tiada rekod aduan dijumpai.</span>
    </div>`;

function statusBadge(r) {
    const done = r.status === 'Selesai';
    return `<span class="badge ${done ? 'status-selesai' : 'status-menunggu'}">${icon(done ? 'check' : 'clock')}${esc(r.status)}</span>`;
}

function historyItemHtml(r, i, isPpd) {
    return `
        <details class="history-item" style="--i:${Math.min(i, 10)}">
            <summary class="history-row">
                <div>
                    <div class="history-title">${esc(r.title)}</div>
                    <div class="history-meta">
                        <span class="ref">${esc(r.ref_no)}</span>
                        ${isPpd ? `<span>${icon('building', 'icon-sm')}${esc(r.school_name)}</span>` : ''}
                        <span>${icon('tag', 'icon-sm')}${esc(r.category)}</span>
                        ${timeTag(r.submitted_at)}
                    </div>
                </div>
                <div class="history-badges">${priorityBadge(r)}${statusBadge(r)}</div>
                ${icon('chevron-down', 'chev')}
            </summary>
            <div class="hist-body"></div>
        </details>`;
}

// Opened row: description, files, timeline (sent → feedback → done) and the feedback summary
function historyDetailHtml(r, urls) {
    const fb = one(r.report_feedback);
    const done = r.status === 'Selesai' && r.completed_at;
    return `
        <p class="hist-desc pre">${esc(r.description)}</p>
        <div class="evidence-grid">${linkButtons(reportLinks(r, urls))}</div>
        <ol class="timeline">
            <li class="is-done"><span class="tl-dot"></span><div><strong>Aduan dihantar</strong>
                <span class="muted">${esc(fullDate(r.submitted_at))}</span></div></li>
            <li class="${fb ? 'is-done' : ''}"><span class="tl-dot"></span><div><strong>Maklum balas siasatan</strong>
                <span class="muted">${fb ? esc(fb.officer_name) + ' · ' + esc(fullDate(fb.created_at)) : 'Belum dihantar'}</span></div></li>
            <li class="${done ? 'is-done' : ''}"><span class="tl-dot"></span><div><strong>Selesai</strong>
                <span class="muted">${done ? esc(fullDate(r.completed_at)) : 'Belum selesai'}</span></div></li>
        </ol>
        ${fb ? feedbackBlock(fb, urls) : '<p class="small muted hist-note">Belum ada maklum balas siasatan daripada PPD.</p>'}`;
}

async function loadHistory(scope) {
    const isPpd = scope === 'ppd';
    const container = $(`${scope}-history-list`);
    const seq = ++historySeq[scope];
    container.setAttribute('aria-busy', 'true');
    container.innerHTML = skeletonRows(4);

    const status = $(`${scope}-status`).value;
    const term = $(`${scope}-search`).value.trim().replace(/[^\p{L}\p{N}\s\-\/]/gu, '');

    let query = sb.from('reports')
        .select('*, report_feedback(*)')
        .order('submitted_at', { ascending: false })
        .limit(100);
    if (status) query = query.eq('status', status);
    if (term) query = query.or(`ref_no.ilike.%${term}%,title.ilike.%${term}%,school_name.ilike.%${term}%`);

    const { data, error } = await query;
    if (seq !== historySeq[scope]) return; // a newer search has started; drop this stale result
    container.removeAttribute('aria-busy');

    const count = $(`${scope}-history-count`);
    if (error) {
        count.textContent = '–';
        container.innerHTML = '<p class="error-msg">Ralat: ' + esc(error.message) + '</p>';
        return;
    }
    count.textContent = data.length;
    if (!data.length) {
        container.innerHTML = emptyHistoryHtml(Boolean(status || term));
        return;
    }

    container.innerHTML = data.map((r, i) => historyItemHtml(r, i, isPpd)).join('');
    container.querySelectorAll('.history-item').forEach((row, i) => {
        const r = data[i];
        // Load signed URLs only when the row is opened
        row.addEventListener('toggle', async () => {
            if (!row.open || row.dataset.loaded) return;
            row.dataset.loaded = '1';
            const body = row.querySelector('.hist-body');
            body.innerHTML = '<div class="sk-stack" aria-hidden="true"><div class="skeleton sk-line w-90"></div>' +
                             '<div class="skeleton sk-line w-60"></div></div>';
            const urls = await signedUrlMap(reportPaths(r));
            body.innerHTML = historyDetailHtml(r, urls);
        });
    });
    restartStagger(container);
}