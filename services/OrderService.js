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

// In OrderService.js, replace the existing _formatDateForSheets method with:

_formatDateForSheets(dateString) {
  try {
    const date = dateString instanceof Date ? dateString : new Date(dateString);
    if (isNaN(date.getTime())) throw new Error('Invalid date');
    
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    // Return the formatted date string (without quotes - they'll be added in GoogleSheetsService)
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

// In OrderService.js
async updateOrderStatus(orderId, status, extOrderId) {
  try {
    // First try to update in Appwrite (for logged-in users)
    try {
      const updated = await AppwriteService.updateOrderStatus(orderId, status);
      if (updated) {
        console.log('Successfully updated status in Appwrite for logged-in user');
        return; // Exit if Appwrite update was successful
      }
    } catch (error) {
      console.log('Order not found in Appwrite - might be a guest order');
    }

    // If Appwrite update failed or didn't find the order, try Google Sheets (for guests)
    await GoogleSheetsService.updateOrderStatus(orderId, status, extOrderId);
    console.log('Successfully updated status in Google Sheets for guest user');

  } catch (error) {
    console.error('Order status update error:', error);
    throw error;
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
// In OrderService.js
const sheetData = {
  'Numer zamowienia': orderNumber,
  'Data': this._formatDateForSheets(orderDate), // Change from 'Data zamowienia' to 'Data'
  'Email': customerData.Email,
  'Telefon': customerData.Telefon,
  'Produkty': this._formatOrderItems(orderData.cart),
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
  'Uwagi': orderData.notes || '-',
  'Firma': customerData.Firma || '-'
};

console.log('Sheet data prepared:', {
  orderNumber,
  payuId: payuResponse.orderId,
  status: 'Oczekujące'
});
  
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