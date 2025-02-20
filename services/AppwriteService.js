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

 async storeOrder(orderData) {
   try {
     console.log('AppwriteService - Attempting to store order:', {
       orderNumber: orderData.orderNumber,
       userId: orderData.userId
     });
     
     // Dostosowanie struktury danych do schematu kolekcji
     const documentData = {
       orderNumber: orderData.orderNumber,
       userId: orderData.userId,
       createdAt: new Date().toISOString(),
       total: orderData.total.toString(),
       items: orderData.items,
       subtotal: orderData.subtotal?.toString() || '0',
       discountAmount: orderData.discountAmount?.toString() || '0',
       shippingCost: orderData.shippingDetails?.cost?.toString() || '0',
       firstName: orderData.customerData?.Imie || '',
       lastName: orderData.customerData?.Nazwisko || '',
       email: orderData.customerData?.Email || '',
       phone: orderData.customerData?.Telefon || '',
       shipping: orderData.shippingDetails?.method || 'DPD',
       discountApplied: !!orderData.discountApplied,
       payuOrderId: orderData.payuOrderId || '',
       status: orderData.status || 'pending'
     };

     const document = await this.databases.createDocument(
       process.env.APPWRITE_DATABASE_ID,
       process.env.APPWRITE_ORDERS_COLLECTION_ID,
       ID.unique(),
       documentData
     );
     
     console.log('AppwriteService - Order stored successfully:', document.$id);
     return document;
   } catch (error) {
     console.error('AppwriteService - Store order error:', error);
     throw error;
   }
 }

 // In AppwriteService.js - update the updateOrderStatus method:

async updateOrderStatus(orderId, status) {
  try {
    console.log('AppwriteService - Attempting to update order status:', {
      payuOrderId: orderId,
      newStatus: status,
      originalStatus: status
    });

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

    console.log('AppwriteService - Mapped status:', {
      original: status,
      mapped: mappedStatus
    });

    // Debug log the query
    console.log('AppwriteService - Searching for document with payuOrderId:', orderId);

    const documents = await this.databases.listDocuments(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_ORDERS_COLLECTION_ID,
      [Query.equal('payuOrderId', orderId)]
    );

    console.log('AppwriteService - Search results:', {
      found: documents?.documents?.length > 0,
      documentsCount: documents?.documents?.length,
      firstDocId: documents?.documents?.[0]?.$id
    });

    if (documents?.documents?.length > 0) {
      const document = documents.documents[0];

      console.log('AppwriteService - Found document:', {
        id: document.$id,
        orderNumber: document.orderNumber,
        currentStatus: document.status,
        payuOrderId: document.payuOrderId
      });
      
      const updateData = {
        status: mappedStatus,
        lastUpdated: new Date().toISOString(),
        statusUpdatedAt: new Date().toISOString()
      };

      console.log('AppwriteService - Updating document with data:', updateData);

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
    
    console.log('AppwriteService - No order found with payuOrderId:', orderId);
    return false;
  } catch (error) {
    console.error('AppwriteService - Update status error:', {
      error: error.message,
      stack: error.stack,
      orderId,
      status
    });
    throw error;
  }
}
}

module.exports = new AppwriteService();