class PayUOrderDataBuilder {
  constructor(config) {
    this.config = config;
  }

  buildOrderData(orderDetails, customerData, customerIp) {
    console.log('Building order data:', { 
      orderNumber: orderDetails.orderNumber,
      cartItems: orderDetails.cart?.length,
      total: orderDetails.total // Use exactly what's passed in
    });

    this.validateOrderData(orderDetails);
    this.validateCustomerData(customerData);

    // Just pass through the exact price from the cart without any calculations
    const products = orderDetails.cart.map(item => ({
      name: item.name,
      unitPrice: Math.round(parseFloat(item.price) * 100), // Just convert to PayU format
      quantity: parseInt(item.quantity) || 1
    }));

    // Add shipping as-is
    if (orderDetails.shipping) {
      products.push({
        name: 'Shipping - DPD',
        unitPrice: 1500,
        quantity: 1
      });
    }

    const orderData = {
      merchantPosId: this.config.posId,
      currencyCode: 'PLN',
      totalAmount: Math.round(parseFloat(orderDetails.total) * 100), // Use exact total passed in
      customerIp: customerIp || '127.0.0.1',
      description: `Order ${orderDetails.orderNumber}`,
      extOrderId: orderDetails.orderNumber,
      buyer: {
        email: customerData.Email,
        phone: customerData.Telefon,
        firstName: customerData.Imie,
        lastName: customerData.Nazwisko,
        language: 'pl'
      },
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

  validateCustomerData(customerData) {
    const requiredFields = ['Email', 'Telefon', 'Imie', 'Nazwisko'];
    const missingFields = requiredFields.filter(field => !customerData?.[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required customer data: ${missingFields.join(', ')}`);
    }
  }
}

module.exports = PayUOrderDataBuilder;