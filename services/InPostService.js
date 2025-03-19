const axios = require('axios');

/**
 * Service for interacting with InPost ShipX API
 */
class InPostService {
  constructor() {
    this.apiUrl = 'https://api-shipx-pl.easypack24.net/v1';
    this.token = process.env.INPOST_API_TOKEN;
    this.organizationId = process.env.INPOST_ORGANIZATION_ID;
    
    if (!this.token) {
      console.error('⚠️ WARNING: INPOST_API_TOKEN is not set!');
    } else {
      console.log('🔑 InPost API token is configured', {
        length: this.token.length,
        firstChars: this.token.substring(0, 3) + '...',
        lastChars: '...' + this.token.substring(this.token.length - 3)
      });
    }

    // Log organization ID status
    if (!this.organizationId) {
      console.error('⚠️ WARNING: INPOST_ORGANIZATION_ID is not set!');
    } else {
      console.log('🏢 InPost Organization ID is configured:', this.organizationId);
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
    
    // Determine if this is a locker or courier delivery
    const isLockerDelivery = !!recipient.paczkomatId;
    
    // Basic recipient data - ensure all fields are strings
    const receiverData = {
      first_name: recipient.firstName || (recipient.name ? recipient.name.split(' ')[0] : 'Klient'),
      last_name: recipient.lastName || (recipient.name && recipient.name.split(' ').length > 1 ? 
        recipient.name.split(' ').slice(1).join(' ') : 'Sklepu'),
      email: recipient.email || 'klient@familybalance.pl',
      phone: (recipient.phone || '500000000').toString().replace(/\s+/g, '') // Remove any spaces
    };
    
    // Create the base payload
    const payload = {
      receiver: receiverData,
      service: isLockerDelivery ? 'inpost_locker_standard' : 'inpost_courier_standard',
      reference: orderNumber || 'FB-ORDER'
    };
    
    // For locker delivery, use the template format
    if (isLockerDelivery) {
      // For Paczkomat deliveries, sending_method is required
      payload.custom_attributes = {
        sending_method: "dispatch_order",
        target_point: recipient.paczkomatId
      };
      
      // Try both formats to see which one works (parcels as object vs array)
      // Format 1: parcels as an object (from your example)
      payload.parcels = {
        template: "small"
      };
    } else {
      // For courier delivery
      payload.parcels = [{
        template: "small",
        is_non_standard: false,
        weight: {
          amount: (packageDetails.weight || 1.0).toString(),
          unit: "kg"
        }
      }];
      
      // Add address for courier
      payload.receiver.address = {
        street: recipient.address?.street || 'Nieznana',
        building_number: recipient.address?.buildingNumber || '1',
        city: recipient.address?.city || 'Warszawa',
        post_code: recipient.address?.postCode || '00-001',
        country_code: 'PL'
      };
    }
    
    // Log the final payload
    console.log('Final InPost payload prepared:', JSON.stringify(payload, null, 2));
    
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
        url: `${this.apiUrl}/organizations/${this.organizationId}/shipments`,
        method: 'POST',
        orderNumber: orderData.orderNumber,
        payload: JSON.stringify(payload),
        hasToken: !!this.token,
        tokenLength: this.token ? this.token.length : 0,
        organizationId: this.organizationId
      });
      
      const response = await axios.post(
        `${this.apiUrl}/organizations/${this.organizationId}/shipments`, 
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
      
      // Log the validation details specifically
      if (error.response && error.response.data && error.response.data.details) {
        console.error('❌ VALIDATION DETAILS:', JSON.stringify(error.response.data.details, null, 2));
      }
      
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