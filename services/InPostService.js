const axios = require('axios');

/**
 * Service for interacting with InPost ShipX API
 */
class InPostService {
  constructor() {
    this.apiUrl = 'https://api-shipx-pl.easypack24.net/v1';
    this.token = process.env.INPOST_API_TOKEN;
    
    if (!this.token) {
      console.error('⚠️ WARNING: INPOST_API_TOKEN is not set!');
    } else {
      console.log('🔑 InPost API token is configured', {
        length: this.token.length,
        firstChars: this.token.substring(0, 3) + '...',
        lastChars: '...' + this.token.substring(this.token.length - 3)
      });
    }
  }

  /**
   * Get headers for ShipX API requests
   * @returns {Object} Headers object with authorization
   */
  getHeaders() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Map package size code (A/B/C) to dimensions in mm
   * @param {string} sizeCode - Size code (A, B, or C)
   * @returns {Object} Dimensions object with length, width, height in mm
   */
  mapSizeToDimensions(sizeCode) {
    const sizeMap = {
      'A': { length: 80, width: 380, height: 640 },
      'B': { length: 190, width: 380, height: 640 },
      'C': { length: 410, width: 380, height: 640 }
    };
    
    return sizeMap[sizeCode.toUpperCase()] || sizeMap['A']; // Default to A if invalid
  }

  /**
   * Create shipment payload for ShipX API
   * @param {Object} orderData - Order data from frontend
   * @returns {Object} Formatted payload for ShipX API
   */
  createShipmentPayload(orderData) {
    const { recipient, packageDetails, orderNumber } = orderData;
    const dimensions = this.mapSizeToDimensions(packageDetails.size);
    
    // Determine if this is a locker or courier delivery
    const isLockerDelivery = !!recipient.paczkomatId;
    
    const payload = {
      receiver: {
        name: recipient.name,
        email: recipient.email,
        phone: recipient.phone
      },
      parcels: [{
        dimensions: {
          length: dimensions.length,
          width: dimensions.width,
          height: dimensions.height,
          unit: 'mm'
        },
        weight: {
          amount: packageDetails.weight || 1.0,
          unit: 'kg'
        }
      }],
      service: isLockerDelivery ? 'inpost_locker_standard' : 'inpost_courier_standard',
      reference: orderNumber,
      end_of_week_collection: false
    };
    
    // Add target point for locker delivery
    if (isLockerDelivery) {
      payload.custom_attributes = {
        target_point: recipient.paczkomatId
      };
    } else {
      // Add address for courier delivery
      payload.receiver.address = {
        street: recipient.address.street,
        building_number: recipient.address.buildingNumber,
        city: recipient.address.city,
        post_code: recipient.address.postCode,
        country_code: 'PL'
      };
    }
    
    return payload;
  }

  /**
   * Create a shipment with InPost ShipX API
   * @param {Object} orderData - Order data from frontend
   * @returns {Promise<Object>} ShipX API response
   */
  async createShipment(orderData) {
    try {
      console.log('📦 Shipment creation request received:', {
        orderNumber: orderData.orderNumber,
        recipient: {
          ...orderData.recipient,
          email: orderData.recipient?.email ? '***@***' : undefined, // Redact email for privacy
          phone: orderData.recipient?.phone ? '***' : undefined // Redact phone for privacy
        },
        packageDetails: orderData.packageDetails,
        timestamp: new Date().toISOString()
      });
      
      const payload = this.createShipmentPayload(orderData);
      
      // Log the request payload
      console.log('🚚 INPOST API REQUEST:', {
        url: `${this.apiUrl}/shipments`,
        method: 'POST',
        orderNumber: orderData.orderNumber,
        payload: JSON.stringify(payload),
        hasToken: !!this.token,
        tokenLength: this.token ? this.token.length : 0
      });
      
      const response = await axios.post(
        `${this.apiUrl}/shipments`, 
        payload, 
        { headers: this.getHeaders() }
      );
      
      // Log the complete response
      console.log('✅ INPOST API RESPONSE SUCCESS:', {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: JSON.stringify(response.data, null, 2)
      });
      
      // Log specific important fields
      console.log('📦 INPOST SHIPMENT CREATED:', {
        orderNumber: orderData.orderNumber,
        shipmentId: response.data.id,
        trackingNumber: response.data.tracking_number,
        status: response.data.status,
        labelUrl: response.data.href,
        createdAt: new Date().toISOString()
      });
      
      return response.data;
    } catch (error) {
      // Log detailed error information
      console.error('❌ INPOST API ERROR:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
      
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error('📄 INPOST API ERROR RESPONSE:', {
          status: error.response.status,
          statusText: error.response.statusText,
          headers: error.response.headers,
          data: JSON.stringify(error.response.data, null, 2)
        });
      } else if (error.request) {
        // The request was made but no response was received
        console.error('🔄 INPOST API NO RESPONSE:', {
          request: error.request._currentUrl || error.request.path,
          method: error.request.method
        });
      } else {
        // Something happened in setting up the request that triggered an Error
        console.error('⚠️ INPOST API REQUEST SETUP ERROR:', error.message);
      }
      
      // Log the request configuration that caused the error
      if (error.config) {
        console.error('🔧 INPOST API REQUEST CONFIG:', {
          url: error.config.url,
          method: error.config.method,
          headers: {
            ...error.config.headers,
            Authorization: 'Bearer [REDACTED]' // Don't log the actual token
          },
          data: error.config.data
        });
      }
      
      throw error;
    }
  }
}

module.exports = new InPostService(); 