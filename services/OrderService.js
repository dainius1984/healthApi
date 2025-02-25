const AppwriteService = require('./AppwriteService');
const GoogleSheetsService = require('./GoogleSheetsService');
const { orderService: PayUOrderService, orderDataBuilder } = require('./PayUService');

class OrderService {
  _sanitizeTotal(total) {
    if (typeof total === 'number') {
      return total;
    }
    
    if (typeof total === 'string') {
      const cleanTotal = total.replace(/[^\d.-]/g, '');
      const parsedTotal = parseFloat(cleanTotal);
      
      if (isNaN(parsedTotal)) {
        console.error('Invalid total format:', total);
        return 0;
      }
      
      return Number(parsedTotal.toFixed(2));
    }
    
    console.error('Invalid total format:', total);
    return 0;
  }

  _formatDateForSheets(dateString) {
    try {
      const date = dateString instanceof Date ? dateString : new Date(dateString);
      if (isNaN(date.getTime())) throw new Error('Invalid date');
      
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');

      return `${day}.${month}.${year} ${hours}:${minutes}`;
    } catch (error) {
      console.error('Date formatting error:', error);
      const now = new Date();
      return `${now.getDate().toString().padStart(2, '0')}.${(now.getMonth() + 1).toString().padStart(2, '0')}.${now.getFullYear()} 00:00`;
    }
  }

  _formatOrderItems(items) {
    if (Array.isArray(items)) {
      return items.map(item => 
        `${item.name || item.n} (${item.quantity || item.q}x)`
      ).join('\n');
    }
    return '';
  }

  async updateOrderStatus(orderId, status, extOrderId) {
    try {
      console.log('Updating order status:', {
        orderId,
        status,
        extOrderId
      });

      // Try to update in Appwrite first
      try {
        // Try with orderNumber first
        let updated = await AppwriteService.updateOrderStatus(extOrderId || orderId, status);
        if (updated) {
          console.log('Status updated in Appwrite');
          return;
        }

        // If that failed and we have both IDs, try with the other one
        if (!updated && extOrderId && orderId !== extOrderId) {
          updated = await AppwriteService.updateOrderStatus(orderId, status);
          if (updated) {
            console.log('Status updated in Appwrite using PayU orderId');
            return;
          }
        }
      } catch (error) {
        console.log('Appwrite update failed:', error.message);
      }

      // If Appwrite update failed, try Google Sheets
      await GoogleSheetsService.updateOrderStatus(orderId, status, extOrderId);
      console.log('Status updated in Google Sheets');

    } catch (error) {
      console.error('Order status update failed:', error);
      throw error;
    }
  }

  async createOrder(orderData, customerData, isAuthenticated, userId, ip) {
    try {
      const orderDate = new Date();
      const orderNumber = orderData.orderNumber || 
        `ORD-${orderDate.toISOString().split('T')[0]}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const originalTotal = this._sanitizeTotal(orderData.subtotal);
      const discountAmount = this._sanitizeTotal(orderData.discountAmount || 0);
      const finalTotal = this._sanitizeTotal(orderData.total);

      // Extract and normalize shipping method
      const shippingMethod = orderData.shipping || 'DPD';
      
      console.log('Creating order with shipping method:', shippingMethod);

      // Create PayU order first
      const payuOrderData = orderDataBuilder.buildOrderData(
        {
          orderNumber,
          cart: orderData.cart,
          total: finalTotal,
          shipping: shippingMethod // Pass explicit shipping method
        },
        customerData,
        ip || '127.0.0.1'
      );

      const payuResponse = await PayUOrderService.createOrder(payuOrderData);
      
      console.log('PayU order created:', {
        orderNumber,
        payuOrderId: payuResponse.orderId,
        shippingMethod // Log shipping method for debugging
      });

      if (isAuthenticated && userId) {
        // Store order in Appwrite for authenticated users
        const appwriteOrderData = {
          userId,
          orderNumber: orderNumber,
          payuOrderId: payuResponse.orderId,
          status: 'Oczekujące',
          total: finalTotal,
          subtotal: originalTotal,
          discountAmount: discountAmount,
          items: orderData.cart.map(item => ({
            id: item.id || item.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
            n: item.name,
            p: parseFloat(item.price),
            q: parseInt(item.quantity),
            image: item.image || `/img/products/${item.id || item.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.png`
          })),
          customerData: {
            Imie: customerData.Imie,
            Nazwisko: customerData.Nazwisko,
            Email: customerData.Email,
            Telefon: customerData.Telefon,
            Ulica: customerData.Ulica,
            'Kod pocztowy': customerData['Kod pocztowy'],
            Miasto: customerData.Miasto,
            Firma: customerData.Firma || '',
            Uwagi: orderData.notes || ''
          },
          shippingDetails: {
            method: shippingMethod, // Use normalized shipping method
            cost: '15.00'
          },
          discountApplied: !!discountAmount,
          createdAt: new Date().toISOString()
        };

        console.log('Storing order in Appwrite with shipping:', shippingMethod);
        await AppwriteService.storeOrder(appwriteOrderData);
        console.log('Order stored in Appwrite:', orderNumber);
      } else {
        // Store order in Google Sheets for guest users
        const sheetData = {
          'Numer zamowienia': orderNumber,
          'Data': this._formatDateForSheets(orderDate),
          'Status': 'Oczekujące',
          'Czy naliczono rabat': discountAmount > 0 ? 'Tak' : 'Nie',
          'Suma': `${finalTotal.toFixed(2)} PLN`,
          'Wysylka': shippingMethod, // Use normalized shipping method for sheets too
          'Imie': customerData.Imie,
          'Nazwisko': customerData.Nazwisko,
          'Firma': customerData.Firma || '-',
          'Email': customerData.Email,
          'Telefon': customerData.Telefon,
          'Ulica': customerData.Ulica,
          'Kod pocztowy': customerData['Kod pocztowy'],
          'Miasto': customerData.Miasto,
          'Uwagi': orderData.notes || '-',
          'Produkty': this._formatOrderItems(orderData.cart)
        };

        console.log('Storing guest order in Google Sheets with shipping:', shippingMethod);
        await GoogleSheetsService.addRow(sheetData);
        console.log('Guest order saved to sheets:', orderNumber);
      }

      return {
        success: true,
        redirectUrl: payuResponse.redirectUrl,
        orderId: payuResponse.orderId,
        orderNumber,
        total: finalTotal,
        discountApplied: !!discountAmount,
        shipping: shippingMethod // Include shipping in response for confirmation
      };
    } catch (error) {
      console.error('Order creation failed:', error);
      throw error;
    }
  }
}

module.exports = new OrderService();