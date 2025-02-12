class PayUOrderDataBuilder {
  constructor(config) {
    this.config = config;
  }

  buildOrderData(orderDetails, customerData, customerIp) {
    console.log('Building order data:', { 
      orderNumber: orderDetails.orderNumber,
      cartItems: orderDetails.cart?.length,
      total: orderDetails.total, // This should be 348.00
      shipping: orderDetails.shipping
    });

    this.validateOrderData(orderDetails);
    this.validateCustomerData(customerData);

    const products = this.buildProducts(orderDetails);
    
    // Convert the final total (including discount and shipping) to PayU format
    const totalAmount = Math.round(parseFloat(orderDetails.total) * 100);

    const orderData = {
      merchantPosId: this.config.posId,
      currencyCode: 'PLN',
      totalAmount: totalAmount, // This will be 34800 (348.00 zł)
      customerIp: customerIp || '127.0.0.1',
      description: `Order ${orderDetails.orderNumber}`,
      extOrderId: orderDetails.orderNumber,
      buyer: this.buildBuyerData(customerData),
      products: this.buildProducts(orderDetails), // Keep original prices for reference
      notifyUrl: `${process.env.BASE_URL}/api/payu-webhook`,
      continueUrl: `${process.env.FRONTEND_URL}/order-confirmation`,
      validityTime: 3600
    };

    console.log('Created PayU order data:', {
      orderNumber: orderData.extOrderId,
      totalAmount: orderData.totalAmount,
      finalPrice: orderData.totalAmount / 100, // Log in PLN for clarity
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

  buildProducts(orderDetails) {
    // List products with their original prices (before discount)
    const products = orderDetails.cart.map(this.buildProductData);
    
    // Add shipping as a separate product
    products.push({
      name: 'Shipping - DPD',
      unitPrice: 1500, // 15.00 zł in PayU format
      quantity: 1
    });
    
    return products;
  }

  buildProductData(item) {
    const price = Math.round(parseFloat(item.price) * 100);
    const quantity = parseInt(item.quantity) || 1;
    
    if (isNaN(price) || price <= 0) {
      throw new Error(`Invalid price for product: ${item.name}`);
    }

    return {
      name: item.name || 'Product',
      unitPrice: price,
      quantity: quantity
    };
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