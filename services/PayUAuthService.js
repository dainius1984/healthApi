const axios = require('axios');

class PayUAuthService {
  constructor(config) {
    this.config = config;
  }

  async getAuthToken() {
    try {
      const url = `${this.config.baseUrl}/pl/standard/user/oauth/authorize`;
      
      const formData = new URLSearchParams();
      formData.append('grant_type', 'client_credentials');
      formData.append('client_id', this.config.clientId);
      formData.append('client_secret', this.config.clientSecret);

      console.log('PayU Auth Request:', {
        url,
        clientId: this.config.clientId
      });

      const response = await axios.post(url, formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      if (!response.data?.access_token) {
        console.error('Invalid auth response:', response.data);
        throw new Error('Invalid auth response from PayU');
      }

      return response.data.access_token;
    } catch (error) {
      console.error('PayU auth error:', {
        error: error.response?.data || error.message,
        status: error.response?.status
      });
      throw new Error('Failed to get PayU auth token: ' + 
        (error.response?.data?.error_description || error.message));
    }
  }
}

module.exports = PayUAuthService;