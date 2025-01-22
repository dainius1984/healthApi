// services/payu.service.js
const axios = require('axios');
const crypto = require('crypto');

class PayUService {
  constructor() {
    // Validate required environment variables
    const requiredEnvVars = [
      'PAYU_SANDBOX_BASE_URL',
      'PAYU_POS_ID',
      'PAYU_MD5_KEY',
      'PAYU_OAUTH_CLIENT_ID',
      'PAYU_OAUTH_CLIENT_SECRET',
      'BASE_URL',
      'FRONTEND_URL'
    ];

    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    if (missingEnvVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
    }

    this.baseUrl = process.env.PAYU_SANDBOX_BASE_URL;
    this.posId = process.env.PAYU_POS_ID;
    this.md5Key = process.env.PAYU_MD5_KEY;
    this.clientId = process.env.PAYU_OAUTH_CLIENT_ID;
    this.clientSecret = process.env.PAYU_OAUTH_CLIENT_SECRET;
    
    console.log('PayU Service initialized with config:', {
      baseUrl: this.baseUrl,
      posId: this.posId,
      clientId: this.clientId
    });
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

      if (!response.data?.access_token) {
        throw new Error('Invalid auth response from PayU');
      }

      return response.data.access_token;
    } catch (error) {
      console.error('PayU auth error:', error.response?.data || error.message);
      throw new Error('Failed to get PayU auth token: ' + 
        (error.response?.data?.error_description || error.message));
    }
  }

  validateCustomerData(customerData) {
    const requiredFields = ['Email', 'Telefon', 'Imie', 'Nazwisko'];
    const missingFields = requiredFields.filter(field => !customerData[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Missing customer data: ${missingFields.join(', ')}`);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerData.Email)) {
      throw new Error('Invalid email format');
    }

    // Validate phone number (basic validation)
    if (customerData.Telefon.length < 9) {
      throw new Error('Invalid phone number');
    }

    return true;
  }

  createOrderData(orderDetails, customerData, customerIp) {
    console.log('Creating order data:', { orderDetails, customerData });

    if (!orderDetails?.orderNumber) {
      throw new Error('Order number is required');
    }

    if (!orderDetails?.cart || !Array.isArray(orderDetails.cart)) {
      throw new Error('Invalid cart data');
    }

    const total = parseFloat(orderDetails.total);
    if (isNaN(total) || total <= 0) {
      throw new Error('Invalid order total');
    }

    // Validate customer data
    this.validateCustomerData(customerData);

    // Validate and format products
    const products = orderDetails.cart.map(item => {
      const price = parseFloat(item.price);
      const quantity = parseInt(item.quantity) || 1;
      
      if (isNaN(price) || price <= 0) {
        throw new Error(`Invalid price for product: ${item.name}`);
      }

      if (quantity < 1) {
        throw new Error(`Invalid quantity for product: ${item.name}`);
      }

      return {
        name: item.name,
        unitPrice: Math.round(price * 100),
        quantity: quantity
      };
    });

    // Calculate total amount from products to verify against order total
    const calculatedTotal = products.reduce((sum, product) => 
      sum + (product.unitPrice * product.quantity), 0);

    if (Math.abs(calculatedTotal - Math.round(total * 100)) > 1) {
      throw new Error('Order total does not match products total');
    }

    // Create PayU order object
    const orderData = {
      customerIp: customerIp || '127.0.0.1',
      merchantPosId: this.posId,
      extOrderId: orderDetails.orderNumber,
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
      products: products,
      notifyUrl: `${process.env.BASE_URL}/api/payu-webhook`,
      continueUrl: `${process.env.FRONTEND_URL}/order-confirmation`,
      validityTime: 3600
    };

    console.log('Created order data:', {
      orderNumber: orderData.extOrderId,
      totalAmount: orderData.totalAmount,
      productsCount: orderData.products.length
    });

    return orderData;
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
      if (!accessToken) {
        throw new Error('Access token is required');
      }

      console.log('Creating PayU order:', {
        orderNumber: orderData.extOrderId,
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
        console.error('Invalid PayU response:', response.data);
        throw new Error('Invalid order response from PayU');
      }

      console.log('PayU order created successfully:', {
        orderId: response.data.orderId,
        status: response.data.status?.statusCode,
        orderNumber: orderData.extOrderId
      });

      return {
        redirectUrl: response.data.redirectUri,
        orderId: response.data.orderId,
        status: response.data.status?.statusCode,
        extOrderId: orderData.extOrderId
      };
    } catch (error) {
      console.error('PayU order creation error:', {
        error: error.response?.data || error.message,
        orderNumber: orderData.extOrderId
      });
      
      throw new Error('Failed to create PayU order: ' + 
        (error.response?.data?.error_description || error.message));
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
        .update(JSON.stringify(body) + this.md5Key)
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

  isValidOrderStatus(status) {
    const validStatuses = [
      'NEW',
      'PENDING',
      'WAITING_FOR_CONFIRMATION',
      'COMPLETED',
      'CANCELED',
      'REJECTED',
      'FAILED',
      'ERROR'
    ];
    return validStatuses.includes(status);
  }

  async getOrderStatus(orderId) {
    try {
      const accessToken = await this.getAuthToken();
      
      const response = await axios.get(
        `${this.baseUrl}/api/v2_1/orders/${orderId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.data?.orders?.[0]?.status) {
        throw new Error('Invalid status response from PayU');
      }

      return {
        status: response.data.orders[0].status,
        orderId: orderId
      };
    } catch (error) {
      console.error('Get order status error:', error.response?.data || error.message);
      throw new Error('Failed to get order status: ' + 
        (error.response?.data?.error_description || error.message));
    }
  }

  async cancelOrder(orderId) {
    try {
      const accessToken = await this.getAuthToken();
      
      const response = await axios.delete(
        `${this.baseUrl}/api/v2_1/orders/${orderId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.data?.status?.statusCode) {
        throw new Error('Invalid cancel response from PayU');
      }

      return {
        status: response.data.status.statusCode,
        orderId: orderId
      };
    } catch (error) {
      console.error('Cancel order error:', error.response?.data || error.message);
      throw new Error('Failed to cancel order: ' + 
        (error.response?.data?.error_description || error.message));
    }
  }
}

module.exports = new PayUService();