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

  _formatOrderItems(items) {
    try {
      if (typeof items === 'string') {
        console.log('Processing string items:', items);
        const match = items.match(/(.*?)\s*\((\d+)x po\s*([\d.]+)/);
        if (match) {
          const [_, name, quantity, price] = match;
          const productId = name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
          
          return [{
            id: productId,
            n: name.trim(),
            p: parseFloat(price),
            q: parseInt(quantity),
            image: `/img/products/${productId}.png`
          }];
        }
      }

      if (Array.isArray(items)) {
        return items.map(item => ({
          id: item.id || item.productId || 0,
          n: item.name || item.n || '',
          p: parseFloat(item.price || item.p || 0),
          q: parseInt(item.quantity || item.q || 1),
          image: item.image || `/img/products/${item.id}.png`
        }));
      }

      if (items?.cart && Array.isArray(items.cart)) {
        return this._formatOrderItems(items.cart);
      }

      console.error('Unable to parse order items:', items);
      return [];
    } catch (error) {
      console.error('Error formatting order items:', error);
      return [];
    }
  }

  async createOrder(orderData, customerData, isAuthenticated, userId, ip) {
    console.log('Processing order data:', {
      orderItems: orderData.items,
      cart: orderData.cart,
      subtotal: orderData.subtotal,
      total: orderData.total,
      discountAmount: orderData.discountAmount,
      discountApplied: orderData.discountApplied
    });
    
    try {
      const orderDate = new Date();
      const orderNumber = orderData.orderNumber || 
        `ORD-${orderDate.toISOString().split('T')[0]}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const originalTotal = this._sanitizeTotal(orderData.subtotal);
      const discountAmount = this._sanitizeTotal(orderData.discountAmount || 0);
      const finalTotal = this._sanitizeTotal(orderData.total);
      
      const items = orderData.items || orderData.cart;
      const formattedItems = this._formatOrderItems(items);

      // First create PayU order
      const payuOrderData = orderDataBuilder.buildOrderData(
        {
          orderNumber,
          cart: orderData.cart,
          total: finalTotal,
          shipping: orderData.shipping
        },
        customerData,
        ip || '127.0.0.1'
      );

      console.log('Sending order to PayU:', {
        orderNumber,
        total: finalTotal,
        discountApplied: !!discountAmount
      });

      // Get PayU response first
      const payuResponse = await PayUOrderService.createOrder(payuOrderData);
      
      console.log('PayU Response received:', {
        orderId: payuResponse.orderId,
        status: payuResponse.status,
        extOrderId: payuResponse.extOrderId
      });

      // Now create sheet data with the actual PayU ID
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
        'Suma': `${originalTotal.toFixed(2)} PLN`,
        'Rabat': discountAmount ? `${discountAmount.toFixed(2)} PLN` : '0.00 PLN',
        'Suma po rabacie': `${finalTotal.toFixed(2)} PLN`,
        'Metoda dostawy': orderData.shipping || 'DPD',
        'Kurier': orderData.shipping || 'DPD',
        'Koszt dostawy': '15.00 PLN',
        'Uwagi': `PayU ID: ${payuResponse.orderId}` // Now we have the actual PayU ID
      };

      if (isAuthenticated && userId) {
        try {
          const appwriteOrderData = {
            userId,
            orderNumber,
            payuOrderId: payuResponse.orderId,
            status: 'pending',
            total: finalTotal,
            subtotal: originalTotal,
            discountAmount: discountAmount,
            items: JSON.stringify(formattedItems),
            customerData,
            shippingDetails: {
              method: orderData.shipping,
              cost: orderData.shippingCost
            },
            discountApplied: !!discountAmount,
            createdAt: new Date().toISOString()
          };

          await AppwriteService.storeOrder(appwriteOrderData);
        } catch (error) {
          console.error('Appwrite storage failed, falling back to Sheets:', error);
          await GoogleSheetsService.addRow(sheetData);
          console.log('Order saved to sheets with PayU ID:', payuResponse.orderId);
        }
      } else {
        console.log('Saving order to Google Sheets (guest user)');
        await GoogleSheetsService.addRow(sheetData);
        console.log('Guest order saved to sheets with PayU ID:', payuResponse.orderId);
      }

      return {
        success: true,
        redirectUrl: payuResponse.redirectUrl,
        orderId: payuResponse.orderId,
        orderNumber,
        total: finalTotal,
        discountApplied: !!discountAmount
      };
    } catch (error) {
      console.error('Order creation error:', error);
      throw error;
    }
  }
}

module.exports = new OrderService();