const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { protect, authorize } = require('../middleware/auth');

// @route   POST api/orders
// @desc    Create a new order
// @access  Private (Consumer only)
router.post('/',
  protect,
  authorize('consumer'),
  [
    check('items', 'Items are required').isArray(),
    check('items.*.product', 'Product ID is required').not().isEmpty(),
    check('items.*.quantity', 'Quantity is required').isNumeric(),
    check('paymentMethod', 'Payment method is required').isIn(['cash', 'online', 'bank_transfer']),
    check('shippingAddress', 'Shipping address is required').not().isEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { items, paymentMethod, shippingAddress, notes } = req.body;

      // Validate products and calculate total
      let totalAmount = 0;
      const validatedItems = [];

      for (const item of items) {
        const product = await Product.findById(item.product);
        if (!product) {
          return res.status(404).json({ message: `Product ${item.product} not found` });
        }

        if (product.quantity < item.quantity) {
          return res.status(400).json({ message: `Insufficient quantity for ${product.name}` });
        }

        validatedItems.push({
          product: item.product,
          quantity: item.quantity,
          price: product.price
        });

        totalAmount += product.price * item.quantity;

        // Update product quantity
        product.quantity -= item.quantity;
        await product.save();
      }

      const order = new Order({
        buyer: req.user.id,
        farmer: validatedItems[0].product.farmer, // Assuming all products are from same farmer
        items: validatedItems,
        totalAmount,
        paymentMethod,
        shippingAddress,
        notes
      });

      await order.save();

      res.status(201).json(order);
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ message: 'Server Error' });
    }
  }
);

// @route   GET api/orders
// @desc    Get all orders (filtered by role)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const query = {};
    if (req.user.role === 'consumer') {
      query.buyer = req.user.id;
    } else if (req.user.role === 'farmer') {
      query.farmer = req.user.id;
    }

    const orders = await Order.find(query)
      .populate('buyer', 'name email')
      .populate('farmer', 'name email farmDetails')
      .populate('items.product', 'name price');

    res.json(orders);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET api/orders/:id
// @desc    Get order by ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('buyer', 'name email')
      .populate('farmer', 'name email farmDetails')
      .populate('items.product', 'name price');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if user is authorized to view this order
    if (
      req.user.role !== 'admin' &&
      order.buyer.toString() !== req.user.id &&
      order.farmer.toString() !== req.user.id
    ) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    res.json(order);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   PUT api/orders/:id
// @desc    Update order status
// @access  Private (Farmer only)
router.put('/:id',
  protect,
  authorize('farmer'),
  [
    check('status', 'Status is required').isIn(['confirmed', 'processing', 'shipped', 'delivered', 'cancelled'])
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const order = await Order.findById(req.params.id);

      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }

      // Check if the farmer owns this order
      if (order.farmer.toString() !== req.user.id) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      order.status = req.body.status;
      if (req.body.status === 'cancelled') {
        order.cancelReason = req.body.cancelReason;
      }

      await order.save();
      res.json(order);
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ message: 'Server Error' });
    }
  }
);

module.exports = router; 