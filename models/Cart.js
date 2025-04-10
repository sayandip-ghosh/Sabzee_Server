const mongoose = require('mongoose');

// Cart item schema (subdocument)
const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  }
}, { timestamps: true });

// Cart schema
const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true // One cart per user
  },
  items: [cartItemSchema],
  total: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

// Pre-save middleware to calculate total
cartSchema.pre('save', async function(next) {
  try {
    if (this.isModified('items')) {
      // Calculate total by summing up the price * quantity for each item
      const populatedCart = await mongoose.model('Cart')
        .findOne({ _id: this._id })
        .populate('items.product', 'price');
        
      if (populatedCart && populatedCart.items && populatedCart.items.length > 0) {
        this.total = populatedCart.items.reduce((sum, item) => {
          if (item.product && item.product.price) {
            return sum + (item.product.price * item.quantity);
          }
          return sum;
        }, 0);
      } else {
        this.total = 0;
      }
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Method to remove item from cart
cartSchema.methods.removeItem = function(itemId) {
  this.items = this.items.filter(item => item._id.toString() !== itemId);
  return this.save();
};

module.exports = mongoose.model('Cart', cartSchema); 