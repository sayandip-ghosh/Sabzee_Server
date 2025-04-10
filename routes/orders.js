const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { check, validationResult } = require('express-validator');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
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
    check('paymentMethod', 'Payment method is required').isIn(['cash-on-delivery', 'online', 'bank_transfer']),
    check('shippingDetails', 'Shipping details are required').not().isEmpty(),
    check('shippingDetails.fullName', 'Full name is required').notEmpty(),
    check('shippingDetails.address', 'Address is required').notEmpty(),
    check('shippingDetails.city', 'City is required').notEmpty(),
    check('shippingDetails.state', 'State is required').notEmpty(),
    check('shippingDetails.postalCode', 'Postal code is required').notEmpty(),
    check('shippingDetails.phoneNumber', 'Phone number is required').notEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { items, paymentMethod, shippingDetails, notes } = req.body;

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
          price: product.price,
          name: product.name
        });

        totalAmount += product.price * item.quantity;

        // Update product quantity
        product.quantity -= item.quantity;
        await product.save();
      }

      const order = new Order({
        consumer: req.user.id,
        farmer: validatedItems[0].product.farmer, // Assuming all products are from same farmer
        items: validatedItems,
        totalAmount,
        paymentMethod,
        shippingDetails,
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
// @desc    Get all orders (admin), user orders (consumer), or farmer orders (farmer)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let orders = [];

    if (req.user.role === 'admin') {
      orders = await Order.find()
        .populate('consumer', 'name email')
        .populate('farmer', 'name')
        .sort({ createdAt: -1 });
    } else if (req.user.role === 'consumer') {
      orders = await Order.find({ consumer: req.user.id })
        .populate('farmer', 'name')
        .sort({ createdAt: -1 });
    } else if (req.user.role === 'farmer') {
      orders = await Order.find({ farmer: req.user.id })
        .populate('consumer', 'name email')
        .sort({ createdAt: -1 });
    }

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
      .populate('consumer', 'name email')
      .populate('farmer', 'name');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if the user is authorized to view this order
    if (
      req.user.role !== 'admin' &&
      order.consumer.toString() !== req.user.id &&
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

/**
 * @route   POST api/orders/checkout
 * @desc    Create an order from cart items
 * @access  Private (Consumer only)
 */
router.post('/checkout', protect, authorize('consumer'), async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { paymentMethod, shippingDetails, notes } = req.body;

    // Validate input
    if (!paymentMethod) {
      return res.status(400).json({ message: 'Payment method is required' });
    }

    if (!shippingDetails || !shippingDetails.address) {
      return res.status(400).json({ message: 'Shipping details are required' });
    }

    // Get user's cart
    const cart = await Cart.findOne({ user: req.user.id }).populate('items.product');

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: 'Your cart is empty' });
    }

    // Group items by farmer
    const itemsByFarmer = {};
    for (const cartItem of cart.items) {
      const product = cartItem.product;
      
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      if (product.quantity < cartItem.quantity) {
        return res.status(400).json({ 
          message: `Insufficient quantity for ${product.name}. Available: ${product.quantity}, Requested: ${cartItem.quantity}` 
        });
      }

      const farmerId = product.farmer.toString();
      if (!itemsByFarmer[farmerId]) {
        itemsByFarmer[farmerId] = [];
      }

      itemsByFarmer[farmerId].push({
        product: product._id,
        quantity: cartItem.quantity,
        price: product.price,
        name: product.name
      });

      // Update product quantity
      product.quantity -= cartItem.quantity;
      await product.save({ session });
    }

    // Create order for each farmer
    const orders = [];
    for (const farmerId in itemsByFarmer) {
      const farmerItems = itemsByFarmer[farmerId];
      
      // Calculate total amount for this farmer's items
      const farmerTotal = farmerItems.reduce((total, item) => {
        return total + (item.price * item.quantity);
      }, 0);

      const order = new Order({
        consumer: req.user.id,
        farmer: farmerId,
        items: farmerItems,
        totalAmount: farmerTotal,
        paymentMethod,
        shippingDetails,
        notes
      });

      await order.save({ session });
      orders.push(order);
    }

    // Clear the cart
    cart.items = [];
    await cart.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json(orders);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error(err.message);
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router; 