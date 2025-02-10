const express = require('express');
const cors = require('cors');
const session = require('express-session');
const config = require('./config/config');
const OrderService = require('./services/OrderService');
const { securityService } = require('./services/PayUService');

// Validate environment variables before starting
config.validateEnvVars();

const app = express();
const PORT = process.env.PORT || 10000;

// Session configuration
app.use(session(config.sessionConfig));

// Pre-flight
app.options('*', cors(config.corsConfig));

// CORS configuration
app.use(cors(config.corsConfig));

app.use(express.json());

// Error handler middleware
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
  try {
    console.log('Payment request received:', req.body);

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
    console.error('Payment processing error:', error);
    return res.status(500).json({
      error: 'Payment creation failed',
      details: process.env.NODE_ENV === 'production' 
        ? 'An error occurred while processing the payment' 
        : error.message
    });
  }
});

// PayU webhook handler
app.post('/api/payu-webhook', async (req, res) => {
  try {
    console.log('PayU webhook received:', {
      headers: req.headers,
      body: req.body
    });

    const signature = req.headers['openpayu-signature']?.split(';')
      .find(part => part.startsWith('signature='))?.split('=')[1];

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

    await OrderService.updateOrderStatus(order.orderId, order.status);
    return res.status(200).json({ status: 'OK' });
  } catch (error) {
    console.error('PayU webhook error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

app.use(errorHandler);

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment check:', config.getEnvironmentStatus());
});