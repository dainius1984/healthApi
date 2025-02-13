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
        status: data['Status']
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
      
      // For completed status, look for order by extOrderId
      const isCompleted = status === 'COMPLETED';
      console.log('Looking for order:', {
        status,
        orderToFind: isCompleted ? extOrderId : orderId,
        searchType: isCompleted ? 'orderNumber' : 'payuId',
        totalRows: rows.length
      });
      
      const orderRow = rows.find(row => {
        // Remove quotes and equals sign from sheet order number
        const sheetOrderNumber = row['Numer zamowienia']?.replace(/[="]/g, '');
        const matches = status === 'COMPLETED' && sheetOrderNumber === extOrderId;
        
        console.log('Comparing row:', {
          sheetOrderNumber,
          searchingFor: isCompleted ? extOrderId : orderId,
          matches
        });
        
        return matches;
      });

      if (orderRow) {
        const mappedStatus = 
          status === 'COMPLETED' ? 'Opłacone' :
          status === 'CANCELED' ? 'Anulowane' :
          status === 'PENDING' ? 'Oczekujące' : status;

        orderRow['Status'] = mappedStatus;
        await orderRow.save();
        console.log(`Updated order ${isCompleted ? extOrderId : orderId} status to ${mappedStatus}`);
      } else {
        console.warn(`Order not found in sheet. Searched by ${isCompleted ? 'orderNumber' : 'payuId'}:`, 
          isCompleted ? extOrderId : orderId);
      }
    } catch (error) {
      console.error('Update order status error:', error);
      throw new Error(`Failed to update order status: ${error.message}`);
    }
  }
}

module.exports = new GoogleSheetsService();