const PayUConfig = require('./PayUConfig');
const PayUAuthService = require('./PayUAuthService');
const PayUSecurityService = require('./PayUSecurityService');
const PayUOrderDataBuilder = require('./PayUOrderDataBuilder');
const PayUOrderService = require('./PayUOrderService');

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