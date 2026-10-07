// ==========================================
// e-Aduan Penyelenggaraan PPD Pontian
// Netlify (static) + Supabase (Auth, Postgres, Storage)
// ==========================================

const SUPABASE_URL = 'https://xlokucdgkiztwzuywemj.supabase.co';
// Public "anon" key only (never the service_role key). Paste your existing anon key here.
const SUPABASE_ANON_KEY = 'PASTE_YOUR_ANON_KEY_HERE';

const EMAIL_DOMAIN = 'aduan.ppdpontian.my'; // username -> username@EMAIL_DOMAIN (see schema.sql step 6)
const BUCKET = 'evidence';
const MAX_PDF_BYTES = 5 * 1024 * 1024;

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let profile = null;

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

document.addEventListener('DOMContentLoaded', async () => {
    const { data } = await sb.auth.getSession();
    await applySession(data.session);
    sb.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') showLogin();
    });
});

// ==========================================
// 1. Authentication (Supabase Auth, role from profiles table)
// ==========================================

async function handleLogin(e) {
    e.preventDefault();
    const username = $('username').value.trim().toLowerCase();
    const password = $('password').value;
    const btn = $('login-btn');

    btn.disabled = true;
    $('login-error').classList.add('hidden');

    const { data, error } = await sb.auth.signInWithPassword({
        email: `${username}@${EMAIL_DOMAIN}`,
        password,
    });

    btn.disabled = false;
    if (error) {
        $('login-error').classList.remove('hidden');
        return;
    }
    $('password').value = '';
    await applySession(data.session);
}

function showLogin() {
    profile = null;
    $('login-modal').classList.remove('hidden');
    $('user-session').classList.add('hidden');
    $('headmaster-view').classList.add('hidden');
    $('ppd-view').classList.add('hidden');
}

async function applySession(session) {
    if (!session) return showLogin();

    const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
    if (error || !data) {
        alert('Akaun anda belum didaftarkan dalam sistem. Sila hubungi pentadbir PPD.');
        await sb.auth.signOut();
        return;
    }
    profile = data;

    $('login-modal').classList.add('hidden');
    $('user-session').classList.remove('hidden');
    $('nav-user-name').textContent = 'Log Masuk: ' + profile.full_name;
    $('nav-user-role').textContent = profile.role === 'headmaster' ? 'Guru Besar' : 'Pegawai PPD';

    if (profile.role === 'headmaster') {
        $('headmaster-view').classList.remove('hidden');
        $('ppd-view').classList.add('hidden');
        fetchSchoolHistory();
    } else {
        $('ppd-view').classList.remove('hidden');
        $('headmaster-view').classList.add('hidden');
        fetchFifoQueue();
    }
}

async function logout() {
    await sb.auth.signOut();
}

// ==========================================
// 2. Local file previews
// ==========================================

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

// Shrink phone photos (often 4-8 MB) to ~200-400 KB so the 1 GB free storage lasts
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

// ==========================================
// 3. Submit report (files -> Storage, row -> Postgres)
// ==========================================

