const AppwriteService = require('./AppwriteService');
const GoogleSheetsService = require('./GoogleSheetsService');
const { orderService: PayUOrderService, orderDataBuilder } = require('./PayUService');

class OrderService {
  _sanitizeTotal(total) {
    if (typeof total === 'number') return total;
    
    if (typeof total === 'string') {
      const cleanTotal = total.replace(/[^\d.-]/g, '');
      const parsedTotal = parseFloat(cleanTotal);
      
      if (!isNaN(parsedTotal)) return parsedTotal;
    }
    
    console.error('Invalid total format:', total);
    return 0;
  }

  _formatDateForSheets(dateString) {
    try {
      const date = dateString instanceof Date ? dateString : new Date(dateString);
      if (isNaN(date.getTime())) throw new Error('Invalid date');
      
      return `="${date.toLocaleDateString('pl-PL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })}"`;
    } catch (error) {
      console.error('Date formatting error:', error);
      return `="${new Date().toLocaleDateString('pl-PL')}"`;
    }
  }

  // New helper method to format items
  _formatOrderItems(items) {
    try {
      // If items is already a string, try to parse it
      const itemsArray = typeof items === 'string' ? JSON.parse(items) : items;
      
      // Ensure each item has the required properties
      return itemsArray.map(item => ({
        id: item.id || 0,
        n: item.name || item.n || '',
        p: item.price || item.p || 0,
        q: item.quantity || item.q || 1,
        image: item.image || `/img/products/${item.id}.png`
      }));
    } catch (error) {
      console.error('Error formatting order items:', error);
      return [];
    }
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

      const sanitizedTotal = this._sanitizeTotal(orderData.total);
      
      // Format items consistently for both storage methods
      const formattedItems = this._formatOrderItems(orderData.items);

      const sheetData = {
        'Numer zamowienia': `="${orderNumber}"`,
        'Data zamowienia': this._formatDateForSheets(orderDate),
        'Email': customerData.Email,
        'Telefon': customerData.Telefon,
        'Produkty': JSON.stringify(formattedItems),
        'Imie': customerData.Imie,
        'Nazwisko': customerData.Nazwisko,
        'Ulica': customerData.Ulica,
        'Kod pocztowy': customerData['Kod pocztowy'],
        'Miasto': customerData.Miasto,
        'Status': 'Oczekujące',
        'Suma': `${sanitizedTotal.toFixed(2)} PLN`,
        'Metoda dostawy': orderData.shipping || 'DPD',
        'Kurier': orderData.shipping || 'DPD',
        'Koszt dostawy': '15.00 PLN'
      };

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

      if (isAuthenticated && userId) {
        console.log('Attempting to save order to Appwrite:', { userId, orderNumber });
        try {
          const appwriteOrderData = {
            userId,
            orderNumber,
            payuOrderId: payuResponse.orderId,
            status: 'pending',
            total: sanitizedTotal,
            items: JSON.stringify(formattedItems), // Store formatted items as JSON string
            customerData,
            shippingDetails: {
              method: orderData.shipping,
              cost: orderData.shippingCost
            },
            createdAt: new Date().toISOString()
          };

          await AppwriteService.storeOrder(appwriteOrderData);
        } catch (error) {
          sheetData['PayU OrderId'] = payuResponse.orderId;
          await GoogleSheetsService.addRow(sheetData);
          console.log('Order fallback to Google Sheets:', orderNumber);
        }
      } else {
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
      try {
        const updated = await AppwriteService.updateOrderStatus(orderId, status);
        if (updated) return;
      } catch (error) {
        console.error('Appwrite update failed:', error);
      }

      await GoogleSheetsService.updateOrderStatus(orderId, status);
    } catch (error) {
      console.error('Order status update error:', error);
      throw error;
    }
  }
}

module.exports = new OrderService();