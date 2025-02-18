// services/PayUWebhookHandler.js
const OrderService = require('./OrderService');
const { securityService } = require('./PayUService');

class PayUWebhookHandler {
 // In PayUWebhookHandler.js, update the handleNotification method:

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

    // Updated status mapping to match sheet statuses
    const statusMapping = {
      COMPLETED: 'PAID',
      CANCELED: 'CANCELLED',
      PENDING: 'PENDING',
      WAITING_FOR_CONFIRMATION: 'PENDING',
      REJECTED: 'REJECTED'
    };

    const mappedStatus = statusMapping[order.status] || order.status;

    // Update order status with improved logging
    console.log('Updating order status:', {
      payuOrderId: order.orderId,
      extOrderId: order.extOrderId,
      originalStatus: order.status,
      mappedStatus: mappedStatus
    });

    await OrderService.updateOrderStatus(order.orderId, mappedStatus, order.extOrderId);

    console.log('Successfully processed PayU notification:', {
      orderId: order.orderId,
      extOrderId: order.extOrderId,
      newStatus: mappedStatus
    });

    return { success: true };
  } catch (error) {
    console.error('PayU webhook processing error:', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}
}

module.exports = new PayUWebhookHandler();