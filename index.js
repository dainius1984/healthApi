require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const axios = require('axios');
const payuService = require('./services/payu.service');

const app = express();
const PORT = process.env.PORT || 3001;

// Use MongoDB for session storage in production
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
};

if (process.env.NODE_ENV === 'production' && process.env.MONGODB_URI) {
  sessionConfig.store = MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 24 * 60 * 60 // 1 day
  });
}

app.use(session(sessionConfig));

const allowedOrigins = [
  'https://viking-eta.vercel.app',
  'https://familybalance.pl',
  'https://www.familybalance.pl',
  'https://secure.snd.payu.com',
  'https://www.payu.pl', 
  'https://sandbox.payu.com'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'OpenPayU-Signature'],
}));

app.use(express.json());

// Improved error handler middleware
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);
  const statusCode = err.status || 500;
  const errorMessage = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;

  res.status(statusCode).json({
    error: errorMessage,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};

const authMiddleware = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

async function handleSheetRequest(data) {
  if (!data || Object.keys(data).length === 0) {
    throw new Error('Request data is required');
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
    
  const missingFields = requiredFields.filter(field => !data[field]);
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }

  try {
    const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
    const formattedKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!formattedKey || !process.env.GOOGLE_CLIENT_EMAIL) {
      throw new Error('Google Sheets credentials are missing');
    }

    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: formattedKey
    });

    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    
    const rowData = {
      ...data,
      'Status płatności': data['Status płatności'] || 'PENDING',
      'Data zamówienia': new Date().toISOString()
    };
    
    const addedRow = await sheet.addRow(rowData);
    console.log('Successfully added row to sheet:', rowData['Numer zamowienia']);
    
    return addedRow;
  } catch (error) {
    console.error('Sheet request error:', error);
    throw new Error(`Failed to process sheet request: ${error.message}`);
  }
}
    
// Routes
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

app.post('/api/create-payment', async (req, res) => {
  let orderNumber;
  
  try {
    console.log('Payment request received:', req.body);

    // Validate request data
    const { orderData, customerData } = req.body;
    if (!orderData?.cart || !orderData?.total || !customerData) {
      throw new Error('Missing required order data');
    }

    // Validate customer data
    const requiredCustomerFields = ['Email', 'Telefon', 'Imie', 'Nazwisko', 'Ulica', 'Kod pocztowy', 'Miasto'];
    const missingFields = requiredCustomerFields.filter(field => !customerData[field]);
    if (missingFields.length > 0) {
      throw new Error(`Missing customer data: ${missingFields.join(', ')}`);
    }

    // Generate order number first
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
      'Miasto': customerData.Miasto
    };

    try {
      // Get PayU auth token
      const accessToken = await payuService.getAuthToken();

      // Create PayU order
      const payuOrderData = payuService.createOrderData(
        {
          orderNumber,
          cart: orderData.cart,
          total: orderData.total
        },
        customerData,
        req.ip || '127.0.0.1'
      );

      const payuResponse = await payuService.createOrder(payuOrderData, accessToken);

      // Only after successful PayU order creation, add PayU OrderId and save to sheet
      sheetData['PayU OrderId'] = payuResponse.orderId;
      await handleSheetRequest(sheetData);

      return res.json({
        success: true,
        redirectUrl: payuResponse.redirectUrl,
        orderId: payuResponse.orderId,
        orderNumber: orderNumber
      });

    } catch (payuError) {
      // If PayU fails, still try to save order to sheet but mark as failed
      sheetData['Status płatności'] = 'FAILED';
      sheetData['Error'] = payuError.message;
      await handleSheetRequest(sheetData);
      
      throw new Error(`PayU payment failed: ${payuError.message}`);
    }
  
  } catch (error) {
    console.error('Payment processing error:', error);
    return res.status(500).json({
      error: 'Payment creation failed',
      details: process.env.NODE_ENV === 'production' 
        ? 'An error occurred while processing the payment' 
        : error.message,
      orderNumber // Return order number even on failure
    });
  }
});

app.post('/api/payu-webhook', async (req, res) => {
  try {
    console.log('PayU webhook received:', req.body);
    
    // Validate webhook signature
    const signature = req.headers['openpayu-signature']?.split(';')[0]?.split('=')[1];
    if (!signature || !payuService.validateWebhookSignature(req.body, signature)) {
      console.error('Invalid webhook signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const { order } = req.body;
    if (!order?.orderId || !order?.status) {
      console.error('Invalid webhook payload:', req.body);
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    // Update order in Google Sheets
    const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    });

    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    
    const orderRow = rows.find(row => row['PayU OrderId'] === order.orderId);
    if (orderRow) {
      orderRow['Status płatności'] = order.status;
      await orderRow.save();
      console.log(`Updated order ${order.orderId} status to ${order.status}`);
    } else {
      console.warn(`Order ${order.orderId} not found in sheet`);
    }

    return res.status(200).json({ status: 'OK' });
  } catch (error) {
    console.error('PayU webhook error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Add error handler middleware
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment check:', {
    hasEmail: !!process.env.GOOGLE_CLIENT_EMAIL,
    hasKey: !!process.env.GOOGLE_PRIVATE_KEY,
    hasSpreadsheetId: !!process.env.SPREADSHEET_ID,
    hasSessionSecret: !!process.env.SESSION_SECRET,
    hasPayUConfig: !!(process.env.PAYU_POS_ID && process.env.PAYU_MD5_KEY),
    hasMongoDb: !!process.env.MONGODB_URI,
    nodeEnv: process.env.NODE_ENV || 'development'
  });
});