require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const { orderService, orderDataBuilder, securityService } = require('./services/PayUService');
const GoogleSheetsService = require('./services/googleSheets.service');

const app = express();
const PORT = process.env.PORT || 10000;

// Validate required environment variables
const requiredEnvVars = [
  'SESSION_SECRET',
  'GOOGLE_CLIENT_EMAIL',
  'GOOGLE_PRIVATE_KEY',
  'SPREADSHEET_ID',
  'PAYU_POS_ID',
  'PAYU_MD5_KEY',
  'PAYU_OAUTH_CLIENT_ID',
  'PAYU_OAUTH_CLIENT_SECRET',
  'BASE_URL',
  'FRONTEND_URL'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// CORS configuration
app.use(cors({
  origin: [
    'https://viking-eta.vercel.app',
    'https://familybalance.pl',
    'https://www.familybalance.pl',
    'https://secure.snd.payu.com',
    'https://www.payu.pl', 
    'https://sandbox.payu.com'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'OpenPayU-Signature'],
}));

app.use(express.json());

// Middleware to handle errors
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
};

// Health check route
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Create payment route
app.post('/api/create-payment', async (req, res) => {
  let orderNumber;

  try {
    console.log('Payment request received:', req.body);

    const { orderData, customerData } = req.body;
    if (!orderData?.cart || !orderData?.total || !customerData) {
      throw new Error('Missing required order data');
    }

    orderNumber = orderData.orderNumber || 
      `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Prepare sheet data
    const sheetData = {
      'Numer zamowienia': orderNumber,
      'Email': customerData.Email,
      'Telefon': customerData.Telefon,
      'Produkty': orderData.items,
      'Imie': customerData.Imie,
      'Nazwisko': customerData.Nazwisko,
      'Ulica': customerData.Ulica,
      'Kod pocztowy': customerData['Kod pocztowy'],
      'Miasto': customerData.Miasto,
      'Metoda dostawy': orderData.shipping || 'DPD',
      'Koszt dostawy': '15.00 PLN'
    };

    const payuOrderData = orderDataBuilder.buildOrderData(
      {
        orderNumber,
        cart: orderData.cart,
        total: orderData.total,
        shipping: orderData.shipping
      },
      customerData,
      req.ip || '127.0.0.1'
    );

    // Create PayU order
    const payuResponse = await orderService.createOrder(payuOrderData);

    // Add PayU OrderId to sheet data
    sheetData['PayU OrderId'] = payuResponse.orderId;
    await GoogleSheetsService.addRow(sheetData);

    return res.json({
      success: true,
      redirectUrl: payuResponse.redirectUrl,
      orderId: payuResponse.orderId,
      orderNumber: orderNumber
    });

  } catch (error) {
    console.error('Payment processing error:', error);
    return res.status(500).json({
      error: 'Payment creation failed',
      details: process.env.NODE_ENV === 'production' 
        ? 'An error occurred while processing the payment' 
        : error.message,
      orderNumber
    });
  }
});

// PayU webhook route
app.post('/api/payu-webhook', async (req, res) => {
  try {
    console.log('PayU webhook received:', {
      headers: req.headers,
      body: req.body
    });

    const signature = req.headers['openpayu-signature']?.split(';')
      .find(part => part.startsWith('signature='))?.split('=')[1];

    console.log('Extracted signature:', signature);

    if (!signature) {
      console.error('No signature found in headers');
      return res.status(400).json({ error: 'Missing signature' });
    }

    const isValid = securityService.validateWebhookSignature(req.body, signature);
    
    if (!isValid) {
      console.error('Invalid signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const { order } = req.body;
    if (!order?.orderId || !order?.status) {
      console.error('Invalid webhook payload:', req.body);
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    // Update order status in Google Sheets
    await GoogleSheetsService.updateOrderStatus(order.orderId, order.status);

    return res.status(200).json({ status: 'OK' });
  } catch (error) {
    console.error('PayU webhook error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Add error handler middleware
app.use(errorHandler);

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment check:', {
    hasEmail: !!process.env.GOOGLE_CLIENT_EMAIL,
    hasKey: !!process.env.GOOGLE_PRIVATE_KEY,
    hasSpreadsheetId: !!process.env.SPREADSHEET_ID,
    hasSessionSecret: !!process.env.SESSION_SECRET,
    hasPayUConfig: !!(process.env.PAYU_POS_ID && process.env.PAYU_MD5_KEY),
    nodeEnv: process.env.NODE_ENV || 'development'
  });
});