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
const fmtDate = (d) => new Date(d).toLocaleString('ms-MY');
const one = (x) => (Array.isArray(x) ? x[0] : x) || null; // embedded 1-to-1 relation

function priorityBadge(r) {
    if (r.priority === 'Kecemasan') {
        const critical = r.emergency_level === 'Kritikal';
        return `<span class="badge ${critical ? 'badge-critical' : 'badge-danger'}">Kecemasan – ${esc(r.emergency_level || '')}</span>`;
    }
    return `<span class="badge">${esc(r.priority)}</span>`;
}

function linkButtons(items) {
    const ok = items.filter((i) => i.url);
    return ok.length
        ? ok.map((i) => `<a class="btn-pdf-link" href="${esc(i.url)}" target="_blank" rel="noopener">${i.label}</a>`).join(' ')
        : '<small class="muted">Tiada lampiran</small>';
}

document.addEventListener('DOMContentLoaded', async () => {
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
        $('headmaster-view').classList.remove('hidden');
        $('ppd-view').classList.add('hidden');
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
    $('emergency-level-group').classList.toggle('hidden', !isEmergency);
    $('emergency_level').required = isEmergency;
    if (!isEmergency) $('emergency_level').value = '';
}

function previewLocalImage(event) {
    const file = event.target.files[0];
    const box = $('image-preview-container');
    if (!file) return box.classList.add('hidden');
    $('image-preview').src = URL.createObjectURL(file);
    box.classList.remove('hidden');
}

function previewLocalPdf(event) {
    const file = event.target.files[0];
    const box = $('pdf-preview-info');
    if (!file) return box.classList.add('hidden');
    $('pdf-file-name').textContent = `📄 ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
    box.classList.remove('hidden');
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
    const originalText = btn.textContent;
    const uploaded = [];

    try {
        const priority = $('priority').value;
        const emergency_level = priority === 'Kecemasan' ? $('emergency_level').value : null;
        if (priority === 'Kecemasan' && !emergency_level) throw new Error('Sila pilih Tahap Kecemasan (Kritikal / Tidak Kritikal).');

        btn.disabled = true;
        btn.textContent = 'Memuat naik fail & menghantar aduan...';
        $('submit-success').classList.add('hidden');

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

        showSubmitSuccess(data.ref_no);
        $('report-form').reset();
        onPriorityChange();
        $('image-preview-container').classList.add('hidden');
        $('pdf-preview-info').classList.add('hidden');
        loadHistory('school');
    } catch (err) {
        console.error('submitReport:', err);
        if (uploaded.length) await sb.storage.from(BUCKET).remove(uploaded);
        showToast('Ralat: ' + (err.message || err), 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// Stays visible (unlike a toast) so the headmaster can note down the reference number
function showSubmitSuccess(refNo) {
    const panel = $('submit-success');
    panel.innerHTML = `
        <div>
            <strong>Aduan berjaya dihantar ke PPD Pontian!</strong>
            <div>No Rujukan: <b class="ref-no">${esc(refNo)}</b></div>
        </div>
        <button type="button" class="btn-close" aria-label="Tutup">✕</button>`;
    panel.querySelector('.btn-close').addEventListener('click', () => panel.classList.add('hidden'));
    panel.classList.remove('hidden');
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        { label: '🖼️ Gambar Kerosakan', url: urls[r.photo_path] || r.drive_photo_link },
        { label: '📄 Surat Rasmi', url: urls[r.pdf_path] || r.drive_pdf_link },
    ];
}

function feedbackBlock(fb, urls) {
    const links = linkButtons([
        { label: '🖼️ Gambar Siasatan', url: urls[fb.photo_path] || fb.drive_photo_link },
        { label: '📄 Borang Maklum Balas', url: urls[fb.pdf_path] || fb.drive_pdf_link },
    ]);
    return `
        <div class="fb-block">
            <h5>✅ Maklum Balas Siasatan PPD</h5>
            <p class="small muted">${esc(fb.officer_name)} • ${fmtDate(fb.created_at)}</p>
            <p><b>Dapatan:</b> <span class="pre">${esc(fb.findings)}</span></p>
            <p><b>Tindakan:</b> <span class="pre">${esc(fb.action_taken)}</span></p>
            <div class="evidence-grid">${links}</div>
        </div>`;
}

// ==========================================
// 5. PPD officer: tabs
// ==========================================

function showPpdTab(name) {
    const queue = name === 'queue';
    $('ppd-queue-panel').classList.toggle('hidden', !queue);
    $('ppd-history-panel').classList.toggle('hidden', queue);
    $('tab-queue').classList.toggle('active', queue);
    $('tab-history').classList.toggle('active', !queue);
    if (queue) fetchFifoQueue(); else loadHistory('ppd');
}

// ==========================================
// 6. PPD officer: FIFO queue + feedback form + mark completed
// ==========================================

async function fetchFifoQueue() {
    const container = $('fifo-queue-list');
    container.innerHTML = '<p>Memuatkan senarai FIFO aduan...</p>';

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
        container.innerHTML = '<p class="empty-note">🎉 Tiada aduan dalam senarai menunggu (semua selesai).</p>';
        return;
    }

    const urls = await signedUrlMap(pending.flatMap(reportPaths));
    container.innerHTML = '';

    pending.forEach((r, idx) => {
        const fb = one(r.report_feedback);
        const days = Math.floor((Date.now() - new Date(r.submitted_at)) / 86400000);
        const photoUrl = urls[r.photo_path] || r.drive_photo_link;

        const card = document.createElement('div');
        card.className = 'fifo-card' + (r.emergency_level === 'Kritikal' ? ' fifo-critical' : '');
        card.innerHTML = `
            <div class="fifo-header">
                <div>
                    ${priorityBadge(r)}
                    <strong>#${idx + 1} - ${esc(r.ref_no)}</strong> (${esc(r.school_name)})
                </div>
                <div class="day-counter">⏳ ${days === 0 ? 'Hari Ini' : days + ' Hari Berlalu'}</div>
            </div>
            <h4>${esc(r.title)}</h4>
            <p class="desc">${esc(r.description)}</p>
            <div class="evidence-grid">
                ${urls[r.photo_path] ? `<a href="${esc(photoUrl)}" target="_blank" rel="noopener">
                    <img src="${esc(photoUrl)}" class="evidence-thumb" alt="Foto bukti"></a>` : ''}
                <div>
                    ${linkButtons(reportLinks(r, urls))}<br>
                    <small class="muted">Kategori: ${esc(r.category)} | Dihantar: ${fmtDate(r.submitted_at)}</small>
                </div>
            </div>

            ${fb ? feedbackBlock(fb, urls) : `
            <details class="fb-details">
                <summary>📝 Hantar Maklum Balas Siasatan</summary>
                <form class="fb-form">
                    <div class="form-group">
                        <label>Dapatan siasatan *</label>
                        <textarea class="fb-findings" rows="3" maxlength="3000" required
                            placeholder="Apa yang didapati semasa siasatan / lawatan..."></textarea>
                    </div>
                    <div class="form-group">
                        <label>Tindakan yang diambil / dicadangkan *</label>
                        <textarea class="fb-action" rows="3" maxlength="3000" required
                            placeholder="Contoh: Kerja baik pulih dijadualkan, kontraktor dilantik..."></textarea>
                    </div>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Gambar siasatan (pilihan)</label>
                            <input type="file" class="fb-photo" accept="image/jpeg,image/png,image/webp">
                        </div>
                        <div class="form-group">
                            <label>Surat maklum balas PDF (pilihan, maks 5 MB)</label>
                            <input type="file" class="fb-pdf" accept="application/pdf">
                        </div>
                    </div>
                    <button type="submit" class="btn-primary fb-submit">Hantar Maklum Balas</button>
                </form>
            </details>`}

            <button class="btn-primary btn-done" ${fb ? '' : 'disabled'}>✓ Tanda Selesai</button>
            ${fb ? '' : '<small class="muted">Hantar maklum balas siasatan dahulu sebelum menandakan selesai.</small>'}
        `;

        card.querySelector('.btn-done').addEventListener('click', () => markCompleted(r.id));
        const form = card.querySelector('.fb-form');
        if (form) form.addEventListener('submit', (ev) => submitFeedback(ev, r.id, form));
        container.appendChild(card);
    });
}

async function submitFeedback(e, reportId, form) {
    e.preventDefault();
    const btn = form.querySelector('.fb-submit');
    const originalText = btn.textContent;
    const uploaded = [];

    try {
        btn.disabled = true;
        btn.textContent = 'Menghantar maklum balas...';

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

        showToast('Maklum balas berjaya dihantar. Anda kini boleh menandakan aduan sebagai SELESAI.', 'ok');
        fetchFifoQueue();
    } catch (err) {
        console.error('submitFeedback:', err);
        if (uploaded.length) await sb.storage.from(BUCKET).remove(uploaded);
        showToast('Ralat: ' + (err.message || err), 'error');
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

async function markCompleted(id) {
    if (!confirm('Adakah anda pasti ingin menandakan aduan ini sebagai SELESAI?')) return;

    // The database also enforces this: it refuses "Selesai" without PPD feedback.
    const { data, error } = await sb.from('reports').update({ status: 'Selesai' }).eq('id', id).select();

    if (error) return showToast('Ralat mengemaskini status: ' + error.message, 'error');
    if (!data || !data.length) return showToast('Tiada kebenaran untuk mengemaskini aduan ini.', 'error');

    showToast('Aduan telah ditandakan SELESAI.', 'ok');
    fetchFifoQueue();
}

// ==========================================
// 7. History (school: own reports via RLS; PPD: all schools)
// ==========================================

let historyTimer;
function debouncedHistory(scope) {
    clearTimeout(historyTimer);
    historyTimer = setTimeout(() => loadHistory(scope), 350);
}

async function loadHistory(scope) {
    const isPpd = scope === 'ppd';
    const container = $(`${scope}-history-list`);
    container.innerHTML = '<small>Memuatkan rekod aduan...</small>';

    const status = $(`${scope}-status`).value;
    const term = $(`${scope}-search`).value.trim().replace(/[^\p{L}\p{N}\s\-\/]/gu, '');

    let query = sb.from('reports')
        .select('*, report_feedback(*)')
        .order('submitted_at', { ascending: false })
        .limit(100);
    if (status) query = query.eq('status', status);
    if (term) query = query.or(`ref_no.ilike.%${term}%,title.ilike.%${term}%,school_name.ilike.%${term}%`);

    const { data, error } = await query;

    if (error) {
        container.innerHTML = '<small class="error-msg">Ralat: ' + esc(error.message) + '</small>';
        return;
    }
    if (!data.length) {
        container.innerHTML = '<small class="muted">Tiada rekod aduan dijumpai.</small>';
        return;
    }

    container.innerHTML = '';
    data.forEach((r) => {
        const done = r.status === 'Selesai';
        const row = document.createElement('details');
        row.className = 'history-item';
        row.innerHTML = `
            <summary class="history-row">
                <div>
                    <b>${esc(r.ref_no)}</b> - ${esc(r.title)}
                    <div class="muted small">
                        ${isPpd ? esc(r.school_name) + ' | ' : ''}${new Date(r.submitted_at).toLocaleDateString('ms-MY')} | ${esc(r.category)}
                    </div>
                </div>
                <div class="history-badges">
                    ${priorityBadge(r)}
                    <span class="badge ${done ? 'badge-ok' : 'badge-wait'}">${esc(r.status)}</span>
                </div>
            </summary>
            <div class="hist-body"><small class="muted">Memuatkan butiran...</small></div>`;

        // Load signed URLs only when the row is opened
        row.addEventListener('toggle', async () => {
            if (!row.open || row.dataset.loaded) return;
            row.dataset.loaded = '1';
            const urls = await signedUrlMap(reportPaths(r));
            const fb = one(r.report_feedback);
            row.querySelector('.hist-body').innerHTML = `
                <p class="pre">${esc(r.description)}</p>
                <div class="evidence-grid">${linkButtons(reportLinks(r, urls))}</div>
                <p class="small muted">Dihantar: ${fmtDate(r.submitted_at)}${r.completed_at ? ' | Selesai: ' + fmtDate(r.completed_at) : ''}</p>
                ${fb ? feedbackBlock(fb, urls)
                     : '<p class="small muted">Belum ada maklum balas siasatan daripada PPD.</p>'}`;
        });
        container.appendChild(row);
    });
}