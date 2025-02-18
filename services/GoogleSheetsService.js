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
      private_key: formattedKey
    });

    await this.doc.loadInfo();
  }

  async addRow(data) {
    try {
      await this.init();
      const sheet = this.doc.sheetsByIndex[0];
      
      console.log('Adding row to sheets:', {
        orderNumber: data['Numer zamowienia'],
        status: data['Status'],
        payuId: data['PayU ID'] // Log PayU ID if present
      });
  
      const addedRow = await sheet.addRow(data);
      console.log('Successfully added row to sheet');
      return addedRow;
    } catch (error) {
      console.error('Sheet request error:', error);
      throw new Error(`Failed to process sheet request: ${error.message}`);
    }
  }

  async updateOrderStatus(orderId, status, extOrderId) {
    try {
      await this.init();
      const sheet = this.doc.sheetsByIndex[0];
      const rows = await sheet.getRows();
      
      console.log('Attempting to update order status:', {
        payuOrderId: orderId,
        status: status,
        orderNumber: extOrderId,
        totalRows: rows.length
      });
      
      // Find order row by matching the order number (extOrderId)
      const orderRow = rows.find(row => {
        // Clean up the order number from the sheet (remove quotes and equals sign)
        const sheetOrderNumber = row['Numer zamowienia']?.replace(/[="]/g, '');
        const matches = sheetOrderNumber === extOrderId;
        
        console.log('Comparing row:', {
          sheetOrderNumber,
          orderToFind: extOrderId,
          matches
        });
        
        return matches;
      });
  
      if (orderRow) {
        // Map PayU status to sheet status
        const mappedStatus = 
          status === 'PAID' ? 'Opłacone' :
          status === 'CANCELLED' ? 'Anulowane' :
          status === 'PENDING' ? 'Oczekujące' :
          status === 'REJECTED' ? 'Odrzucone' :
          status; // fallback to original status if no mapping
  
        // Update the status
        orderRow['Status'] = mappedStatus;
        await orderRow.save();
        
        console.log('Successfully updated order status:', {
          orderNumber: extOrderId,
          oldStatus: orderRow['Status'],
          newStatus: mappedStatus
        });
      } else {
        console.warn('Order not found in sheet:', {
          searchedOrderNumber: extOrderId,
          payuOrderId: orderId
        });
      }
    } catch (error) {
      console.error('Failed to update order status:', {
        error: error.message,
        orderId,
        extOrderId,
        status
      });
      throw new Error(`Failed to update order status: ${error.message}`);
    }
  }
}

module.exports = new GoogleSheetsService();