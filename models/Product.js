const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  farmer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ['vegetables', 'fruits', 'grains', 'dairy', 'other']
  },
  price: {
    type: Number,
    required: true
  },
  unit: {
    type: String,
    required: true,
    enum: ['kg', 'gram', 'piece', 'dozen', 'liter']
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  images: [{
    url: String,
    public_id: String
  }],
  harvestDate: {
    type: Date,
    required: true
  },
  expiryDate: {
    type: Date
  },
  organic: {
    type: Boolean,
    default: false
  },
  certifications: [{
    name: String,
    certificationNumber: String,
    issuedDate: Date,
    expiryDate: Date
  }],
  status: {
    type: String,
    enum: ['available', 'sold_out'],
    default: 'available'
  },
  ratings: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rating: Number,
    review: String,
    date: {
      type: Date,
      default: Date.now
    }
  }],
  averageRating: {
    type: Number,
    default: 0
  },
  totalSales: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for text search
productSchema.index({ 
  name: 'text', 
  description: 'text', 
  category: 'text' 
});

// Pre-save middleware to update status based on quantity
productSchema.pre('save', function(next) {
  this.status = this.quantity > 0 ? 'available' : 'sold_out';
  next();
});

module.exports = mongoose.model('Product', productSchema); 