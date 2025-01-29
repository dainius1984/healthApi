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

// services/orders/PayUOrderService.js

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
      
      // Add detailed logging
      console.log('PayU request details:', {
        url,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'OpenPayU-Signature': `signature=${signature};algorithm=MD5`
        },
        orderData: JSON.stringify(orderData)
      });
  
      const response = await axios.post(
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
  
      // Log the raw response
      console.log('PayU raw response:', response.data);
  
      if (response.data?.status?.statusCode === 'SUCCESS' && response.data?.redirectUri) {
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
  
      console.error('Invalid PayU response structure:', response.data);
      throw new Error('Invalid response structure from PayU');
  
    } catch (error) {
      // Retry once on authentication error
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
      
      throw new Error(`Failed to create PayU order: ${error.response?.data?.error_description || error.message}`);
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