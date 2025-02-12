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
      
      // Prepare data according to sheet columns
      const rowData = {
        'Numer zamowienia': data['Numer zamowienia'],
        'Data': data['Data zamowienia'],
        'Status': data['Status'],
        'Suma': data['Suma'],
        'Wysylka': data['Metoda dostawy'],
        'Imie': data['Imie'],
        'Nazwisko': data['Nazwisko'],
        'Firma': data['Firma'] || '',
        'Email': data['Email'],
        'Telefon': data['Telefon'],
        'Ulica': data['Ulica'],
        'Kod pocztowy': data['Kod pocztowy'],
        'Miasto': data['Miasto'],
        'Uwagi': `PayU OrderId: ${data['PayU OrderId']}`, // Store PayU ID in notes
        'Produkty': data['Produkty']
      };

      console.log('Adding row to sheets:', {
        orderNumber: rowData['Numer zamowienia'],
        payuOrderId: data['PayU OrderId'],
        status: rowData['Status']
      });

      const addedRow = await sheet.addRow(rowData);
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
      
      console.log('Looking for order:', {
        searchingFor: orderId,
        totalRows: rows.length
      });
      
      // Search in Uwagi field for PayU OrderId
      const orderRow = rows.find(row => {
        const uwagi = row['Uwagi'] || '';
        const hasPayUId = uwagi.includes(orderId);
        console.log('Comparing:', {
          sheetOrderNumber: row['Numer zamowienia'],
          uwagi: uwagi,
          payuOrderId: orderId,
          matches: hasPayUId
        });
        return hasPayUId;
      });

      if (orderRow) {
        const mappedStatus = 
          status === 'PAID' ? 'Opłacone' :
          status === 'CANCELED' ? 'Anulowane' :
          status === 'PENDING' ? 'Oczekujące' : status;

        orderRow['Status'] = mappedStatus;
        await orderRow.save();
        console.log(`Updated order ${orderId} status to ${mappedStatus}`);
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