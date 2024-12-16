require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleSpreadsheet } = require('google-spreadsheet');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://viking-eta.vercel.app'  // Your Vercel frontend URL
  ],
  methods: ['POST', 'OPTIONS'],
  credentials: true
}));

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

async function handleSheetRequest(req, res) {
  try {
    console.log('Request received:', req.body);

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ error: 'Request body is required' });
    }

    const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
    
    // Format private key properly
    const formattedKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') || '';

    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: formattedKey
    });

    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    await sheet.addRow(req.body);

    console.log('Successfully added row to sheet');
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

app.post('/api', handleSheetRequest);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment check:`, {
    hasEmail: !!process.env.GOOGLE_CLIENT_EMAIL,
    hasKey: !!process.env.GOOGLE_PRIVATE_KEY,
    hasSpreadsheetId: !!process.env.SPREADSHEET_ID
  });
});