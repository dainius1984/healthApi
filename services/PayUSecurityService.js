// PayUSecurityService.js
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

      console.log('Validating webhook signature:', {
        receivedSignature: signature,
        bodyLength: JSON.stringify(body).length,
        keyLength: this.config.md5Key.length
      });

      const calculatedSignature = crypto
        .createHash('md5')
        .update(JSON.stringify(body) + this.config.md5Key)
        .digest('hex');
      
      // Log both signatures for comparison
      console.log('Signature comparison:', {
        received: signature,
        calculated: calculatedSignature,
        match: calculatedSignature === signature
      });

      return calculatedSignature === signature;
    } catch (error) {
      console.error('Webhook signature validation error:', error);
      return false;
    }
  }
}

module.exports = PayUSecurityService;