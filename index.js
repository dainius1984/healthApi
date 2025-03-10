const express = require('express');
const cors = require('cors');
const session = require('express-session');
const config = require('./config/config');
const OrderService = require('./services/OrderService');
const PayUWebhookHandler = require('./services/PayUWebhookHandler');
const shippingRoutes = require('./routes/shipping');

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

// PayU webhook handler - now using the dedicated component
app.post('/api/payu-webhook', async (req, res) => {
  try {
    await PayUWebhookHandler.handleNotification(req);
    res.status(200).json({ status: 'SUCCESS' });
  } catch (error) {
    console.error('PayU webhook error:', error);
    res.status(500).json({ 
      error: process.env.NODE_ENV === 'production'
        ? 'Webhook processing failed'
        : error.message
    });
  }
});

// Register shipping routes
app.use('/api/shipping', shippingRoutes);

app.use(errorHandler);

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment check:', config.getEnvironmentStatus());
});