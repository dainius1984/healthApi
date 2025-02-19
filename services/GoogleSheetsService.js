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
      
      // Clean the data
      const cleanedData = {
        ...data,
        'PayU ID': `="${data['PayU ID'] || ''}"`.replace(/^"="/, '="'), // Fix double quotes
        'Numer zamowienia': `="${data['Numer zamowienia'] || ''}"`.replace(/^"="/, '="'),
      };
      
      console.log('Adding row to sheets:', {
        orderNumber: cleanedData['Numer zamowienia'],
        status: cleanedData['Status'],
        payuId: cleanedData['PayU ID'],
      });
  
      const addedRow = await sheet.addRow(cleanedData);
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
        totalRows: rows.length,
      });
      
      const orderRow = rows.find(row => {
        const sheetOrderNumber = row['Numer zamowienia']?.replace(/[="]/g, '');
        const matches = sheetOrderNumber === extOrderId;
        
        console.log('Comparing row:', {
          sheetOrderNumber,
          orderToFind: extOrderId,
          matches,
        });
        
        return matches;
      });
  
      if (orderRow) {
        const mappedStatus = 
          status === 'PAID' ? 'Opłacone' :
          status === 'CANCELLED' ? 'Anulowane' :
          status === 'PENDING' ? 'Oczekujące' :
          status === 'REJECTED' ? 'Odrzucone' :
          status;
  
        orderRow['Status'] = mappedStatus;
        await orderRow.save();
        
        console.log('Successfully updated order status:', {
          orderNumber: extOrderId,
          oldStatus: orderRow['Status'],
          newStatus: mappedStatus,
        });
      } else {
        console.warn('Order not found in sheet:', {
          searchedOrderNumber: extOrderId,
          payuOrderId: orderId,
        });
      }
    } catch (error) {
      console.error('Failed to update order status:', {
        error: error.message,
        orderId,
        extOrderId,
        status,
      });
      throw new Error(`Failed to update order status: ${error.message}`);
    }
  }
}

module.exports = new GoogleSheetsService();