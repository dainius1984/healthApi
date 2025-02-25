// services/AppwriteService.js
const { Client, Databases, Query, ID } = require('node-appwrite');

class AppwriteService {
  constructor() {
    this.client = new Client()
      .setEndpoint('https://cloud.appwrite.io/v1')
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);

    this.databases = new Databases(this.client);
  }

  _formatItemsToJsonString(items) {
    if (!Array.isArray(items)) return '[]';
    const formattedItems = items.map(item => ({
      id: item.id || item.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
      n: item.name || item.n,
      p: parseFloat(item.price || item.p),
      q: parseInt(item.quantity || item.q),
      image: item.image || `/img/products/${item.id || item.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.png`
    }));
    return JSON.stringify(formattedItems);
  }

  async storeOrder(orderData) {
    try {
      console.log('AppwriteService - Storing order:', orderData.orderNumber);
      
      // Log shipping information explicitly for debugging
      const shippingMethod = orderData.shippingDetails?.method || 'DPD';
      console.log('AppwriteService - Using shipping method:', shippingMethod);
      
      const documentData = {
        orderNumber: orderData.orderNumber,
        userId: orderData.userId,
        createdAt: new Date().toISOString(),
        total: orderData.total.toString(),
        items: this._formatItemsToJsonString(orderData.items),
        subtotal: orderData.subtotal?.toString() || '0',
        discountAmount: orderData.discountAmount?.toString() || '0',
        shippingCost: orderData.shippingDetails?.cost?.toString() || '0',
        firstName: orderData.customerData?.Imie || '',
        lastName: orderData.customerData?.Nazwisko || '',
        email: orderData.customerData?.Email || '',
        phone: orderData.customerData?.Telefon || '',
        shipping: shippingMethod, // Use the explicit shipping method
        discountApplied: !!orderData.discountApplied,
        payuOrderId: orderData.payuOrderId || '',
        status: orderData.status || 'Oczekujące'
      };

      const document = await this.databases.createDocument(
        process.env.APPWRITE_DATABASE_ID,
        process.env.APPWRITE_ORDERS_COLLECTION_ID,
        ID.unique(),
        documentData
      );
      
      console.log('AppwriteService - Order stored successfully with shipping:', shippingMethod);
      return document;
    } catch (error) {
      console.error('AppwriteService - Store order error:', error);
      throw error;
    }
  }

  async updateOrderStatus(orderId, status) {
    try {
      console.log('AppwriteService - Updating status for order:', orderId);

      const statusMapping = {
        'PAID': 'Opłacone',
        'COMPLETED': 'Opłacone',
        'CANCELED': 'Anulowane',
        'CANCELLED': 'Anulowane',
        'PENDING': 'Oczekujące',
        'WAITING': 'Oczekujące',
        'REJECTED': 'Odrzucone'
      };

      const mappedStatus = statusMapping[status.toUpperCase()] || status;

      // Try to find the order by orderNumber first
      let documents = await this.databases.listDocuments(
        process.env.APPWRITE_DATABASE_ID,
        process.env.APPWRITE_ORDERS_COLLECTION_ID,
        [Query.equal('orderNumber', orderId)]
      );

      // If not found, try payuOrderId
      if (!documents?.documents?.length) {
        documents = await this.databases.listDocuments(
          process.env.APPWRITE_DATABASE_ID,
          process.env.APPWRITE_ORDERS_COLLECTION_ID,
          [Query.equal('payuOrderId', orderId)]
        );
      }

      if (documents?.documents?.length > 0) {
        const document = documents.documents[0];
        
        await this.databases.updateDocument(
          process.env.APPWRITE_DATABASE_ID,
          process.env.APPWRITE_ORDERS_COLLECTION_ID,
          document.$id,
          {
            status: mappedStatus,
          }
        );
        
        console.log('AppwriteService - Status updated:', {
          orderNumber: document.orderNumber,
          shipping: document.shipping, // Log shipping for debugging
          newStatus: mappedStatus
        });
        return true;
      }
      
      console.log('AppwriteService - Order not found:', orderId);
      return false;
    } catch (error) {
      console.error('AppwriteService - Update status error:', error);
      throw error;
    }
  }
}

module.exports = new AppwriteService();