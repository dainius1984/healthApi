// api/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleSpreadsheet } = require('google-spreadsheet');

// Create Express app
const app = express();

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Log environment status on startup
console.log('Environment check:', {
  hasEmail: !!process.env.GOOGLE_CLIENT_EMAIL,
  hasKey: !!process.env.GOOGLE_PRIVATE_KEY,
  hasSpreadsheetId: !!process.env.SPREADSHEET_ID
});

// Main handler function
async function handleSheetRequest(req, res) {
  try {
    console.log('Request received:', req.body);

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ error: 'Request body is required' });
    }

    const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    });

    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    await sheet.addRow(req.body);

    console.log('Successfully added row to sheet');
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Main endpoint for sheet operations
app.post('/api', handleSheetRequest);

// For local development server
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Available endpoints:');
    console.log('- GET /api/health: Health check');
    console.log('- POST /api: Add data to Google Sheet');
  });
}

// Export for Vercel
module.exports = app;