class PayUOrderDataBuilder {
  constructor(config) {
    this.config = config;
  }

  buildOrderData(orderDetails, customerData, customerIp) {
    console.log('Building order data:', { 
      orderNumber: orderDetails.orderNumber,
      cartItems: orderDetails.cart?.length,
      total: orderDetails.total,
      discountAmount: orderDetails.discountAmount,
      shipping: orderDetails.shipping
    });

    this.validateOrderData(orderDetails);
    this.validateCustomerData(customerData);

    // Calculate discount percentage
    const subtotal = orderDetails.cart.reduce((sum, item) => 
      sum + (parseFloat(item.price) * (parseInt(item.quantity) || 1)), 0);
    const discountPercent = orderDetails.discountAmount ? (orderDetails.discountAmount / subtotal) : 0;

    // Build products with discounted prices
    const products = orderDetails.cart.map(item => {
      const originalPrice = parseFloat(item.price);
      const discountedPrice = originalPrice * (1 - discountPercent);
      return {
        name: item.name || 'Product',
        unitPrice: Math.round(discountedPrice * 100),
        quantity: parseInt(item.quantity) || 1
      };
    });

    // Add shipping
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
      totalAmount: Math.round(parseFloat(orderDetails.total) * 100),
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
      productsCount: orderData.products.length,
      productPrices: products.map(p => ({
        name: p.name,
        price: p.unitPrice / 100
      }))
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