async function submitReport(e) {
    e.preventDefault();
    const btn = $('submit-btn');
    const originalText = btn.textContent;
    const uploaded = [];

    try {
        const photo = $('photo_file').files[0];
        const pdf = $('pdf_file').files[0];

        if (pdf && pdf.type !== 'application/pdf') throw new Error('Dokumen sokongan mesti dalam format PDF.');
        if (pdf && pdf.size > MAX_PDF_BYTES) throw new Error('Saiz PDF melebihi 5 MB.');

        btn.disabled = true;
        btn.textContent = 'Memuat naik fail & menghantar aduan...';

        let photo_path = null;
        let pdf_path = null;

        if (photo) {
            const blob = await compressImage(photo);
            photo_path = await uploadEvidence(blob, 'jpg', 'image/jpeg');
            uploaded.push(photo_path);
        }
        if (pdf) {
            pdf_path = await uploadEvidence(pdf, 'pdf', 'application/pdf');
            uploaded.push(pdf_path);
        }

        const { data, error } = await sb.from('reports').insert({
            category: $('category').value,
            priority: $('priority').value,
            title: $('title').value.trim(),
            description: $('description').value.trim(),
            photo_path,
            pdf_path,
        }).select('ref_no').single();

        if (error) throw error;

        alert('Aduan berjaya dihantar ke PPD Pontian!\n\nNo Rujukan: ' + data.ref_no);
        $('report-form').reset();
        $('image-preview-container').classList.add('hidden');
        $('pdf-preview-info').classList.add('hidden');
        fetchSchoolHistory();
    } catch (err) {
        console.error('submitReport:', err);
        if (uploaded.length) await sb.storage.from(BUCKET).remove(uploaded); // roll back orphan files
        alert('Ralat: ' + (err.message || err));
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
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

// ==========================================
// 5. PPD officer: FIFO queue
// ==========================================

async function fetchFifoQueue() {
    const container = $('fifo-queue-list');
    container.innerHTML = '<p>Memuatkan senarai FIFO aduan...</p>';

    const { data: pending, error } = await sb
        .from('reports')
        .select('*')
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

    const urls = await signedUrlMap(pending.flatMap((r) => [r.photo_path, r.pdf_path]));
    container.innerHTML = '';

    pending.forEach((r, idx) => {
        const days = Math.floor((Date.now() - new Date(r.submitted_at)) / 86400000);
        // Supabase signed URL while the file is still there, Google Drive link afterwards
        const photoUrl = urls[r.photo_path] || r.drive_photo_link;
        const pdfUrl = urls[r.pdf_path] || r.drive_pdf_link;

        const card = document.createElement('div');
        card.className = 'fifo-card';
        card.innerHTML = `
            <div class="fifo-header">
                <div>
                    <span class="badge ${r.priority === 'Kecemasan' ? 'badge-danger' : ''}">${esc(r.priority)}</span>
                    <strong>#${idx + 1} - ${esc(r.ref_no)}</strong> (${esc(r.school_name)})
                </div>
                <div class="day-counter">⏳ ${days === 0 ? 'Hari Ini' : days + ' Hari Berlalu'}</div>
            </div>
            <h4>${esc(r.title)}</h4>
            <p class="desc">${esc(r.description)}</p>
            <div class="evidence-grid">
                ${urls[r.photo_path] ? `<a href="${esc(photoUrl)}" target="_blank" rel="noopener">
                    <img src="${esc(photoUrl)}" class="evidence-thumb" alt="Foto bukti"></a>`
                  : (photoUrl ? `<a href="${esc(photoUrl)}" target="_blank" rel="noopener" class="btn-pdf-link">🖼️ Buka Gambar (Google Drive)</a>` : '')}
                <div>
                    ${pdfUrl ? `<a href="${esc(pdfUrl)}" target="_blank" rel="noopener" class="btn-pdf-link">📄 Buka Surat Rasmi (PDF)</a><br>` : ''}
                    <small class="muted">Kategori: ${esc(r.category)} | Dihantar: ${new Date(r.submitted_at).toLocaleString('ms-MY')}</small>
                </div>
            </div>
            <button class="btn-primary btn-done">✓ Tanda Selesai</button>
        `;
        card.querySelector('.btn-done').addEventListener('click', () => markCompleted(r.id));
        container.appendChild(card);
    });
}

async function markCompleted(id) {
    if (!confirm('Adakah anda pasti ingin menandakan aduan ini sebagai SELESAI?')) return;

    // completed_at is set by a database trigger
    const { data, error } = await sb.from('reports').update({ status: 'Selesai' }).eq('id', id).select();

    if (error) return alert('Ralat mengemaskini status: ' + error.message);
    if (!data || !data.length) return alert('Tiada kebenaran untuk mengemaskini aduan ini.');

    alert('Aduan telah ditandakan SELESAI.');
    fetchFifoQueue();
}

// ==========================================
// 6. Headmaster: own report history (RLS limits rows to own school)
// ==========================================

async function fetchSchoolHistory() {
    const container = $('school-history-list');
    container.innerHTML = '<small>Memuatkan rekod aduan...</small>';

    const { data, error } = await sb
        .from('reports')
        .select('ref_no,title,category,status,submitted_at')
        .order('submitted_at', { ascending: false })
        .limit(100);

    if (error || !data || !data.length) {
        container.innerHTML = '<small class="muted">Tiada rekod aduan lalu dijumpai untuk sekolah ini.</small>';
        return;
    }

    container.innerHTML = data.map((r) => {
        const done = r.status === 'Selesai';
        return `
            <div class="history-row">
                <div>
                    <b>${esc(r.ref_no)}</b> - ${esc(r.title)}
                    <div class="muted small">Tarikh: ${new Date(r.submitted_at).toLocaleDateString('ms-MY')} | Kategori: ${esc(r.category)}</div>
                </div>
                <span class="badge ${done ? 'badge-ok' : 'badge-wait'}">${esc(r.status)}</span>
            </div>`;
    }).join('');
}
