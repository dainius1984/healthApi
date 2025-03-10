const InPostService = require('./InPostService');
const AppwriteService = require('./AppwriteService');
const { Query } = require('node-appwrite');

/**
 * Controller for handling shipping-related operations
 */
class ShippingController {
  /**
   * Create a shipment with InPost ShipX API
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async createShipment(req, res) {
    try {
      const { orderNumber, recipient, packageDetails } = req.body;
      
      if (!orderNumber || !recipient || !packageDetails) {
        return res.status(400).json({
          error: 'Missing required data',
          details: 'orderNumber, recipient, and packageDetails are required'
        });
      }
      
      // Validate recipient data
      if (!recipient.name || !recipient.email || !recipient.phone) {
        return res.status(400).json({
          error: 'Missing recipient data',
          details: 'Recipient name, email, and phone are required'
        });
      }
      
      // Validate package details
      if (!packageDetails.size) {
        return res.status(400).json({
          error: 'Missing package details',
          details: 'Package size is required (A, B, or C)'
        });
      }
      
      // Validate delivery method
      if (!recipient.paczkomatId && !recipient.address) {
        return res.status(400).json({
          error: 'Missing delivery information',
          details: 'Either paczkomatId or address is required'
        });
      }
      
      // If address is provided, validate it
      if (recipient.address && (!recipient.address.street || !recipient.address.city || !recipient.address.postCode)) {
        return res.status(400).json({
          error: 'Invalid address',
          details: 'Address must include street, city, and postCode'
        });
      }
      
      // Create shipment with InPost
      const shipmentResponse = await InPostService.createShipment({
        orderNumber,
        recipient,
        packageDetails
      });
      
      // Update order in Appwrite with shipping information
      try {
        // Find the order document first
        const documents = await AppwriteService.databases.listDocuments(
          process.env.APPWRITE_DATABASE_ID,
          process.env.APPWRITE_ORDERS_COLLECTION_ID,
          [Query.equal('orderNumber', orderNumber)]
        );
        
        if (documents?.documents?.length > 0) {
          const document = documents.documents[0];
          
          // Update the document with shipping information
          await AppwriteService.databases.updateDocument(
            process.env.APPWRITE_DATABASE_ID,
            process.env.APPWRITE_ORDERS_COLLECTION_ID,
            document.$id,
            {
              shippingStatus: 'created',
              trackingNumber: shipmentResponse.tracking_number,
              shippingLabel: shipmentResponse.href,
              shippingCreatedAt: new Date().toISOString()
            }
          );
          
          console.log('Order updated with shipping information:', orderNumber);
        } else {
          console.warn('Order not found for updating shipping info:', orderNumber);
        }
      } catch (error) {
        console.warn('Failed to update order with shipping info:', error.message);
        // Continue even if update fails - we'll return the shipping info to the frontend
      }
      
      // Return success response with tracking info
      return res.status(201).json({
        success: true,
        message: 'Shipment created successfully',
        data: {
          trackingNumber: shipmentResponse.tracking_number,
          labelUrl: shipmentResponse.href,
          shipmentId: shipmentResponse.id,
          status: shipmentResponse.status
        }
      });
      
    } catch (error) {
      console.error('Shipment creation error:', error);
      
      // Handle specific API errors
      if (error.response) {
        const statusCode = error.response.status;
        const errorData = error.response.data;
        
        return res.status(statusCode).json({
          error: 'InPost API error',
          details: errorData.message || 'Error communicating with InPost API',
          code: errorData.error_code || statusCode
        });
      }
      
      // Handle general errors
      return res.status(500).json({
        error: 'Shipment creation failed',
        details: process.env.NODE_ENV === 'production' 
          ? 'An error occurred while processing the shipment' 
          : error.message
      });
    }
  }
}

module.exports = new ShippingController(); 