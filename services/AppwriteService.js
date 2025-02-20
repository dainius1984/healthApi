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

// In AppwriteService.js

async storeOrder(orderData) {
  try {
    console.log('AppwriteService - Attempting to store order:', {
      orderNumber: orderData.orderNumber,
      payuOrderId: orderData.payuOrderId,
      payuExtOrderId: orderData.payuExtOrderId,
      userId: orderData.userId
    });
    
    // Prepare document data
    const documentData = {
      orderNumber: orderData.orderNumber,
      payuOrderId: orderData.payuOrderId,
      payuExtOrderId: orderData.payuExtOrderId,
      userId: orderData.userId,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      status: orderData.status,
      total: orderData.total.toString(),
      items: Array.isArray(orderData.items) ? orderData.items : [],
      subtotal: orderData.subtotal?.toString() || '0',
      discountAmount: orderData.discountAmount?.toString() || '0',
      shippingCost: orderData.shippingDetails?.cost || '15.00',
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
      notes: orderData.customerData?.Uwagi || ''
    };

    const document = await this.databases.createDocument(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_ORDERS_COLLECTION_ID,
      ID.unique(),
      documentData
    );
    
    console.log('AppwriteService - Order stored successfully:', {
      documentId: document.$id,
      orderNumber: document.orderNumber,
      payuOrderId: document.payuOrderId,
      status: document.status
    });

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

    // Find order by PayU orderId
    const documents = await this.databases.listDocuments(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_ORDERS_COLLECTION_ID,
      [Query.equal('payuOrderId', orderId)]  // Search by PayU's internal ID
    );

    if (documents?.documents?.length > 0) {
      const document = documents.documents[0];
      
      const updateData = {
        status: mappedStatus,
        lastUpdated: new Date().toISOString()
      };

      console.log('AppwriteService - Updating document:', {
        documentId: document.$id,
        payuOrderId: orderId,
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
    
    console.log('AppwriteService - No order found with payuOrderId:', orderId);
    return false;
  } catch (error) {
    console.error('AppwriteService - Update status error:', error);
    throw error;
  }
}
}

module.exports = new AppwriteService();