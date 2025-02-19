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
        payuId: data['PayU ID'],
        status: data['Status']
      });

      // Format specific fields that need quotation
      const formattedData = {
        ...data,
        'Numer zamowienia': `="${data['Numer zamowienia']}"`,
        'PayU ID': `="${data['PayU ID']}"`,
        'Data zamowienia': `="${data['Data zamowienia']}"`,
        'Data': `="${data['Data']}"`,
      };

      const addedRow = await sheet.addRow(formattedData);
      console.log('Successfully added row to sheet with PayU ID:', data['PayU ID']);
      return addedRow;
    } catch (error) {
      console.error('Sheet request error:', {
        error: error.message,
        stack: error.stack,
        data: {
          orderNumber: data['Numer zamowienia'],
          payuId: data['PayU ID']
        }
      });
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
      
      const orderRow = rows.find(row => {
        // Clean the values before comparison
        const sheetOrderNumber = row['Numer zamowienia']?.replace(/[="]/g, '');
        const sheetPayuId = row['PayU ID']?.replace(/[="]/g, '');
        
        // Log the comparison for debugging
        console.log('Comparing row:', {
          sheetOrderNumber,
          sheetPayuId,
          searchingForOrder: extOrderId,
          searchingForPayuId: orderId,
          matchesOrder: sheetOrderNumber === extOrderId,
          matchesPayuId: sheetPayuId === orderId
        });
        
        // Try to match by either PayU ID or order number
        return sheetOrderNumber === extOrderId || sheetPayuId === orderId;
      });

      if (orderRow) {
        const mappedStatus = 
          status === 'PAID' ? 'Opłacone' :
          status === 'CANCELLED' ? 'Anulowane' :
          status === 'PENDING' ? 'Oczekujące' :
          status === 'REJECTED' ? 'Odrzucone' :
          status;

        // Store old status for logging
        const oldStatus = orderRow['Status'];
        
        // Update the status
        orderRow['Status'] = mappedStatus;
        await orderRow.save();
        
        console.log('Successfully updated order status:', {
          orderNumber: extOrderId,
          payuId: orderId,
          oldStatus: oldStatus,
          newStatus: mappedStatus,
          rowIndex: rows.indexOf(orderRow)
        });
      } else {
        console.warn('Order not found in sheet:', {
          searchedOrderNumber: extOrderId,
          payuOrderId: orderId,
          availableOrders: rows.map(row => ({
            orderNumber: row['Numer zamowienia']?.replace(/[="]/g, ''),
            payuId: row['PayU ID']?.replace(/[="]/g, '')
          }))
        });
      }
    } catch (error) {
      console.error('Failed to update order status:', {
        error: error.message,
        stack: error.stack,
        orderId,
        extOrderId,
        status
      });
      throw new Error(`Failed to update order status: ${error.message}`);
    }
  }
}

module.exports = new GoogleSheetsService();