const express = require('express');
const ShippingController = require('../services/ShippingController');
const InPostService = require('../services/InPostService');
const axios = require('axios');

const router = express.Router();

/**
 * @route POST /api/shipping/create
 * @desc Create a shipment with InPost ShipX API
 * @access Private
 */
router.post('/create', ShippingController.createShipment);

/**
 * @route POST /api/shipping/inpost/create
 * @desc Create a shipment with InPost ShipX API
 * @access Private
 */
router.post('/inpost/create', ShippingController.createShipment);

/**
 * @route GET /api/shipping/check-paczkomat/:id
 * @desc Check if a Paczkomat ID is valid
 * @access Public
 */
router.get('/check-paczkomat/:id', async (req, res) => {
  try {
    const paczkomatId = req.params.id;
    
    if (!paczkomatId) {
      return res.status(400).json({
        success: false, 
        message: 'Paczkomat ID is required'
      });
    }
    
    // Process the ID
    const sanitizedId = InPostService.sanitizePaczkomatId(paczkomatId);
    console.log(`Checking Paczkomat ID: ${paczkomatId} -> ${sanitizedId}`);
    
    // Check if it's valid
    const isValid = await InPostService.isValidPaczkomatId(sanitizedId);
    
    if (isValid) {
      return res.json({
        success: true,
        message: `Paczkomat ID '${sanitizedId}' is valid`,
        original: paczkomatId,
        sanitized: sanitizedId
      });
    } else {
      // Try to find some nearby points as examples
      const nearbyPoints = await InPostService.findPaczkomatsByPostalCode('00-001');
      
      return res.status(404).json({
        success: false,
        message: `Paczkomat ID '${sanitizedId}' is not valid`,
        original: paczkomatId,
        sanitized: sanitizedId,
        suggestions: nearbyPoints.slice(0, 5) // Provide up to 5 suggestions
      });
    }
  } catch (error) {
    console.error('Error checking Paczkomat ID:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking Paczkomat ID',
      error: error.message
    });
  }
});

/**
 * @route POST /api/shipping/test-exact-payload
 * @desc Test creating a shipment with the exact payload format from InPost example
 * @access Public
 */
router.post('/test-exact-payload', async (req, res) => {
  try {
    // Get the Paczkomat ID from request or use a default test value
    const { paczkomatId, orderNumber } = req.body;
    
    if (!paczkomatId) {
      return res.status(400).json({
        success: false,
        message: 'Paczkomat ID is required in request body'
      });
    }
    
    // Clean the Paczkomat ID
    const sanitizedId = InPostService.sanitizePaczkomatId(paczkomatId);
    
    // Create an exact payload matching the example format
    const exactPayload = {
      receiver: {
        company_name: "Company name",
        first_name: "Jan",
        last_name: "Kowalski",
        email: "test@inpost.pl",
        phone: "111222333"
      },
      parcels: {
        template: "small"
      },
      insurance: {
        amount: 25,
        currency: "PLN"
      },
      cod: {
        amount: 12.50,
        currency: "PLN"
      },
      custom_attributes: {
        sending_method: "dispatch_order",
        target_point: sanitizedId
      },
      service: "inpost_locker_standard",
      reference: orderNumber || "Test-" + Date.now()
    };
    
    console.log('🧪 Testing with exact payload format:', JSON.stringify(exactPayload, null, 2));
    
    // Make the API request with the exact payload
    try {
      const response = await axios.post(
        `${InPostService.apiUrl}/organizations/${InPostService.organizationId}/shipments`,
        exactPayload,
        { headers: InPostService.getHeaders() }
      );
      
      console.log('✅ EXACT PAYLOAD TEST SUCCESS:', {
        status: response.status,
        data: JSON.stringify(response.data, null, 2)
      });
      
      return res.status(201).json({
        success: true,
        message: 'Shipment created successfully with exact payload',
        data: {
          trackingNumber: response.data.tracking_number,
          labelUrl: response.data.href,
          shipmentId: response.data.id,
          status: response.data.status
        }
      });
    } catch (error) {
      console.error('❌ EXACT PAYLOAD TEST ERROR:', {
        message: error.message,
        response: error.response?.data
      });
      
      return res.status(error.response?.status || 500).json({
        success: false,
        message: 'Failed to create shipment with exact payload',
        error: error.response?.data || error.message
      });
    }
  } catch (error) {
    console.error('Error in test-exact-payload route:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router; 