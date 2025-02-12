class PayUOrderDataBuilder {
  constructor(config) {
    this.config = config;
  }

  buildOrderData(orderDetails, customerData, customerIp) {
    console.log('Building order data:', { 
      orderNumber: orderDetails.orderNumber,
      cartItems: orderDetails.cart?.length,
      total: orderDetails.total 
    });

    this.validateOrderData(orderDetails);
    this.validateCustomerData(customerData);

    const products = this.buildProducts(orderDetails);
    
    // Convert the provided total to PayU format (multiply by 100)
    const totalAmount = Math.round(parseFloat(orderDetails.total) * 100);

    const orderData = {
      merchantPosId: this.config.posId,
      currencyCode: 'PLN',
      totalAmount: totalAmount, // Use the provided total (already discounted) instead of calculating
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
      originalAmount: this.calculateTotal(products), // Log both amounts for debugging
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
    const missingFields = requiredFields.filter(field => !customerData[field]);
    if (missingFields.length > 0) {
      throw new Error(`Missing customer data: ${missingFields.join(', ')}`);
    }
  }

  buildProducts(orderDetails) {
    const products = orderDetails.cart.map(this.buildProductData);
    
    if (orderDetails.shipping) {
      products.push({
        name: 'Shipping - DPD',
        unitPrice: 1500,
        quantity: 1
      });
    }
    
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

  calculateTotal(products) {
    return products.reduce((sum, product) => 
      sum + (product.unitPrice * product.quantity), 0);
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