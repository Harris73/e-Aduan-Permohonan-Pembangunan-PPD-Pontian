// ==========================================
// e-Aduan Penyelenggaraan PPD Pontian
// ==========================================

// Supabase Configuration
const SUPABASE_URL = 'https://xlokucdgkiztwzuywemj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhsb2t1Y2Rna2l6dHd6dXl3ZW1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4ODQ0MzIsImV4cCI6MjEwNjQ2MDQzMn0.kF0GKvwqr1NRUxCBL7dd9OLyL1JPY-dR-gqqBeqBCC0';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Mock Users for Demo Authentication
const MOCK_USERS = [
    { username: 'JBA6001', password: '123456', role: 'headmaster', name: 'SK Pontian Utama (JBA6001)' },
    { username: 'PPD102',  password: '123456', role: 'ppd_officer', name: 'Pegawai Pembangunan PPD Pontian' }
];

let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
    checkSession();
});

// ==========================================
// 1. Google Drive Link Helpers & Instant Previews
// ==========================================

// Helper: Extract Google Drive File ID from standard, share, or embed URLs
function extractGDriveId(url) {
    if (!url) return null;
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || 
                  url.match(/id=([a-zA-Z0-9_-]+)/) ||
                  url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
}

// Convert Google Drive link to direct display image thumbnail (via Google CDN)
function getGDriveDirectImgUrl(driveUrl) {
    const fileId = extractGDriveId(driveUrl);
    return fileId ? `https://lh3.googleusercontent.com/d/${fileId}=s800` : driveUrl;
}

// Convert Google Drive link to direct PDF viewer preview
function getGDrivePdfViewUrl(driveUrl) {
    const fileId = extractGDriveId(driveUrl);
    return fileId ? `https://drive.google.com/file/d/${fileId}/preview` : driveUrl;
}

// Real-time Photo Preview Handler
function processPhotoGdriveLink() {
    const inputUrl = document.getElementById('gdrive_photo_link').value.trim();
    const previewContainer = document.getElementById('image-preview-container');
    const previewImg = document.getElementById('image-preview');

    if (inputUrl) {
        previewImg.src = getGDriveDirectImgUrl(inputUrl);
        previewContainer.classList.remove('hidden');
    } else {
        previewContainer.classList.add('hidden');
    }
}

function handleImageError() {
    document.getElementById('image-preview').src = 'https://via.placeholder.com/400x200?text=Pastikan+Akses+GDrive+Satu+Dunia+(Anyone+with+link)';
}

// Real-time PDF Preview Handler
function processPdfGdriveLink() {
    const inputUrl = document.getElementById('gdrive_pdf_link').value.trim();
    const previewInfo = document.getElementById('pdf-preview-info');
    const previewUrl = document.getElementById('pdf-preview-url');

    if (inputUrl) {
        previewUrl.href = getGDrivePdfViewUrl(inputUrl);
        previewInfo.classList.remove('hidden');
    } else {
        previewInfo.classList.add('hidden');
    }
}

// ==========================================
// 2. Authentication & Session Management
// ==========================================

function handleLogin(e) {
    e.preventDefault();
    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value.trim();
    const r = document.getElementById('role').value;

    const user = MOCK_USERS.find(x => x.username.toUpperCase() === u.toUpperCase() && x.password === p && x.role === r);

    if (user) {
        currentUser = user;
        localStorage.setItem('eaduan_user', JSON.stringify(user));
        document.getElementById('login-error').classList.add('hidden');
        checkSession();
    } else {
        document.getElementById('login-error').classList.remove('hidden');
    }
}

function checkSession() {
    const saved = localStorage.getItem('eaduan_user');
    if (saved) currentUser = JSON.parse(saved);

    if (currentUser) {
        document.getElementById('login-modal').classList.add('hidden');
        document.getElementById('user-session').classList.remove('hidden');
        document.getElementById('nav-user-name').innerHTML = `<b>Log Masuk:</b> ${currentUser.name}`;
        document.getElementById('nav-user-role').innerText = currentUser.role === 'headmaster' ? 'Guru Besar' : 'Pegawai PPD';

        if (currentUser.role === 'headmaster') {
            document.getElementById('headmaster-view').classList.remove('hidden');
            document.getElementById('ppd-view').classList.add('hidden');
            fetchSchoolHistory();
        } else {
            document.getElementById('ppd-view').classList.remove('hidden');
            document.getElementById('headmaster-view').classList.add('hidden');
            fetchFifoQueue();
        }
    } else {
        document.getElementById('login-modal').classList.remove('hidden');
        document.getElementById('user-session').classList.add('hidden');
    }
}

function logout() {
    localStorage.removeItem('eaduan_user');
    currentUser = null;
    location.reload();
}

// ==========================================
// 3. Submit Report (Direct to Supabase 24/7)
// ==========================================

async function submitReport(e) {
    e.preventDefault();

    const photoUrlInput = document.getElementById('gdrive_photo_link').value.trim();
    const pdfUrlInput   = document.getElementById('gdrive_pdf_link').value.trim();
    const submitBtn     = document.getElementById('btn-submit');
    const originalText  = submitBtn ? submitBtn.innerText : 'Hantar Permohonan Aduan';

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Menghantar aduan ke sistem PPD...';
    }

    const refNo = 'ADU-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);

    const newReport = {
        ref_no: refNo,
        school_name: currentUser ? currentUser.name : 'SK Pontian Utama',
        category: document.getElementById('category').value,
        title: document.getElementById('title').value.trim(),
        description: document.getElementById('description').value.trim(),
        priority: document.getElementById('priority').value,
        gdrive_photo_link: photoUrlInput,
        gdrive_pdf_link: pdfUrlInput,
        status: 'Menunggu'
    };

    try {
        const { data, error } = await _supabase.from('reports').insert([newReport]).select();

        if (error) {
            alert('Ralat menyimpan ke Supabase: ' + error.message);
        } else {
            alert('Aduan berjaya dihantar ke PPD Pontian 24/7!\n\nNo Rujukan: ' + refNo);
            document.getElementById('report-form').reset();
            document.getElementById('image-preview-container').classList.add('hidden');
            document.getElementById('pdf-preview-info').classList.add('hidden');
            fetchSchoolHistory();
        }
    } catch (err) {
        console.error('Error submitting report:', err);
        alert('Ralat sistem: ' + err.message);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = originalText;
        }
    }
}

