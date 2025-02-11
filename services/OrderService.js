// services/OrderService.js
const AppwriteService = require('./AppwriteService');
const GoogleSheetsService = require('./GoogleSheetsService');
const { orderService: PayUOrderService, orderDataBuilder } = require('./PayUService');

class OrderService {
  async createOrder(orderData, customerData, isAuthenticated, userId, ip) {
    try {
      const orderNumber = orderData.orderNumber || 
        `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // Prepare sheet data
      const sheetData = {
        'Numer zamowienia': orderNumber,
        'Email': customerData.Email,
        'Telefon': customerData.Telefon,
        'Produkty': orderData.items,
        'Imie': customerData.Imie,
        'Nazwisko': customerData.Nazwisko,
        'Ulica': customerData.Ulica,
        'Kod pocztowy': customerData['Kod pocztowy'],
        'Miasto': customerData.Miasto,
        'Metoda dostawy': orderData.shipping || 'DPD',
        'Koszt dostawy': '15.00 PLN'
      };

      // Create PayU order
      const payuOrderData = orderDataBuilder.buildOrderData(
        {
          orderNumber,
          cart: orderData.cart,
          total: orderData.total,
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
            total: orderData.total,
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