const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const mongoose = require('mongoose');

const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { protect, authorize } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(protect);
// Restrict cart routes to consumers only
router.use(authorize('consumer'));

/**
 * @route   GET /api/cart
 * @desc    Get user's cart
 * @access  Private (Consumer only)
 */
router.get('/', async (req, res) => {
  try {
    // Find the user's cart, or create a new one if it doesn't exist
    let cart = await Cart.findOne({ user: req.user.id })
      .populate({
        path: 'items.product',
        select: 'name price images unit organic farmer',
        populate: {
          path: 'farmer',
          select: 'name'
        }
      });

    if (!cart) {
      cart = {
        user: req.user.id,
        items: [],
        total: 0
      };
    }

    res.json(cart);
  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/cart
 * @desc    Add item to cart
 * @access  Private (Consumer only)
 */
router.post('/', [
  check('productId', 'Product ID is required').notEmpty(),
  check('quantity', 'Quantity must be at least 1').isInt({ min: 1 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { productId, quantity } = req.body;

  try {
    // Check if product exists and is available
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (product.status !== 'available') {
      return res.status(400).json({ message: 'Product is not available' });
    }

    if (product.quantity < quantity) {
      return res.status(400).json({ message: 'Not enough stock available' });
    }

    // Find or create user's cart
    let cart = await Cart.findOne({ user: req.user.id });
    
    if (!cart) {
      cart = new Cart({
        user: req.user.id,
        items: [],
        total: 0
      });
    }

    // Check if product is already in the cart
    const itemIndex = cart.items.findIndex(item => 
      item.product.toString() === productId
    );

    if (itemIndex > -1) {
      // Update quantity if product is already in cart
      cart.items[itemIndex].quantity = quantity;
    } else {
      // Add new item to cart
      cart.items.push({
        product: productId,
        quantity
      });
    }

    await cart.save();

    // Populate cart for response
    const populatedCart = await Cart.findById(cart._id)
      .populate({
        path: 'items.product',
        select: 'name price images unit organic farmer',
        populate: {
          path: 'farmer',
          select: 'name'
        }
      });

    res.json(populatedCart);
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   PUT /api/cart/:itemId
 * @desc    Update cart item quantity
 * @access  Private (Consumer only)
 */
router.put('/:itemId', [
  check('quantity', 'Quantity must be at least 1').isInt({ min: 1 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { itemId } = req.params;
  const { quantity } = req.body;

  try {
    // Find user's cart
    const cart = await Cart.findOne({ user: req.user.id });
    
    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    // Find the item in the cart
    const item = cart.items.id(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Item not found in cart' });
    }

    // Check product availability
    const product = await Product.findById(item.product);
    if (!product) {
      return res.status(404).json({ message: 'Product no longer exists' });
    }

    if (product.status !== 'available') {
      return res.status(400).json({ message: 'Product is not available' });
    }

    if (product.quantity < quantity) {
      return res.status(400).json({ message: 'Not enough stock available' });
    }

    // Update quantity
    item.quantity = quantity;
    await cart.save();

    // Populate cart for response
    const populatedCart = await Cart.findById(cart._id)
      .populate({
        path: 'items.product',
        select: 'name price images unit organic farmer',
        populate: {
          path: 'farmer',
          select: 'name'
        }
      });

    res.json(populatedCart);
  } catch (error) {
    console.error('Error updating cart:', error);
    
    // Handle invalid ObjectId
    if (error instanceof mongoose.Error.CastError) {
      return res.status(400).json({ message: 'Invalid item ID' });
    }
    
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   DELETE /api/cart/:itemId
 * @desc    Remove item from cart
 * @access  Private (Consumer only)
 */
router.delete('/:itemId', async (req, res) => {
  const { itemId } = req.params;

  try {
    // Find user's cart
    const cart = await Cart.findOne({ user: req.user.id });
    
    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    // Remove the item using the cart method
    await cart.removeItem(itemId);

    // Populate cart for response
    const populatedCart = await Cart.findById(cart._id)
      .populate({
        path: 'items.product',
        select: 'name price images unit organic farmer',
        populate: {
          path: 'farmer',
          select: 'name'
        }
      });

    res.json(populatedCart);
  } catch (error) {
    console.error('Error removing from cart:', error);
    
    // Handle invalid ObjectId
    if (error instanceof mongoose.Error.CastError) {
      return res.status(400).json({ message: 'Invalid item ID' });
    }
    
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 