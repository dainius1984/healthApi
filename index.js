require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const session = require('express-session');
const axios = require('axios');
const payuService = require('./services/payu.service');

const app = express();
const PORT = process.env.PORT || 3001;

// Session middleware setup
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true, // Changed to true to allow guest sessions
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Updated CORS configuration for production with Vercel and PayU
app.use(cors({
  origin: [
    'https://viking-eta.vercel.app',    // Vercel production
    'https://familybalance.pl',         // Custom domain
    'https://www.familybalance.pl',     // Custom domain with www
    'https://sandbox.payu.com'          // PayU sandbox
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'OpenPayU-Signature'],
}));

app.use(express.json());

// Auth middleware
const authMiddleware = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Session check endpoint
app.get('/api/check-session', (req, res) => {
  if (req.session.userId) {
    res.json({ authenticated: true });
  } else {
    res.status(401).json({ authenticated: false });
  }
});

// Auth endpoints
app.post('/api/login', async (req, res) => {
  const { email, appwriteSession } = req.body;
  try {
    // Store both email and Appwrite session ID
    req.session.userId = email;
    req.session.appwriteSession = appwriteSession;
    req.session.cart = req.session.cart || [];
    
    // Set proper CORS headers
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.clearCookie('connect.sid');
  res.json({ success: true });
});

// Cart endpoints
app.get('/api/cart', authMiddleware, (req, res) => {
  const cart = req.session.cart || [];
  res.json(cart);
});

app.post('/api/cart', authMiddleware, (req, res) => {
  req.session.cart = req.body;
  res.json({ success: true });
});

// Modified sheet handling function with validation and error handling
async function handleSheetRequest(req, res) {
  try {
    console.log('Request received:', req.body);

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ error: 'Request body is required' });
    }

    // Basic validation of required fields
    const requiredFields = [
      'Numer zamowienia',
      'Email',
      'Telefon',
      'Produkty',
      'Imie',
      'Nazwisko',
      'Ulica',
      'Kod pocztowy',
      'Miasto'
    ];
    
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        fields: missingFields 
      });
    }

    const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
    const formattedKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') || '';

    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: formattedKey
    });

    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    
    // Add payment status column
    const rowData = {
      ...req.body,
      'Status płatności': 'PENDING', // Initial payment status
      'PayU OrderId': '', // Will be updated after PayU order creation
    };
    
    const addedRow = await sheet.addRow(rowData);
    console.log('Successfully added row to sheet');
    
    return addedRow;
  } catch (error) {
    console.error('Error:', error);
    throw error; // Re-throw to be handled by calling function
  }
}

// Payment endpoints
app.post('/api/create-payment', async (req, res) => {
  try {
    console.log('Payment request received:', req.body);

    // First save order to Google Sheet
    const sheetRow = await handleSheetRequest(req, res);

    // Get PayU authorization token
    const accessToken = await payuService.getAuthToken();

    // Prepare order data for PayU
    const orderData = payuService.createOrderData(
      {
        orderNumber: req.body['Numer zamowienia'],
        cart: JSON.parse(req.body.Produkty),
        total: parseFloat(req.body['Suma'])
      },
      req.body,
      req.ip
    );

    // Create PayU order
    const payuResponse = await payuService.createOrder(orderData, accessToken);

    // Update sheet row with PayU order ID
    await sheetRow.update({
      'PayU OrderId': payuResponse.orderId
    });

    res.json({
      success: true,
      redirectUrl: payuResponse.redirectUrl,
      orderId: payuResponse.orderId
    });

  } catch (error) {
    console.error('Payment processing error:', error);
    res.status(500).json({
      error: 'Payment creation failed',
      details: error.message
    });
  }
});

// PayU webhook endpoint
app.post('/api/payu-webhook', async (req, res) => {
  try {
    console.log('PayU webhook received:', req.body);
    
    const { order } = req.body;
    if (!order || !order.orderId || !order.status) {
      throw new Error('Invalid webhook payload');
    }

    // Update order status in Google Sheet
    const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
    const formattedKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') || '';

    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: formattedKey
    });

    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    
    const orderRow = rows.find(row => row['PayU OrderId'] === order.orderId);
    if (orderRow) {
      orderRow['Status płatności'] = order.status;
      await orderRow.save();
      console.log(`Updated order ${order.orderId} status to ${order.status}`);
    }

    res.status(200).json({ status: 'OK' });
  } catch (error) {
    console.error('PayU webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// New endpoint specifically for guest orders with rate limiting
app.post('/api/guest-order', async (req, res) => {
  try {
    // Add basic anti-spam protection
    const clientIp = req.ip;
    const orderCount = req.session.orderCount || 0;
    
    if (orderCount > 5) { // Limit to 5 orders per session
      return res.status(429).json({ 
        error: 'Too many orders. Please try again later.' 
      });
    }

    req.session.orderCount = orderCount + 1;
    
    // Process the order
    await handleSheetRequest(req, res);
  } catch (error) {
    console.error('Guest order error:', error);
    res.status(500).json({ 
      error: 'Failed to process guest order',
      details: error.message 
    });
  }
});

// Original authenticated sheet endpoint
app.post('/api/sheet', authMiddleware, handleSheetRequest);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something broke!',
    details: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// Start server with environment check
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment check:`, {
    hasEmail: !!process.env.GOOGLE_CLIENT_EMAIL,
    hasKey: !!process.env.GOOGLE_PRIVATE_KEY,
    hasSpreadsheetId: !!process.env.SPREADSHEET_ID,
    hasSessionSecret: !!process.env.SESSION_SECRET,
    hasPayUConfig: !!(process.env.PAYU_POS_ID && process.env.PAYU_MD5_KEY),
    nodeEnv: process.env.NODE_ENV || 'development'
  });
});