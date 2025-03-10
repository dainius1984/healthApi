const axios = require('axios');

/**
 * Service for interacting with InPost ShipX API
 */
class InPostService {
  constructor() {
    this.apiUrl = 'https://api-shipx-pl.easypack24.net/v1';
    this.token = process.env.INPOST_API_TOKEN;
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
      const payload = this.createShipmentPayload(orderData);
      
      const response = await axios.post(
        `${this.apiUrl}/shipments`, 
        payload, 
        { headers: this.getHeaders() }
      );
      
      return response.data;
    } catch (error) {
      console.error('InPost ShipX API error:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = new InPostService(); 