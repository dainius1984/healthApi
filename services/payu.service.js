// services/payu.service.js
const axios = require('axios');
const crypto = require('crypto');

class PayUService {
  constructor() {
    this.baseUrl = process.env.PAYU_SANDBOX_BASE_URL;
    this.posId = process.env.PAYU_POS_ID;
    this.md5Key = process.env.PAYU_MD5_KEY;
    this.clientId = process.env.PAYU_OAUTH_CLIENT_ID;
    this.clientSecret = process.env.PAYU_OAUTH_CLIENT_SECRET;
  }

// Fix this in payu.service.js
async getAuthToken() {
  try {
    const url = `${this.baseUrl}/pl/standard/user/oauth/authorize`;
    const formData = new URLSearchParams();
    formData.append('grant_type', 'client_credentials');
    formData.append('client_id', this.clientId);
    formData.append('client_secret', this.clientSecret);

    const response = await axios.post(url, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    return response.data.access_token;
  } catch (error) {
    console.error('Full PayU error:', error.response?.data || error);
    throw new Error('Failed to get PayU authorization token');
  }
}

  createOrderData(orderDetails, customerData, customerIp) {
    const orderData = {
      customerIp,
      merchantPosId: this.posId,
      description: `Family Balance Order ${orderDetails.orderNumber}`,
      currencyCode: 'PLN',
      totalAmount: Math.round(orderDetails.total * 100),
      buyer: {
        email: customerData.Email,
        phone: customerData.Telefon,
        firstName: customerData.Imie,
        lastName: customerData.Nazwisko,
        language: 'pl'
      },
      products: orderDetails.cart.map(item => ({
        name: item.name,
        unitPrice: Math.round(item.price * 100),
        quantity: item.quantity
      })),
      notifyUrl: `${process.env.BASE_URL}/api/payu-webhook`,
      continueUrl: `${process.env.FRONTEND_URL}/order-confirmation`
    };

    return orderData;
  }

  calculateSignature(orderData) {
    const signatureString = JSON.stringify(orderData) + this.md5Key;
    return crypto.createHash('md5').update(signatureString).digest('hex');
  }

  async createOrder(orderData, accessToken) {
    try {
      const signature = this.calculateSignature(orderData);
      
      const response = await axios.post(
        `${this.baseUrl}/api/v2_1/orders`,
        orderData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'OpenPayU-Signature': `signature=${signature};algorithm=MD5`
          }
        }
      );

      return {
        redirectUrl: response.data.redirectUri,
        orderId: response.data.orderId
      };
    } catch (error) {
      console.error('PayU order creation error:', error.response?.data || error);
      throw new Error('Failed to create PayU order');
    }
  }
}

module.exports = new PayUService();