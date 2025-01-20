require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const session = require('express-session');
const axios = require('axios');
const payuService = require('./services/payu.service');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(cors({
  origin: [
    'https://viking-eta.vercel.app',
    'https://familybalance.pl',
    'https://www.familybalance.pl',
    'https://sandbox.payu.com'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'OpenPayU-Signature'],
}));

app.use(express.json());

const authMiddleware = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

app.get('/health', (req, res) => {
  return res.json({ status: 'ok' });
});

app.get('/api/check-session', (req, res) => {
  if (req.session.userId) {
    return res.json({ authenticated: true });
  }
  return res.status(401).json({ authenticated: false });
});

app.post('/api/login', async (req, res) => {
  const { email, appwriteSession } = req.body;
  try {
    req.session.userId = email;
    req.session.appwriteSession = appwriteSession;
    req.session.cart = req.session.cart || [];
    
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    
    return res.json({ success: true });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.clearCookie('connect.sid');
  return res.json({ success: true });
});

app.get('/api/cart', authMiddleware, (req, res) => {
  const cart = req.session.cart || [];
  return res.json(cart);
});

app.post('/api/cart', authMiddleware, (req, res) => {
  req.session.cart = req.body;
  return res.json({ success: true });
});

async function handleSheetRequest(req, res) {
  try {
    console.log('Request received:', req.body);

    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ error: 'Request body is required' });
    }

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
    
    const rowData = {
      ...req.body,
      'Status płatności': 'PENDING',
      'PayU OrderId': ''
    };
    
    const addedRow = await sheet.addRow(rowData);
    console.log('Successfully added row to sheet');
    
    return addedRow;
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Failed to process sheet request' });
  }
}

app.post('/api/create-payment', async (req, res) => {
  try {
    console.log('Payment request received:', req.body);

    const sheetData = {
      'Numer zamowienia': req.body.orderData.orderNumber,
      'Email': req.body.customerData.Email,
      'Telefon': req.body.customerData.Telefon,
      'Produkty': req.body.orderData.items,
      'Imie': req.body.customerData.Imie,
      'Nazwisko': req.body.customerData.Nazwisko,
      'Ulica': req.body.customerData.Ulica,
      'Kod pocztowy': req.body.customerData['Kod pocztowy'],
      'Miasto': req.body.customerData.Miasto
    };

    const sheetRow = await handleSheetRequest({ 
      body: sheetData  // Wrap in body object
    }, res);

    const accessToken = await payuService.getAuthToken();

    const orderData = payuService.createOrderData(
      {
        orderNumber: req.body.orderData.orderNumber,
        cart: req.body.orderData.cart,
        total: req.body.orderData.total
      },
      req.body.customerData,
      req.ip
    );

    const payuResponse = await payuService.createOrder(orderData, accessToken);

    await sheetRow.update({
      'PayU OrderId': payuResponse.orderId
    });

    return res.json({
      success: true,
      redirectUrl: payuResponse.redirectUrl,
      orderId: payuResponse.orderId
    });
  
  } catch (error) {
    console.error('Payment processing error:', error);
    return res.status(500).json({
      error: 'Payment creation failed',
      details: error.message
    });
  }
});

app.post('/api/payu-webhook', async (req, res) => {
  try {
    console.log('PayU webhook received:', req.body);
    
    const { order } = req.body;
    if (!order || !order.orderId || !order.status) {
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

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

    return res.status(200).json({ status: 'OK' });
  } catch (error) {
    console.error('PayU webhook error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

app.post('/api/guest-order', async (req, res) => {
  try {
    const clientIp = req.ip;
    const orderCount = req.session.orderCount || 0;
    
    if (orderCount > 5) {
      return res.status(429).json({ 
        error: 'Too many orders. Please try again later.' 
      });
    }

    req.session.orderCount = orderCount + 1;
    const result = await handleSheetRequest(req, res);
    return res.json(result);
  } catch (error) {
    console.error('Guest order error:', error);
    return res.status(500).json({ 
      error: 'Failed to process guest order',
      details: error.message 
    });
  }
});

app.post('/api/sheet', authMiddleware, handleSheetRequest);

app.use((err, req, res, next) => {
  console.error(err.stack);
  return res.status(500).json({ 
    error: 'Something broke!',
    details: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

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