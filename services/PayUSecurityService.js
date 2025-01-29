// src/services/security/PayUSecurityService.js
const crypto = require('crypto');

class PayUSecurityService {
  constructor(config) {
    this.config = config;
  }

  calculateSignature(orderData) {
    try {
      const dataToSign = JSON.stringify(orderData) + this.config.md5Key;
      return crypto.createHash('md5').update(dataToSign).digest('hex');
    } catch (error) {
      console.error('Signature calculation error:', error);
      throw new Error('Failed to calculate order signature');
    }
  }

  validateWebhookSignature(body, signature) {
    try {
      if (!signature || !body) {
        console.error('Missing signature or body for validation');
        return false;
      }

      const calculatedSignature = crypto
        .createHash('md5')
        .update(JSON.stringify(body) + this.config.md5Key)
        .digest('hex');
      
      const isValid = calculatedSignature === signature;
      
      if (!isValid) {
        console.error('Signature validation failed:', {
          received: signature,
          calculated: calculatedSignature
        });
      }
      
      return isValid;
    } catch (error) {
      console.error('Webhook signature validation error:', error);
      return false;
    }
  }
}

module.exports = PayUSecurityService;