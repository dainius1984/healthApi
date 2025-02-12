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
      
      // Debug log before adding
      console.log('Adding row to sheets with PayU OrderId:', {
        payuOrderId: data['PayU OrderId'],
        orderNumber: data['Numer zamowienia']
      });

      const addedRow = await sheet.addRow(data);
      console.log('Successfully added row to sheet');
      return addedRow;
    } catch (error) {
      console.error('Sheet request error:', error);
      throw new Error(`Failed to process sheet request: ${error.message}`);
    }
  }

  async updateOrderStatus(orderId, status) {
    try {
      await this.init();
      const sheet = this.doc.sheetsByIndex[0];
      const rows = await sheet.getRows();
      
      // Debug: Log all PayU OrderIds in sheet
      console.log('All PayU OrderIds in sheet:', rows.map(row => row['PayU OrderId']));
      
      const orderRow = rows.find(row => {
        console.log('Comparing:', {
          sheetId: row['PayU OrderId'],
          searchId: orderId,
          matches: row['PayU OrderId'] === orderId
        });
        return row['PayU OrderId'] === orderId;
      });

      if (orderRow) {
        orderRow['Status'] = status === 'PAID' ? 'Opłacone' : 
                            status === 'CANCELED' ? 'Anulowane' : 
                            status === 'PENDING' ? 'Oczekujące' : status;
        await orderRow.save();
        console.log(`Updated order ${orderId} status to ${status}`);
      } else {
        console.warn(`Order ${orderId} not found in sheet. Available columns:`, 
          Object.keys(rows[0] || {}));
      }
    } catch (error) {
      console.error('Update order status error:', error);
      throw new Error(`Failed to update order status: ${error.message}`);
    }
  }
}

module.exports = new GoogleSheetsService();