const express = require('express');
const cors = require('cors');
const session = require('express-session');
const config = require('./config/config');
const OrderService = require('./services/OrderService');
const PayUWebhookHandler = require('./services/PayUWebhookHandler');

// Validate environment variables before starting
config.validateEnvVars();

const app = express();
const PORT = process.env.PORT || 10000;

// Enhanced security headers middleware
const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
};

// CORS pre-flight handler
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 
    'Content-Type, Authorization, Content-Length, X-Requested-With, OpenPayU-Signature');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// Apply security headers
app.use(securityHeaders);

// Session configuration
app.use(session(config.sessionConfig));

// CORS configuration - apply after security headers
app.use(cors({
  ...config.corsConfig,
  origin: function(origin, callback) {
    const allowedOrigins = config.corsConfig.origin;
    
    // Allow requests with no origin (mobile apps, Postman, curl, etc)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`Blocked request from unauthorized origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

app.use(express.json({
  limit: '1mb', // Limit request size
  verify: (req, res, buf) => {
    req.rawBody = buf; // Store raw body for webhook verification
  }
}));

// Improved error handler middleware
const errorHandler = (err, req, res, next) => {
  console.error('Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    origin: req.headers.origin
  });

  // Handle CORS errors specifically
  if (err.message.includes('Not allowed by CORS')) {
    return res.status(403).json({
      error: 'Access denied',
      details: process.env.NODE_ENV === 'production' 
        ? 'Origin not allowed' 
        : `Origin ${req.headers.origin} not allowed`
    });
  }

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
};

// Health check route
app.get('/health', (req, res) => {
  const status = config.getEnvironmentStatus();
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    ...status
  });
});

// Create payment route
app.post('/api/create-payment', async (req, res) => {
  try {
    console.log('Payment request received:', {
      orderData: req.body.orderData,
      customerEmail: req.body.customerData?.Email,
      isAuthenticated: req.body.isAuthenticated,
      origin: req.headers.origin
    });

    const { orderData, customerData, isAuthenticated, userId } = req.body;
    
    if (!orderData?.cart || !orderData?.total || !customerData) {
      throw new Error('Missing required order data');
    }

    const result = await OrderService.createOrder(
      orderData,
      customerData,
      isAuthenticated,
      userId,
      req.ip
    );

    return res.json(result);
  } catch (error) {
    console.error('Payment processing error:', {
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      origin: req.headers.origin
    });

    return res.status(500).json({
      error: 'Payment creation failed',
      details: process.env.NODE_ENV === 'production' 
        ? 'An error occurred while processing the payment' 
        : error.message
    });
  }
});

// PayU webhook handler with enhanced logging
app.post('/api/payu-webhook', async (req, res) => {
  try {
    console.log('PayU webhook received:', {
      headers: req.headers,
      signature: req.headers['openpayu-signature'],
      timestamp: new Date().toISOString()
    });

    await PayUWebhookHandler.handleNotification(req);
    res.status(200).json({ status: 'SUCCESS' });
  } catch (error) {
    console.error('PayU webhook error:', {
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      headers: req.headers
    });

    res.status(500).json({ 
      error: process.env.NODE_ENV === 'production'
        ? 'Webhook processing failed'
        : error.message
    });
  }
});

// Apply error handler last
app.use(errorHandler);

// Start server with enhanced logging
app.listen(PORT, '0.0.0.0', () => {
  const status = config.getEnvironmentStatus();
  console.log(`Server running on port ${PORT}`);
  console.log('Environment check:', status);
  console.log('**==> Your service is live 🎉**');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});