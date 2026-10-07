exports.handler = async (event) => {
  // Always set CORS headers so the browser doesn't block the request
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  }

  try {
    const { username, password, role } = JSON.parse(event.body || '{}');

    // Demo credential validation
    if (
      (username === 'PPD102' && password === '123456' && role === 'Pegawai PPD Pontian') ||
      (username === 'JBA6001' && password === '123456' && role === 'Guru Besar (Sekolah)')
    ) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: 'success', user: { username, role } }),
      };
    }

    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ status: 'error', message: 'ID, kata laluan, atau peranan tidak sah.' }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ status: 'error', message: error.message }),
    };
  }
};