// services/PayUWebhookHandler.js
const OrderService = require('./OrderService');
const { securityService } = require('./PayUService');

class PayUWebhookHandler {
  async handleNotification(req) {
    try {
      console.log('Received PayU notification:', {
        body: req.body,
        signature: req.headers['openpayu-signature']
      });

      // Extract signature from header
      const signature = req.headers['openpayu-signature']?.match(/signature=(.*?);/)?.[1];
      if (!signature) {
        throw new Error('Missing PayU signature');
      }

      // Validate webhook signature
      const isValid = securityService.validateWebhookSignature(req.body, signature);
      if (!isValid) {
        throw new Error('Invalid PayU signature');
      }

      // Extract order details
      const order = req.body.order;
      if (!order?.orderId || !order?.status || !order?.extOrderId) {
        throw new Error('Invalid order data in notification');
      }

      console.log('Processing PayU notification:', {
        orderId: order.orderId,
        status: order.status,
        extOrderId: order.extOrderId,
        notificationTime: new Date().toISOString()
      });

      // Map PayU status to our system status
      const statusMapping = {
        COMPLETED: 'PAID',
        CANCELED: 'CANCELLED',
        PENDING: 'PENDING',
        WAITING_FOR_CONFIRMATION: 'PENDING',
        REJECTED: 'REJECTED'
      };

      const mappedStatus = statusMapping[order.status] || order.status;

      console.log('Status mapping:', {
        originalStatus: order.status,
        mappedStatus: mappedStatus,
        orderId: order.orderId,
        extOrderId: order.extOrderId
      });

      // Call OrderService to handle the update
      // It will automatically route to either Appwrite or Sheets based on where the order exists
      await OrderService.updateOrderStatus(
        order.orderId,    // PayU order ID
        mappedStatus,     // Mapped status
        order.extOrderId  // Our order number
      );

      console.log('Successfully processed PayU notification:', {
        orderId: order.orderId,
        extOrderId: order.extOrderId,
        newStatus: mappedStatus,
        processingTime: new Date().toISOString()
      });

      return {
        success: true,
        message: 'Notification processed successfully',
        orderId: order.orderId,
        extOrderId: order.extOrderId,
        status: mappedStatus
      };

    } catch (error) {
      console.error('PayU webhook processing error:', {
        error: error.message,
        stack: error.stack,
        time: new Date().toISOString()
      });
      
      // Rethrow the error after logging
      throw error;
    }
  }
}

module.exports = new PayUWebhookHandler();