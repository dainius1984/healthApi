class PayUConfig {
  constructor() {
    const requiredEnvVars = [
      'PAYU_SANDBOX_BASE_URL',
      'PAYU_POS_ID',
      'PAYU_MD5_KEY',
      'PAYU_OAUTH_CLIENT_ID',
      'PAYU_OAUTH_CLIENT_SECRET',
      'BASE_URL',
      'FRONTEND_URL'
    ];

    this.validateEnvVars(requiredEnvVars);
    this.initializeConfig();
  }

  validateEnvVars(requiredEnvVars) {
    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    if (missingEnvVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
    }
  }

  initializeConfig() {
    this.baseUrl = process.env.PAYU_SANDBOX_BASE_URL.replace(/\/$/, '');
    this.posId = process.env.PAYU_POS_ID;
    this.md5Key = process.env.PAYU_MD5_KEY;
    this.clientId = process.env.PAYU_OAUTH_CLIENT_ID;
    this.clientSecret = process.env.PAYU_OAUTH_CLIENT_SECRET;
    
    console.log('PayU Config initialized:', {
      baseUrl: this.baseUrl,
      posId: this.posId,
      clientId: this.clientId
    });
  }
}

module.exports = PayUConfig;