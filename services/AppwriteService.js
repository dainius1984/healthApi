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

 async updateOrderStatus(orderId, status) {
  try {
    console.log('AppwriteService - Attempting to update order status:', {
      payuOrderId: orderId,
      newStatus: status
    });

    // Map PayU status to our system status
    const statusMapping = {
      'PAID': 'opłacone',
      'CANCELLED': 'anulowane',
      'PENDING': 'oczekujące',
      'REJECTED': 'odrzucone'
    };

    const mappedStatus = statusMapping[status] || status;

    const documents = await this.databases.listDocuments(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_ORDERS_COLLECTION_ID,
      [
        Query.equal('payuOrderId', orderId)
      ]
    );

    if (documents?.documents?.length > 0) {
      const document = documents.documents[0];
      
      await this.databases.updateDocument(
        process.env.APPWRITE_DATABASE_ID,
        process.env.APPWRITE_ORDERS_COLLECTION_ID,
        document.$id,
        {
          status: mappedStatus,
          lastUpdated: new Date().toISOString()
        }
      );
      
      console.log('AppwriteService - Order status updated successfully:', {
        orderId,
        oldStatus: document.status,
        newStatus: mappedStatus
      });
      return true;
    }
    
    console.log('AppwriteService - No order found with payuOrderId:', orderId);
    return false;
  } catch (error) {
    console.error('AppwriteService - Update status error:', error);
    throw error;
  }
}
}

module.exports = new AppwriteService();