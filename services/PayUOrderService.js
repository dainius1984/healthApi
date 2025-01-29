const axios = require('axios');

class PayUOrderService {
  constructor(config, authService, securityService) {
    this.config = config;
    this.authService = authService;
    this.securityService = securityService;
  }

  async createOrder(orderData) {
    try {
      const accessToken = await this.authService.getAuthToken();
      return await this.executeCreateOrder(orderData, accessToken);
    } catch (error) {
      console.error('Create order error:', error);
      throw error;
    }
  }

  async executeCreateOrder(orderData, accessToken) {
    try {
      if (!accessToken) {
        throw new Error('Access token is required');
      }

      console.log('Creating PayU order:', {
        orderNumber: orderData.extOrderId,
        totalAmount: orderData.totalAmount
      });

      const signature = this.securityService.calculateSignature(orderData);
      const url = `${this.config.baseUrl}/api/v2_1/orders`;
      
      const response = await axios.post(url, orderData, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'OpenPayU-Signature': `signature=${signature};algorithm=MD5`
        }
      });

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
      if (error.response?.status === 401) {
        console.log('Auth token expired, retrying with new token...');
        const newToken = await this.authService.getAuthToken();
        return await this.executeCreateOrder(orderData, newToken);
      }

      console.error('PayU order creation error:', {
        error: error.response?.data || error.message,
        status: error.response?.status,
        orderNumber: orderData.extOrderId
      });
      
      throw new Error('Failed to create PayU order: ' + 
        (error.response?.data?.error_description || error.message));
    }
  }

  async getOrderStatus(orderId) {
    try {
      const accessToken = await this.authService.getAuthToken();
      
      const response = await axios.get(
        `${this.config.baseUrl}/api/v2_1/orders/${orderId}`,
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
      const accessToken = await this.authService.getAuthToken();
      
      const response = await axios.delete(
        `${this.config.baseUrl}/api/v2_1/orders/${orderId}`,
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

module.exports = PayUOrderService;