const AppwriteService = require('./AppwriteService');
const GoogleSheetsService = require('./GoogleSheetsService');
const { orderService: PayUOrderService, orderDataBuilder } = require('./PayUService');

class OrderService {
  // Helper method to convert total to a number
  _sanitizeTotal(total) {
    // If total is already a number, return it
    if (typeof total === 'number') return total;
    
    // If total is a string, try to parse it
    if (typeof total === 'string') {
      // Remove any currency symbols or whitespace
      const cleanTotal = total.replace(/[^\d.-]/g, '');
      const parsedTotal = parseFloat(cleanTotal);
      
      // Return parsed total if valid
      if (!isNaN(parsedTotal)) return parsedTotal;
    }
    
    // If all else fails, return 0 and log an error
    console.error('Invalid total format:', total);
    return 0;
  }

  async createOrder(orderData, customerData, isAuthenticated, userId, ip) {
    console.log('Received in OrderService:', {
        orderData,
        customerData,
        isAuthenticated,
        userId
      });
    try {
      const orderDate = new Date();
      const orderNumber = orderData.orderNumber || 
        `ORD-${orderDate.toISOString().split('T')[0]}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // Sanitize total
      const sanitizedTotal = this._sanitizeTotal(orderData.total);

      // Prepare sheet data with improved formatting and additional columns
      const sheetData = {
        'Numer zamowienia': `="${orderNumber}"`, // Wrap in Excel formula to display full number
        'Data zamowienia': orderDate.toLocaleDateString('pl-PL'), // Localized date format
        'Email': customerData.Email,
        'Telefon': customerData.Telefon,
        'Produkty': JSON.stringify(orderData.items), // Ensure items are displayed clearly
        'Imie': customerData.Imie,
        'Nazwisko': customerData.Nazwisko,
        'Ulica': customerData.Ulica,
        'Kod pocztowy': customerData['Kod pocztowy'],
        'Miasto': customerData.Miasto,
        'Status': 'Oczekujące', // Initial status
        'Suma': `${sanitizedTotal.toFixed(2)} PLN`, // Total with currency
        'Metoda dostawy': orderData.shipping || 'DPD',
        'Kurier': orderData.shipping || 'DPD', // Separate courier column
        'Koszt dostawy': '15.00 PLN'
      };

      // Modify PayU order data creation to use sanitized total
      const payuOrderData = orderDataBuilder.buildOrderData(
        {
          orderNumber,
          cart: orderData.cart,
          total: sanitizedTotal,
          shipping: orderData.shipping
        },
        customerData,
        ip || '127.0.0.1'
      );

      const payuResponse = await PayUOrderService.createOrder(payuOrderData);

      // Store order based on authentication status
      if (isAuthenticated && userId) {
        console.log('Attempting to save order to Appwrite:', { userId, orderNumber });
        try {
          const appwriteOrderData = {
            userId,
            orderNumber,
            payuOrderId: payuResponse.orderId,
            status: 'pending',
            total: sanitizedTotal,
            items: orderData.items,
            customerData,
            shippingDetails: {
              method: orderData.shipping,
              cost: orderData.shippingCost
            },
            createdAt: new Date().toISOString()
          };

          await AppwriteService.storeOrder(appwriteOrderData);
        } catch (error) {
          // Fallback to Google Sheets if Appwrite fails
          sheetData['PayU OrderId'] = payuResponse.orderId;
          await GoogleSheetsService.addRow(sheetData);
          console.log('Order fallback to Google Sheets:', orderNumber);
        }
      } else {
        // Store in Google Sheets for guest users
        console.log('Saving order to Google Sheets (guest user)');

        sheetData['PayU OrderId'] = payuResponse.orderId;
        await GoogleSheetsService.addRow(sheetData);
      }

      return {
        success: true,
        redirectUrl: payuResponse.redirectUrl,
        orderId: payuResponse.orderId,
        orderNumber
      };
    } catch (error) {
      console.error('Order creation error:', error);
      throw error;
    }
  }

  async updateOrderStatus(orderId, status) {
    try {
      // Try Appwrite first
      try {
        const updated = await AppwriteService.updateOrderStatus(orderId, status);
        if (updated) return;
      } catch (error) {
        console.error('Appwrite update failed:', error);
      }

      // Fallback or default to Google Sheets
      await GoogleSheetsService.updateOrderStatus(orderId, status);
    } catch (error) {
      console.error('Order status update error:', error);
      throw error;
    }
  }
}

module.exports = new OrderService();