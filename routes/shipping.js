const express = require('express');
const ShippingController = require('../services/ShippingController');

const router = express.Router();

/**
 * @route POST /api/shipping/create
 * @desc Create a shipment with InPost ShipX API
 * @access Private
 */
router.post('/create', ShippingController.createShipment);

/**
 * @route POST /api/shipping/inpost/create
 * @desc Create a shipment with InPost ShipX API
 * @access Private
 */
router.post('/inpost/create', ShippingController.createShipment);

module.exports = router; 