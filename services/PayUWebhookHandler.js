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
        extOrderId: order.extOrderId
      });

      // Map PayU status to your internal status
      const statusMapping = {
        COMPLETED: 'PAID',
        CANCELED: 'CANCELLED',
        PENDING: 'PENDING',
        WAITING_FOR_CONFIRMATION: 'PENDING',
        REJECTED: 'REJECTED'
      };

      const mappedStatus = statusMapping[order.status] || order.status;

      // Pass both orderId and extOrderId to updateOrderStatus
      await OrderService.updateOrderStatus(order.orderId, mappedStatus, order.extOrderId);

      console.log('Successfully processed PayU notification:', {
        orderId: order.orderId,
        extOrderId: order.extOrderId,
        newStatus: mappedStatus
      });

      return { success: true };
    } catch (error) {
      console.error('PayU webhook processing error:', error);
      throw error;
    }
  }
}

module.exports = new PayUWebhookHandler();