// ==========================================
// 4. Query Pending FIFO Queue for PPD Officer
// ==========================================

async function fetchFifoQueue() {
    const container = document.getElementById('fifo-queue-list');
    container.innerHTML = '<p>Memuatkan senarai FIFO aduan...</p>';

    // Fetch reports where status != 'Selesai', ordered by submission date (Oldest first for FIFO)
    const { data: pending, error } = await _supabase
        .from('reports')
        .select('*')
        .neq('status', 'Selesai')
        .order('submitted_at', { ascending: true });

    if (error) {
        container.innerHTML = '<p class="error">Ralat mengambil data: ' + error.message + '</p>';
        return;
    }

    container.innerHTML = '';

    if (!pending || pending.length === 0) {
        container.innerHTML = '<p class="text-center" style="padding: 2rem; color: #6b7280;">🎉 Tiada aduan dalam senarai menunggu (Semua selesai).</p>';
        return;
    }

    pending.forEach((r, idx) => {
        const daysElapsed = Math.floor((new Date() - new Date(r.submitted_at)) / (1000 * 60 * 60 * 24));
        const photoEmbed = getGDriveDirectImgUrl(r.gdrive_photo_link);
        const pdfEmbed   = getGDrivePdfViewUrl(r.gdrive_pdf_link);

        const card = document.createElement('div');
        card.className = 'fifo-card';
        card.innerHTML = `
            <div class="fifo-header">
                <div>
                    <span class="badge ${r.priority === 'Kecemasan' ? 'badge-danger' : ''}">${r.priority}</span>
                    <strong>#${idx + 1} - ${r.ref_no}</strong> (${r.school_name})
                </div>
                <div class="day-counter">⏳ ${daysElapsed === 0 ? 'Hari Ini' : daysElapsed + ' Hari Berlalu'}</div>
            </div>
            <h4 style="margin: 0.5rem 0 0.25rem 0; font-size: 1.1rem;">${r.title}</h4>
            <p style="color: #4b5563; font-size: 0.95rem;">${r.description}</p>
            
            <div class="evidence-grid">
                ${r.gdrive_photo_link ? `
                    <div>
                        <a href="${r.gdrive_photo_link}" target="_blank">
                            <img src="${photoEmbed}" class="evidence-thumb" alt="Foto Bukti Google Drive" onerror="this.src='https://via.placeholder.com/140x100?text=Klik+Buka+GDrive'">
                        </a>
                    </div>
                ` : ''}
                <div>
                    ${r.gdrive_pdf_link ? `
                        <a href="${pdfEmbed}" target="_blank" class="btn-pdf-link">📄 Buka Surat Rasmi (Google Drive PDF)</a><br>
                    ` : ''}
                    <small style="color: #6b7280;">Masa Hantar: ${new Date(r.submitted_at).toLocaleString('ms-MY')}</small>
                </div>
            </div>
            
            <button class="btn-primary" style="background-color: #059669;" onclick="markCompleted(${r.id})">✓ Tanda Selesai & Beranjak ke Giliran Seterusnya</button>
        `;
        container.appendChild(card);
    });
}

// ==========================================
// 5. Mark Report Completed
// ==========================================

async function markCompleted(id) {
    if (!confirm('Adakah anda pasti ingin menandakan aduan ini sebagai SELESAI?')) return;

    const { error } = await _supabase
        .from('reports')
        .update({ status: 'Selesai', completed_at: new Date().toISOString() })
        .eq('id', id);

    if (error) {
        alert('Ralat mengemaskini status: ' + error.message);
    } else {
        alert('Aduan telah ditandakan SELESAI.');
        fetchFifoQueue();
    }
}

// ==========================================
// 6. Fetch School Specific History
// ==========================================

async function fetchSchoolHistory() {
    const container = document.getElementById('school-history-list');
    container.innerHTML = '<small>Memuatkan rekod aduan...</small>';

    const schoolName = currentUser ? currentUser.name : 'SK Pontian Utama (JBA6001)';

    const { data: schoolReports, error } = await _supabase
        .from('reports')
        .select('*')
        .eq('school_name', schoolName)
        .order('submitted_at', { ascending: false });

    if (error || !schoolReports || schoolReports.length === 0) {
        container.innerHTML = '<small style="color: #6b7280;">Tiada rekod aduan lalu dijumpai untuk sekolah ini.</small>';
        return;
    }

    container.innerHTML = '';
    schoolReports.forEach(r => {
        const div = document.createElement('div');
        div.style.padding = '10px';
        div.style.borderBottom = '1px solid #E5E7EB';
        const isDone = r.status === 'Selesai';
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <b>${r.ref_no}</b> - ${r.title}
                    <div style="font-size: 0.8rem; color: #6b7280;">Tarikh: ${new Date(r.submitted_at).toLocaleDateString('ms-MY')} | Kategori: ${r.category}</div>
                </div>
                <span class="badge" style="background-color: ${isDone ? '#d1fae5' : '#fef3c7'}; color: ${isDone ? '#065f46' : '#92400e'}; font-weight: bold;">
                    ${r.status}
                </span>
            </div>
        `;
        container.appendChild(div);
    });
}