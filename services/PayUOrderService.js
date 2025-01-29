const axios = require('axios');

class PayUOrderService {
  constructor(config, authService, securityService) {
    this.config = config;
    this.authService = authService;
    this.securityService = securityService;
    
    // Configure axios defaults
    this.client = axios.create({
      maxRedirects: 0,
      validateStatus: status => status < 400
    });
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
        totalAmount: orderData.totalAmount,
        url: `${this.config.baseUrl}/api/v2_1/orders`
      });

      const signature = this.securityService.calculateSignature(orderData);
      const url = `${this.config.baseUrl}/api/v2_1/orders`;
      
      console.log('PayU request details:', {
        url,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'OpenPayU-Signature': `signature=${signature};algorithm=MD5`
        },
        orderData: JSON.stringify(orderData, null, 2)
      });

      const response = await this.client.post(
        url,
        orderData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'OpenPayU-Signature': `signature=${signature};algorithm=MD5`
          }
        }
      );

      console.log('PayU response:', {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data
      });

      // Handle redirect response (302)
      if (response.status === 302 && response.headers.location) {
        return {
          redirectUrl: response.headers.location,
          orderId: orderData.extOrderId,
          status: 'REDIRECT',
          extOrderId: orderData.extOrderId
        };
      }

      // Handle JSON response
      if (response.data?.status?.statusCode === 'SUCCESS' || response.data?.redirectUri) {
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
      }

      // Handle HTML response
      if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
        const redirectMatch = response.data.match(/window\.location\.href\s*=\s*["'](.*?)["']/);
        if (redirectMatch) {
          return {
            redirectUrl: redirectMatch[1],
            orderId: orderData.extOrderId,
            status: 'REDIRECT',
            extOrderId: orderData.extOrderId
          };
        }
      }

      console.error('Invalid PayU response structure:', {
        status: response.status,
        data: response.data
      });
      
      throw new Error('Invalid response structure from PayU');

    } catch (error) {
      // Handle network errors
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        console.error('PayU connection error:', error);
        throw new Error('Could not connect to PayU service');
      }

      // Handle authentication errors
      if (error.response?.status === 401) {
        console.log('Auth token expired, retrying with new token...');
        try {
          const newToken = await this.authService.getAuthToken();
          return await this.executeCreateOrder(orderData, newToken);
        } catch (retryError) {
          console.error('PayU order retry failed:', retryError);
          throw retryError;
        }
      }

      // Enhanced error logging
      console.error('PayU order creation error:', {
        error: error.response?.data || error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url,
        orderNumber: orderData.extOrderId,
        rawResponse: error.response?.data
      });
      
      throw new Error(`Failed to create PayU order: ${
        error.response?.data?.error_description || 
        error.response?.data?.error || 
        error.message
      }`);
    }
  }

  async getOrderStatus(orderId) {
    try {
      const accessToken = await this.authService.getAuthToken();
      
      const response = await this.client.get(
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
      
      const response = await this.client.delete(
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