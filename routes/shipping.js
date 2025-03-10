const express = require('express');
const ShippingController = require('../services/ShippingController');

const router = express.Router();

/**
 * @route POST /api/shipping/create
 * @desc Create a shipment with InPost ShipX API
 * @access Private
 */
router.post('/create', ShippingController.createShipment);

module.exports = router; 