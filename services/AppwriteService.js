// AppwriteService.js - Updated version

const { Client, Databases, Query, ID } = require('node-appwrite');

class AppwriteService {
  constructor() {
    this.client = new Client()
      .setEndpoint('https://cloud.appwrite.io/v1')
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);

    this.databases = new Databases(this.client);
  }

  async storeOrder(orderData) {
    try {
      console.log('AppwriteService - Attempting to store order:', {
        orderNumber: orderData.orderNumber,
        userId: orderData.userId,
        items: orderData.items, // Log items for debugging
        shipping: orderData.shippingDetails
      });
      
      // Parse items if they're in string format
      let parsedItems = orderData.items;
      if (typeof orderData.items === 'string') {
        try {
          parsedItems = JSON.parse(orderData.items);
        } catch (e) {
          console.warn('Failed to parse items JSON, using as is:', e);
        }
      }

      // Ensure shipping cost is properly formatted
      const shippingCost = orderData.shippingDetails?.cost || '15.00';

      // Prepare document data with all required fields
      const documentData = {
        orderNumber: orderData.orderNumber,
        userId: orderData.userId,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        total: orderData.total.toString(),
        items: parsedItems, // Use parsed items
        subtotal: orderData.subtotal?.toString() || '0',
        discountAmount: orderData.discountAmount?.toString() || '0',
        shippingCost: shippingCost.toString(),
        firstName: orderData.customerData?.Imie || '',
        lastName: orderData.customerData?.Nazwisko || '',
        email: orderData.customerData?.Email || '',
        phone: orderData.customerData?.Telefon || '',
        shipping: orderData.shippingDetails?.method || 'DPD',
        address: {
          street: orderData.customerData?.Ulica || '',
          city: orderData.customerData?.Miasto || '',
          postalCode: orderData.customerData?.['Kod pocztowy'] || '',
        },
        discountApplied: !!orderData.discountApplied,
        payuOrderId: orderData.payuOrderId || '',
        status: orderData.status || 'pending',
        notes: orderData.customerData?.Uwagi || ''
      };

      console.log('AppwriteService - Prepared document data:', {
        orderNumber: documentData.orderNumber,
        items: documentData.items,
        shipping: documentData.shipping,
        shippingCost: documentData.shippingCost
      });

      const document = await this.databases.createDocument(
        process.env.APPWRITE_DATABASE_ID,
        process.env.APPWRITE_ORDERS_COLLECTION_ID,
        ID.unique(),
        documentData
      );
      
      console.log('AppwriteService - Order stored successfully:', {
        documentId: document.$id,
        orderNumber: document.orderNumber,
        status: document.status
      });

      return document;
    } catch (error) {
      console.error('AppwriteService - Store order error:', error);
      throw error;
    }
  }

  // In AppwriteService.js, update the updateOrderStatus method:

async updateOrderStatus(orderId, status) {
  try {
    console.log('AppwriteService - Attempting to update order status:', {
      orderId,
      newStatus: status
    });

    // Updated status mapping to match PayU's exact casing
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

    // Find order by PayU orderId in the external ID field
    const documents = await this.databases.listDocuments(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_ORDERS_COLLECTION_ID,
      [Query.equal('orderNumber', orderId)]  // Use orderNumber instead of payuOrderId
    );

    if (documents?.documents?.length > 0) {
      const document = documents.documents[0];
      
      // Update document with new status and timestamp
      const updateData = {
        status: mappedStatus,
        lastUpdated: new Date().toISOString()
      };

      console.log('AppwriteService - Updating document:', {
        documentId: document.$id,
        orderNumber: document.orderNumber,
        currentStatus: document.status,
        newStatus: mappedStatus
      });

      await this.databases.updateDocument(
        process.env.APPWRITE_DATABASE_ID,
        process.env.APPWRITE_ORDERS_COLLECTION_ID,
        document.$id,
        updateData
      );
      
      console.log('AppwriteService - Order status updated successfully:', {
        orderId,
        orderNumber: document.orderNumber,
        oldStatus: document.status,
        newStatus: mappedStatus
      });
      return true;
    }
    
    console.log('AppwriteService - No order found with orderId:', orderId);
    return false;
  } catch (error) {
    console.error('AppwriteService - Update status error:', error);
    throw error;
  }
}
}

module.exports = new AppwriteService();