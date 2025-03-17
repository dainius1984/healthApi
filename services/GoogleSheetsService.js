const { GoogleSpreadsheet } = require('google-spreadsheet');

class GoogleSheetsService {
  constructor() {
    this.doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    const formattedKey = this._formatPrivateKey(process.env.GOOGLE_PRIVATE_KEY);
    this._validateCredentials(formattedKey, process.env.GOOGLE_CLIENT_EMAIL);

    await this._authenticateServiceAccount(formattedKey, process.env.GOOGLE_CLIENT_EMAIL);
    await this.doc.loadInfo();
    this.initialized = true;
  }

  async addRow(data) {
    try {
      await this.init();
      const sheet = this._getMainSheet();
      
      this._logAddingRow(data);
      const formattedData = this._formatRowData(data);
      const addedRow = await sheet.addRow(formattedData);
      
      this._logRowAdded(data);
      return addedRow;
    } catch (error) {
      this._handleError('Sheet request', error);
    }
  }

  async updateOrderStatus(orderId, status, extOrderId) {
    try {
      await this.init();
      const sheet = this._getMainSheet();
      const rows = await sheet.getRows();
      
      this._logStatusUpdateAttempt(orderId, status, extOrderId, rows.length);
      const orderRow = this._findOrderRow(rows, extOrderId);
  
      if (orderRow) {
        await this._updateRowStatus(orderRow, status, extOrderId);
        return true;
      } else {
        this._logOrderNotFound(extOrderId, orderId);
        return false;
      }
    } catch (error) {
      this._handleError('Update order status', error, { orderId, extOrderId, status });
    }
  }

  // Private helper methods
  _formatPrivateKey(key) {
    if (!key) return null;
    return key.replace(/\\n/g, '\n');
  }

  _validateCredentials(privateKey, clientEmail) {
    if (!privateKey || !clientEmail) {
      throw new Error('Google Sheets credentials are missing');
    }
  }

  async _authenticateServiceAccount(privateKey, clientEmail) {
    await this.doc.useServiceAccountAuth({
      client_email: clientEmail,
      private_key: privateKey,
    });
  }

  _getMainSheet() {
    return this.doc.sheetsByIndex[0];
  }

  _logAddingRow(data) {
    console.log('Adding row to sheets:', {
      orderNumber: data['Numer zamowienia'],
      date: data['Data'],
      status: data['Status'],
      discount: data['Czy naliczono rabat'],
      total: data['Suma'],
    });
  }

  _formatRowData(data) {
    return {
      ...data,
      'Numer zamowienia': `="${data['Numer zamowienia']}"`,
      'Data': `="${data['Data']}"`,
      'Produkty': data['Produkty'],
    };
  }

  _logRowAdded(data) {
    console.log('Successfully added row to sheet:', {
      orderNumber: data['Numer zamowienia'],
      date: data['Data'],
      total: data['Suma'],
    });
  }

  _logStatusUpdateAttempt(orderId, status, extOrderId, totalRows) {
    console.log('Attempting to update order status:', {
      payuOrderId: orderId,
      status,
      orderNumber: extOrderId,
      totalRows,
    });
  }

  _findOrderRow(rows, extOrderId) {
    if (!extOrderId) return null;

    console.log('Searching for order:', {
      orderToFind: extOrderId,
      totalRows: rows.length
    });

    const row = rows.find(row => {
      const sheetOrderNumber = row['Numer zamowienia']?.replace(/[="]/g, '');
      return sheetOrderNumber === extOrderId;
    });

    console.log('Search result:', {
      orderToFind: extOrderId,
      found: !!row
    });

    return row;
  }

  async _updateRowStatus(orderRow, status, extOrderId) {
    const statusMapping = {
      'PAID': 'Opłacone',
      'CANCELLED': 'Anulowane',
      'PENDING': 'Oczekujące',
      'REJECTED': 'Odrzucone',
    };

    const oldStatus = orderRow['Status'];
    const mappedStatus = statusMapping[status] || status;
    orderRow['Status'] = mappedStatus;
    await orderRow.save();
    
    console.log('Successfully updated order status:', {
      orderNumber: extOrderId,
      oldStatus,
      newStatus: mappedStatus,
    });
  }

  _logOrderNotFound(extOrderId, orderId) {
    console.warn('Order not found in sheet:', {
      searchedOrderNumber: extOrderId,
      payuOrderId: orderId,
    });
  }

  _handleError(operation, error, additionalContext = {}) {
    console.error(`Failed to ${operation}:`, {
      error: error.message,
      stack: error.stack,
      ...additionalContext
    });
    throw new Error(`Failed to ${operation}: ${error.message}`);
  }
}

module.exports = new GoogleSheetsService();