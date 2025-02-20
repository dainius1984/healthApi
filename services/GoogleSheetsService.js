const { GoogleSpreadsheet } = require('google-spreadsheet');

class GoogleSheetsService {
  constructor() {
    this.doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
  }

  async init() {
    const formattedKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!formattedKey || !process.env.GOOGLE_CLIENT_EMAIL) {
      throw new Error('Google Sheets credentials are missing');
    }

    await this.doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: formattedKey,
    });

    await this.doc.loadInfo();
  }

  async addRow(data) {
    try {
      await this.init();
      const sheet = this.doc.sheetsByIndex[0];
      
      console.log('Adding row to sheets:', {
        orderNumber: data['Numer zamowienia'],
        date: data['Data'],
        status: data['Status'],
        discount: data['Czy naliczono rabat'],
        total: data['Suma']
      });
  
      const formattedData = {
        ...data,
        'Numer zamowienia': `="${data['Numer zamowienia']}"`,
        'Data': `="${data['Data']}"`,
        'Produkty': data['Produkty']
      };
  
      const addedRow = await sheet.addRow(formattedData);
      console.log('Successfully added row to sheet:', {
        orderNumber: data['Numer zamowienia'],
        date: data['Data'],
        total: data['Suma']
      });
      return addedRow;
    } catch (error) {
      console.error('Sheet request error:', error);
      throw new Error(`Failed to process sheet request: ${error.message}`);
    }
  }
  
// In AppwriteService.js, update just the updateOrderStatus method:

async updateOrderStatus(orderId, status) {
  try {
    console.log('AppwriteService - Attempting to update order status:', {
      payuOrderId: orderId,
      newStatus: status
    });

    // Match status case with store method
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

    const documents = await this.databases.listDocuments(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_ORDERS_COLLECTION_ID,
      [Query.equal('payuOrderId', orderId)]
    );

    if (documents?.documents?.length > 0) {
      const document = documents.documents[0];
      
      const updateData = {
        status: mappedStatus,
        lastUpdated: new Date().toISOString(),
        statusUpdatedAt: new Date().toISOString()
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

module.exports = new GoogleSheetsService();