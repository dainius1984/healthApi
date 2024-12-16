// api/route.js
const { GoogleSpreadsheet } = require('google-spreadsheet');

const formatPrivateKey = (key) => {
  if (!key) return '';
  // If the key doesn't start with the header, assume it's the raw key
  if (!key.includes('-----BEGIN PRIVATE KEY-----')) {
    return `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----\n`;
  }
  return key.replace(/\\n/g, '\n');
};

async function handleSheetRequest(req, res) {
  try {
    console.log('Request received');
    
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ error: 'Request body is required' });
    }

    // Log environment check (safely)
    const envCheck = {
      hasEmail: !!process.env.GOOGLE_CLIENT_EMAIL,
      hasKey: !!process.env.GOOGLE_PRIVATE_KEY,
      hasSpreadsheetId: !!process.env.SPREADSHEET_ID
    };
    console.log('Environment check:', envCheck);

    const formattedKey = formatPrivateKey(process.env.GOOGLE_PRIVATE_KEY);
    
    const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: formattedKey
    });

    console.log('Auth successful, loading doc info...');
    await doc.loadInfo();
    
    console.log('Doc loaded, adding row...');
    const sheet = doc.sheetsByIndex[0];
    await sheet.addRow(req.body);

    console.log('Row added successfully');
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Detailed error:', error);
    return res.status(500).json({ 
      error: error.message,
      details: error.stack
    });
  }
}

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    return handleSheetRequest(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}