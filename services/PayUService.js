const PayUConfig = require('../config/PayUConfig');
const PayUAuthService = require('./auth/PayUAuthService');
const PayUSecurityService = require('./security/PayUSecurityService');
const PayUOrderDataBuilder = require('./orders/PayUOrderDataBuilder');
const PayUOrderService = require('./orders/PayUOrderService');

// Initialize services
const config = new PayUConfig();
const authService = new PayUAuthService(config);
const securityService = new PayUSecurityService(config);
const orderDataBuilder = new PayUOrderDataBuilder(config);
const orderService = new PayUOrderService(config, authService, securityService);

// Export services
module.exports = {
  config,
  authService,
  securityService,
  orderDataBuilder,
  orderService
};