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
      'Content-Type': 'application/json',
      'Accept-Language': 'en_GB', // For English error messages
      'X-User-Agent': 'FamilyBalance-Backend/1.0',
      'X-Request-ID': `fb-inpost-${Date.now()}`
    };
  }

  /**
   * Check if a Paczkomat ID is valid by fetching point details
   * @param {string} paczkomatId - The Paczkomat ID to check
   * @returns {Promise<boolean>} True if valid, false otherwise
   */
  async isValidPaczkomatId(paczkomatId) {
    try {
      // First sanitize the ID 
      const sanitizedId = this.sanitizePaczkomatId(paczkomatId);
      
      // Try to fetch the Paczkomat details
      console.log(`Checking if Paczkomat ID '${sanitizedId}' is valid...`);
      
      const response = await axios.get(
        `${this.apiUrl}/points/${sanitizedId}`,
        { headers: this.getHeaders() }
      );
      
      if (response.status === 200) {
        console.log(`✅ Paczkomat ID '${sanitizedId}' is valid:`, {
          name: response.data.name,
          type: response.data.type,
          status: response.data.status
        });
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`❌ Invalid Paczkomat ID '${paczkomatId}':`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      return false;
    }
  }

  /**
   * Search for Paczkomat points by postal code to help diagnose ID issues
   * @param {string} postalCode - Postal code to search nearby (e.g. '00-001')
   * @returns {Promise<Array>} List of nearby Paczkomat points
   */
  async findPaczkomatsByPostalCode(postalCode) {
    try {
      console.log(`Searching for Paczkomat points near postal code: ${postalCode}`);
      
      const response = await axios.get(
        `${this.apiUrl}/points?type=parcel_locker&postal_code=${postalCode}`,
        { headers: this.getHeaders() }
      );
      
      if (response.data && response.data.items && response.data.items.length > 0) {
        const points = response.data.items.map(item => ({
          id: item.id, // This is the correct ID format
          name: item.name,
          address: `${item.address.line1}, ${item.address.line2 || ''}, ${item.address.post_code} ${item.address.city}`
        }));
        
        console.log(`Found ${points.length} Paczkomat points near ${postalCode}:`, points);
        return points;
      }
      
      console.log(`No Paczkomat points found near postal code: ${postalCode}`);
      return [];
    } catch (error) {
      console.error(`Error searching for Paczkomat points:`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      return [];
    }
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
   * Sanitize Paczkomat ID to ensure it's in the correct format
   * @param {string} paczkomatId - The raw Paczkomat ID from frontend
   * @returns {string} Sanitized Paczkomat ID
   */
  sanitizePaczkomatId(paczkomatId) {
    if (!paczkomatId) return '';
    
    // If the ID already includes PL_ prefix, normalize it
    let sanitized = paczkomatId.trim();
    
    // Some common patterns to fix
    if (sanitized.startsWith('PL_')) {
      // Remove PL_ prefix as InPost API might expect just the code
      sanitized = sanitized.substring(3);
    }
    
    // Log the sanitization
    console.log(`Sanitized Paczkomat ID: "${paczkomatId}" -> "${sanitized}"`);
    
    return sanitized;
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
    
    // Add company name if available
    if (recipient.companyName) {
      receiverData.company_name = recipient.companyName;
    }
    
    // Create the base payload
    const payload = {
      receiver: receiverData,
      service: isLockerDelivery ? 'inpost_locker_standard' : 'inpost_courier_standard',
      reference: orderNumber || 'FB-ORDER',
      // Use an object instead of array for parcels as per the example
      parcels: {
        template: "small"
      }
    };
    
    // Add insurance if available
    if (packageDetails.insurance && packageDetails.insurance.amount) {
      payload.insurance = {
        amount: parseFloat(packageDetails.insurance.amount),
        currency: packageDetails.insurance.currency || 'PLN'
      };
    }
    
    // Add COD (cash on delivery) if available
    if (packageDetails.cod && packageDetails.cod.amount) {
      payload.cod = {
        amount: parseFloat(packageDetails.cod.amount),
        currency: packageDetails.cod.currency || 'PLN'
      };
    }
    
    // For locker delivery, add custom attributes
    if (isLockerDelivery) {
      // Sanitize the Paczkomat ID to ensure it's in the correct format
      const sanitizedId = this.sanitizePaczkomatId(recipient.paczkomatId);
      
      payload.custom_attributes = {
        sending_method: "dispatch_order",
        target_point: sanitizedId
      };
      
      // Log the Paczkomat ID we're using
      console.log(`Using Paczkomat ID: ${sanitizedId} (original: ${recipient.paczkomatId})`);
    } else {
      // For courier delivery, add address
      payload.receiver.address = {
        street: recipient.address?.street || 'Nieznana',
        building_number: recipient.address?.buildingNumber || '1',
        city: recipient.address?.city || 'Warszawa',
        post_code: recipient.address?.postCode || '00-001',
        country_code: 'PL'
      };
      
      // For courier, add weight to parcels
      if (packageDetails.weight) {
        payload.parcels.weight = {
          amount: (packageDetails.weight || 1.0).toString(),
          unit: "kg"
        };
      }
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
      
      // If it's a Paczkomat delivery, verify the Paczkomat ID first
      if (orderData.recipient?.paczkomatId) {
        const sanitizedId = this.sanitizePaczkomatId(orderData.recipient.paczkomatId);
        
        // Check if the ID is valid
        try {
          const isValid = await this.isValidPaczkomatId(sanitizedId);
          if (!isValid) {
            console.warn(`⚠️ Warning: Paczkomat ID '${sanitizedId}' may be invalid. Proceeding anyway.`);
            
            // If the ID is possibly invalid, try to suggest some valid IDs
            if (orderData.recipient.address && orderData.recipient.address.postCode) {
              console.log(`Trying to find valid Paczkomat points near ${orderData.recipient.address.postCode}`);
              await this.findPaczkomatsByPostalCode(orderData.recipient.address.postCode);
            } else {
              // Use a default postal code to search for examples
              await this.findPaczkomatsByPostalCode('00-001');
            }
          }
        } catch (validationError) {
          console.error('Error validating Paczkomat ID:', validationError.message);
          // Continue with the request despite validation failure
        }
      }
      
      const payload = this.createShipmentPayload(orderData);
      
      // Log the request payload
      console.log(' INPOST API REQUEST:', {
        url: `${this.apiUrl}/organizations/${this.organizationId}/shipments`,
        method: 'POST',
        orderNumber: orderData.orderNumber,
        payload: JSON.stringify(payload),
        hasToken: !!this.token,
        tokenLength: this.token ? this.token.length : 0,
        organizationId: this.organizationId
      });
      
      try {
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
      } catch (firstError) {
        console.log('First attempt failed, trying minimal payload as fallback');
        
        // Try the minimal payload as a last resort
        return await this.createShipmentWithMinimalPayload(orderData);
      }
    } catch (error) {
      // Log detailed error information
      console.error('❌ INPOST API ERROR:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
      
      // Log the validation details specifically
      if (error.response && error.response.data) {
        console.error('Full error response data:', JSON.stringify(error.response.data, null, 2));
        
        if (error.response.data.details) {
          if (typeof error.response.data.details === 'object') {
            console.error('Validation details:', JSON.stringify(error.response.data.details, null, 2));
          } else {
            console.error('Validation details (raw):', error.response.data.details);
          }
        }
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

  /**
   * Create a shipment with minimal payload for InPost ShipX API
   * @param {Object} orderData - Order data from frontend
   * @returns {Promise<Object>} ShipX API response
   */
  async createShipmentWithMinimalPayload(orderData) {
    try {
      const { recipient, orderNumber } = orderData;
      
      // Sanitize the Paczkomat ID
      const sanitizedId = this.sanitizePaczkomatId(recipient.paczkomatId);
      
      // Create a minimal payload based exactly on the successful example
      const minimalPayload = {
        receiver: {
          first_name: recipient.firstName || 'Klient',
          last_name: recipient.lastName || 'Sklepu',
          email: recipient.email || 'klient@familybalance.pl',
          phone: (recipient.phone || '500000000').toString().replace(/\s+/g, '')
        },
        parcels: {
          template: "small"
        },
        custom_attributes: {
          sending_method: "dispatch_order",
          target_point: sanitizedId
        },
        service: "inpost_locker_standard",
        reference: orderNumber || 'FB-ORDER'
      };
      
      console.log('🚚 TRYING MINIMAL PAYLOAD:', JSON.stringify(minimalPayload, null, 2));
      
      const response = await axios.post(
        `${this.apiUrl}/organizations/${this.organizationId}/shipments`, 
        minimalPayload, 
        { headers: this.getHeaders() }
      );
      
      console.log('✅ MINIMAL PAYLOAD SUCCESS:', {
        status: response.status,
        data: JSON.stringify(response.data, null, 2)
      });
      
      return response.data;
    } catch (error) {
      console.error('❌ MINIMAL PAYLOAD ERROR:', {
        message: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }
}

module.exports = new InPostService(); 