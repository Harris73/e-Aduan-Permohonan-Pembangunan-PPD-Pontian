const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');
const Busboy = require('busboy');
const { Readable } = require('stream');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Ensure latest .env is dynamically loaded even in running dev server
try {
  require('dotenv').config({ override: true });
} catch (e) {
  // Dotenv is optional in deployed environments
}

// Safely decode and validate private key from Base64 or standard string
function getPrivateKey() {
  // Strategy 1: GDRIVE_PRIVATE_KEY_BASE64
  const base64Key = process.env.GDRIVE_PRIVATE_KEY_BASE64;
  if (base64Key) {
    try {
      const cleanB64 = base64Key.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '');
      const decoded = Buffer.from(cleanB64, 'base64').toString('utf8').replace(/\\n/g, '\n');
      crypto.createPrivateKey(decoded);
      return decoded;
    } catch (err) {
      console.warn('GDRIVE_PRIVATE_KEY_BASE64 decoding warning:', err.message);
    }
  }

  // Strategy 2: GDRIVE_PRIVATE_KEY
  const rawKey = process.env.GDRIVE_PRIVATE_KEY;
  if (rawKey) {
    try {
      const cleaned = rawKey.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
      crypto.createPrivateKey(cleaned);
      return cleaned;
    } catch (err) {
      console.warn('GDRIVE_PRIVATE_KEY decoding warning:', err.message);
    }
  }

  // Strategy 3: Check local service account JSON if present (for development)
  const candidateJsonFiles = [
    process.env.GDRIVE_KEY_FILE,
    'C:/Users/User/Downloads/e-aduan-storage-a045f758fba2.json',
    path.join(__dirname, '../../e-aduan-storage-a045f758fba2.json'),
    path.join(__dirname, '../../service-account.json'),
  ].filter(Boolean);

  for (const f of candidateJsonFiles) {
    try {
      if (fs.existsSync(f)) {
        const sa = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (sa.private_key) {
          crypto.createPrivateKey(sa.private_key);
          return sa.private_key;
        }
      }
    } catch (e) {
      // Continue to next candidate
    }
  }

  return null;
}

// Initialize Supabase Client
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_KEY || '';
  return createClient(url, key);
}

// Configure Google Drive API Client
function getDriveClient() {
  const clientEmail = process.env.GDRIVE_CLIENT_EMAIL || 'aduan-drive-uploader@e-aduan-storage.iam.gserviceaccount.com';
  const privateKey = getPrivateKey();
  const folderId = process.env.GDRIVE_FOLDER_ID;

  if (!privateKey) {
    throw new Error('Kunci peribadi Google Drive (GDRIVE_PRIVATE_KEY) tidak sah atau tidak dijumpai.');
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive',
    ],
  });

  const drive = google.drive({
    version: 'v3',
    auth: auth,
    timeout: 15000,
  });

  return { auth, drive, folderId };
}

// Helper function to parse multipart form data with multiple files
function parseFormData(event) {
  return new Promise((resolve, reject) => {
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    
    if (!contentType) {
      return reject(new Error('Missing Content-Type header'));
    }

    const busboy = Busboy({ headers: { 'content-type': contentType } });
    const fields = {};
    const files = [];

    busboy.on('field', (fieldname, val) => {
      fields[fieldname] = val;
    });

    busboy.on('file', (fieldname, file, info) => {
      const { filename, mimeType } = info;
      const buffers = [];

      file.on('data', (data) => buffers.push(data));
      file.on('end', () => {
        if (filename) {
          files.push({
            fieldname,
            filename,
            mimeType,
            buffer: Buffer.concat(buffers),
          });
        }
      });
    });

    busboy.on('finish', () => resolve({ fields, files }));
    busboy.on('error', (error) => reject(error));

    const bodyBuffer = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body || '', 'utf-8');

    busboy.write(bodyBuffer);
    busboy.end();
  });
}

// Helper function to upload file stream to Google Drive
async function uploadToDrive(drive, folderId, fileObj) {
  const stream = Readable.from(fileObj.buffer);

  const driveResponse = await drive.files.create({
    requestBody: {
      name: `${Date.now()}_${fileObj.filename}`,
      parents: folderId ? [folderId] : [],
    },
    media: {
      mimeType: fileObj.mimeType,
      body: stream,
    },
    fields: 'id, webViewLink',
  });

  const fileId = driveResponse.data.id;
  const webViewLink = driveResponse.data.webViewLink;

  await drive.permissions.create({
    fileId: fileId,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  return { fileId, webViewLink };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  }

  try {
    const { auth, drive, folderId } = getDriveClient();
    await auth.authorize();

    const { fields, files } = await parseFormData(event);

    const school_code = fields.school_code || '';
    const school_name = fields.school_name || '';
    const category = fields.category || '';
    const priority = fields.priority || 'Sederhana';
    const title = fields.title || '';
    const description = fields.description || '';

    let photoUrl = null;
    let pdfUrl = null;

    for (const file of files) {
      const uploadResult = await uploadToDrive(drive, folderId, file);
      if (file.fieldname === 'photo') {
        photoUrl = uploadResult.webViewLink;
      } else if (file.fieldname === 'pdf') {
        pdfUrl = uploadResult.webViewLink;
      } else if (!photoUrl) {
        photoUrl = uploadResult.webViewLink;
      }
    }

    const supabase = getSupabaseClient();
    const ref_no = 'ADU-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);

    const reportData = {
      ref_no: ref_no,
      school_name: school_name || 'SK Pontian Utama',
      category: category || 'Elektrik',
      priority: priority || 'Sederhana',
      title: title || 'Aduan Kerosakan',
      description: description || '',
      gdrive_photo_link: photoUrl || pdfUrl || '',
      gdrive_pdf_link: pdfUrl || photoUrl || '',
      status: 'Menunggu',
    };

    const { data, error } = await supabase
      .from('reports')
      .insert([reportData])
      .select();

    if (error) {
      console.error('Supabase Insert Error:', error.message);
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          status: 'warning',
          message: 'Fail dimuat naik ke Google Drive, tetapi ralat pangkalan data: ' + error.message,
          drivePhoto: photoUrl,
          drivePdf: pdfUrl,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        status: 'success',
        message: 'Aduan dan fail berjaya disimpan ke Google Drive dan Supabase.',
        ref_no: ref_no,
        data,
      }),
    };
  } catch (error) {
    console.error('Submission Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: error.message || 'Internal Server Error',
      }),
    };
  }
};