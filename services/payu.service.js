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

  async getAuthToken() {
    try {
      const url = `${this.baseUrl}/pl/standard/user/oauth/authorize`;
      const formData = new URLSearchParams();
      formData.append('grant_type', 'client_credentials');
      formData.append('client_id', this.clientId);
      formData.append('client_secret', this.clientSecret);

      console.log('PayU Auth Request:', {
        url,
        clientId: this.clientId,
        baseUrl: this.baseUrl
      });

      const response = await axios({
        method: 'post',
        url: url,
        data: formData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (!response.data || !response.data.access_token) {
        throw new Error('Invalid auth response from PayU');
      }

      return response.data.access_token;
    } catch (error) {
      console.error('PayU auth error:', error.response?.data || error.message);
      throw new Error('Failed to get PayU auth token: ' + (error.response?.data?.error_description || error.message));
    }
  }

  createOrderData(orderDetails, customerData, customerIp) {
    if (!orderDetails?.orderNumber) {
      throw new Error('Order number is required');
    }

    const total = parseFloat(orderDetails.total);
    if (isNaN(total) || total <= 0) {
      throw new Error('Invalid order total');
    }

    return {
      customerIp: customerIp || '127.0.0.1',
      merchantPosId: this.posId,
      description: `Family Balance Order ${orderDetails.orderNumber}`,
      currencyCode: 'PLN',
      totalAmount: Math.round(total * 100),
      buyer: {
        email: customerData.Email,
        phone: customerData.Telefon,
        firstName: customerData.Imie,
        lastName: customerData.Nazwisko,
        language: 'pl'
      },
      products: orderDetails.cart.map(item => ({
        name: item.name,
        unitPrice: Math.round(parseFloat(item.price) * 100),
        quantity: parseInt(item.quantity) || 1
      })),
      notifyUrl: `${process.env.BASE_URL}/api/payu-webhook`,
      continueUrl: `${process.env.FRONTEND_URL}/order-confirmation`
    };
  }

  calculateSignature(orderData) {
    try {
      const signatureString = JSON.stringify(orderData) + this.md5Key;
      return crypto.createHash('md5').update(signatureString).digest('hex');
    } catch (error) {
      console.error('Signature calculation error:', error);
      throw new Error('Failed to calculate order signature');
    }
  }

  async createOrder(orderData, accessToken) {
    try {
      console.log('Creating PayU order:', {
        orderNumber: orderData.description,
        totalAmount: orderData.totalAmount,
        buyerEmail: orderData.buyer.email
      });

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

      if (!response.data?.redirectUri || !response.data?.orderId) {
        throw new Error('Invalid order response from PayU');
      }

      console.log('PayU order created successfully:', response.data.orderId);

      return {
        redirectUrl: response.data.redirectUri,
        orderId: response.data.orderId
      };
    } catch (error) {
      console.error('PayU order creation error:', error.response?.data || error.message);
      throw new Error('Failed to create PayU order: ' + (error.response?.data?.error_description || error.message));
    }
  }

  validateWebhookSignature(body, signature) {
    try {
      const calculatedSignature = crypto
        .createHash('md5')
        .update(JSON.stringify(body) + this.md5Key)
        .digest('hex');
      
      return calculatedSignature === signature;
    } catch (error) {
      console.error('Webhook signature validation error:', error);
      return false;
    }
  }
}

module.exports = new PayUService();