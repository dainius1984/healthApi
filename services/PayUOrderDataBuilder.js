class PayUOrderDataBuilder {
  constructor(config) {
    this.config = config;
  }

  buildOrderData(orderDetails, customerData, customerIp) {
    console.log('Building order data:', { 
      orderNumber: orderDetails.orderNumber,
      cartItems: orderDetails.cart?.length,
      total: orderDetails.total // This is already the final amount (348 zł)
    });

    this.validateOrderData(orderDetails);
    this.validateCustomerData(customerData);

    // Build products with original prices
    const products = orderDetails.cart.map(item => ({
      name: item.name || 'Product',
      unitPrice: Math.round(parseFloat(item.price) * 100), // Original prices (250.00 and 120.00)
      quantity: parseInt(item.quantity) || 1
    }));

    // Add shipping
    if (orderDetails.shipping) {
      products.push({
        name: 'Shipping - DPD',
        unitPrice: 1500, // 15.00 zł
        quantity: 1
      });
    }

    const orderData = {
      merchantPosId: this.config.posId,
      currencyCode: 'PLN',
      totalAmount: Math.round(parseFloat(orderDetails.total) * 100), // Will be 34800 (348.00 zł)
      customerIp: customerIp || '127.0.0.1',
      description: `Order ${orderDetails.orderNumber}`,
      extOrderId: orderDetails.orderNumber,
      buyer: this.buildBuyerData(customerData),
      products: products,
      notifyUrl: `${process.env.BASE_URL}/api/payu-webhook`,
      continueUrl: `${process.env.FRONTEND_URL}/order-confirmation`,
      validityTime: 3600
    };

    console.log('Created PayU order data:', {
      orderNumber: orderData.extOrderId,
      totalAmount: orderData.totalAmount,
      finalPrice: orderData.totalAmount / 100,
      productsCount: orderData.products.length
    });

    return orderData;
  }

  validateOrderData(orderDetails) {
    if (!orderDetails?.orderNumber) {
      throw new Error('Order number is required');
    }
    if (!orderDetails?.cart || !Array.isArray(orderDetails.cart)) {
      throw new Error('Invalid cart data');
    }
    if (!orderDetails?.total || isNaN(parseFloat(orderDetails.total))) {
      throw new Error('Valid total amount is required');
    }
  }

  buildBuyerData(customerData) {
    return {
      email: customerData.Email,
      phone: customerData.Telefon,
      firstName: customerData.Imie,
      lastName: customerData.Nazwisko,
      language: 'pl'
    };
  }
}

module.exports = PayUOrderDataBuilder;