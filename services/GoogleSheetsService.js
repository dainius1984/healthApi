// services/googleSheets.service.js
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
      
      // Changed from 'PayU OrderId' to match the column name exactly
      const orderRow = rows.find(row => row['PayU OrderId'] === orderId);

      if (orderRow) {
        orderRow['Status'] = status === 'PAID' ? 'Opłacone' : status;
        await orderRow.save();
        console.log(`Updated order ${orderId} status to ${status}`);
      } else {
        console.warn(`Order ${orderId} not found in sheet`);
      }
    } catch (error) {
      console.error('Update order status error:', error);
      throw new Error(`Failed to update order status: ${error.message}`);
    }
  }
}

module.exports = new GoogleSheetsService();