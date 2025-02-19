// config/config.js
require('dotenv').config();

const requiredEnvVars = {
  // Session config
  SESSION_SECRET: process.env.SESSION_SECRET,

  // Google Sheets config
  GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL,
  GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
  SPREADSHEET_ID: process.env.SPREADSHEET_ID,

  // PayU config
  PAYU_POS_ID: process.env.PAYU_POS_ID,
  PAYU_MD5_KEY: process.env.PAYU_MD5_KEY,
  PAYU_OAUTH_CLIENT_ID: process.env.PAYU_OAUTH_CLIENT_ID,
  PAYU_OAUTH_CLIENT_SECRET: process.env.PAYU_OAUTH_CLIENT_SECRET,

  // URLs
  BASE_URL: process.env.BASE_URL,
  FRONTEND_URL: process.env.FRONTEND_URL,

  // Appwrite config
  APPWRITE_PROJECT_ID: process.env.APPWRITE_PROJECT_ID,
  APPWRITE_API_KEY: process.env.APPWRITE_API_KEY,
  APPWRITE_DATABASE_ID: process.env.APPWRITE_DATABASE_ID,
  APPWRITE_ORDERS_COLLECTION_ID: process.env.APPWRITE_ORDERS_COLLECTION_ID
};

// Validate environment variables
const validateEnvVars = () => {
  const missingVars = Object.entries(requiredEnvVars)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    console.error('Missing required environment variables:', missingVars.join(', '));
    process.exit(1);
  }
};

// CORS configuration
const corsConfig = {
  origin: function(origin, callback) {
    const allowedOrigins = [
      'https://viking-eta.vercel.app',
      'https://familybalance.pl',
      'https://www.familybalance.pl',
      'https://secure.snd.payu.com',
      'https://www.payu.pl',
      'https://sandbox.payu.com',
      'http://localhost:3000',
      'http://localhost:5173'
    ];

    // Allow requests with no origin (mobile apps, Postman, etc)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`Blocked request from unauthorized origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'OpenPayU-Signature',
    'Origin',
    'X-Requested-With',
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Headers'
  ],
  exposedHeaders: [
    'OpenPayU-Signature',
    'Access-Control-Allow-Origin'
  ],
  optionsSuccessStatus: 200,
  maxAge: 86400 // 24 hours - cache preflight requests
};

// In your Express app, make sure to apply this configuration like this:
// app.use(cors(corsConfig));

// Also add a specific handler for preflight requests
const preflightHandler = (req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Credentials', true);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  next();
};

module.exports = {
  validateEnvVars,
  corsConfig,
  preflightHandler, // Export the preflight handler
  sessionConfig,
  getEnvironmentStatus,
  env: requiredEnvVars
};