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
      // Handle string format: "ProductName (Qx po Price zł)"
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

      // Handle array format
      if (Array.isArray(items)) {
        return items.map(item => ({
          id: item.id || item.productId || 0,
          n: item.name || item.n || '',
          p: parseFloat(item.price || item.p || 0),
          q: parseInt(item.quantity || item.q || 1),
          image: item.image || `/img/products/${item.id}.png`
        }));
      }

      // Handle cart object format
      if (items?.cart && Array.isArray(items.cart)) {
        return this._formatOrderItems(items.cart);
      }

      // If we can't parse the items, log and return empty array
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

      // Use the original amounts from orderData - they're already calculated correctly
      const originalTotal = this._sanitizeTotal(orderData.subtotal);
      const discountAmount = this._sanitizeTotal(orderData.discountAmount || 0);
      const finalTotal = this._sanitizeTotal(orderData.total); // Already includes discount
      
      console.log('Order totals:', {
        originalTotal,
        discountAmount,
        finalTotal
      });
      
      // Try to get items from either items or cart property
      const items = orderData.items || orderData.cart;
      const formattedItems = this._formatOrderItems(items);
      
      console.log('Formatted items:', formattedItems);

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
        'Suma': `${originalTotal.toFixed(2)} PLN`, // Original total before discount
        'Rabat': discountAmount ? `${discountAmount.toFixed(2)} PLN` : '0.00 PLN',
        'Suma po rabacie': `${finalTotal.toFixed(2)} PLN`, // Total after discount
        'Metoda dostawy': orderData.shipping || 'DPD',
        'Kurier': orderData.shipping || 'DPD',
        'Koszt dostawy': '15.00 PLN'
      };

      // Pass the final total (already discounted) to PayU
      const payuOrderData = orderDataBuilder.buildOrderData(
        {
          orderNumber,
          cart: orderData.cart,
          total: finalTotal, // Already includes discount and shipping
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

      const payuResponse = await PayUOrderService.createOrder(payuOrderData);

      if (isAuthenticated && userId) {
        console.log('Attempting to save order to Appwrite:', { 
          userId, 
          orderNumber,
          originalTotal,
          discountAmount,
          finalTotal
        });
        
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
        orderNumber,
        total: finalTotal,
        discountApplied: !!discountAmount
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