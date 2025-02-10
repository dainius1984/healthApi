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
    origin: [
      'https://viking-eta.vercel.app',
      'https://familybalance.pl',
      'https://www.familybalance.pl',
      'https://secure.snd.payu.com',
      'https://www.payu.pl', 
      'https://sandbox.payu.com',
      // Add development origins if needed
      'http://localhost:3000',
      'http://localhost:5173'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: [
      'Content-Type', 
      'Authorization', 
      'Accept', 
      'OpenPayU-Signature',
      'Origin',
      'X-Requested-With'
    ],
    exposedHeaders: ['OpenPayU-Signature'],
    optionsSuccessStatus: 200
  };

// Session configuration
const sessionConfig = {
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
};

// CORS configuration
const corsConfig = {
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'OpenPayU-Signature'],
};

// Environment status check
const getEnvironmentStatus = () => ({
  hasEmail: !!process.env.GOOGLE_CLIENT_EMAIL,
  hasKey: !!process.env.GOOGLE_PRIVATE_KEY,
  hasSpreadsheetId: !!process.env.SPREADSHEET_ID,
  hasSessionSecret: !!process.env.SESSION_SECRET,
  hasPayUConfig: !!(process.env.PAYU_POS_ID && process.env.PAYU_MD5_KEY),
  hasAppwriteConfig: !!(process.env.APPWRITE_PROJECT_ID && process.env.APPWRITE_API_KEY),
  nodeEnv: process.env.NODE_ENV || 'development'
});

module.exports = {
  validateEnvVars,
  corsConfig,
  sessionConfig,
  getEnvironmentStatus,
  env: requiredEnvVars
};