const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { protect, authorize } = require('../middleware/auth');

// Set up multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit
  },
});

// @route   GET api/farmers/me
// @desc    Get current farmer's profile
// @access  Private (Farmer only)
router.get('/me',
  protect,
  authorize('farmer'),
  async (req, res) => {
    try {
      const farmer = await User.findById(req.user.id)
        .select('-password')
        .populate('ratings');

      if (!farmer) {
        return res.status(404).json({ message: 'Farmer not found' });
      }

      res.json(farmer);
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ message: 'Server Error' });
    }
  }
);

// @route   PUT api/farmers/me
// @desc    Update farmer profile
// @access  Private (Farmer only)
router.put('/me',
  protect,
  authorize('farmer'),
  upload.single('profileImage'),
  [
    check('name', 'Name is required').not().isEmpty(),
    check('contactNumber', 'Contact number is required').not().isEmpty(),
    check('farmDetails', 'Farm details are required').not().isEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      let farmDetails;
      try {
        farmDetails = JSON.parse(req.body.farmDetails);
      } catch (err) {
        return res.status(400).json({ message: 'Invalid farm details format' });
      }

      const updateData = {
        name: req.body.name,
        contactNumber: req.body.contactNumber,
        farmDetails: farmDetails
      };

      // Handle profile image upload if provided
      if (req.file) {
        // Delete old profile image from Cloudinary if exists
        const currentUser = await User.findById(req.user.id);
        if (currentUser.profileImage) {
          const publicId = currentUser.profileImage.split('/').pop().split('.')[0];
          await cloudinary.uploader.destroy(publicId);
        }

        // Upload new profile image
        const base64Data = req.file.buffer.toString('base64');
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload(
            `data:${req.file.mimetype};base64,${base64Data}`,
            { folder: 'farmer-profiles' },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
        });

        updateData.profileImage = result.secure_url;
      }

      const farmer = await User.findByIdAndUpdate(
        req.user.id,
        { $set: updateData },
        { new: true }
      ).select('-password');

      res.json(farmer);
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ message: 'Server Error' });
    }
  }
);

// @route   GET api/farmers/analytics
// @desc    Get farmer's analytics
// @access  Private (Farmer only)
router.get('/analytics',
  protect,
  authorize('farmer'),
  async (req, res) => {
    try {
      // Get total products
      const totalProducts = await Product.countDocuments({ farmer: req.user.id });

      // Get total orders
      const totalOrders = await Order.countDocuments({ farmer: req.user.id });

      // Get total revenue
      const orders = await Order.find({ 
        farmer: req.user.id,
        status: { $in: ['delivered', 'completed'] }
      });
      const totalRevenue = orders.reduce((acc, order) => acc + order.totalAmount, 0);

      // Get product performance
      const products = await Product.find({ farmer: req.user.id })
        .select('name totalSales');

      // Get recent orders
      const recentOrders = await Order.find({ farmer: req.user.id })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('consumer', 'name')
        .populate('items.product', 'name');

      // Get monthly sales data
      const monthlyData = await Order.aggregate([
        {
          $match: {
            farmer: req.user.id,
            status: { $in: ['delivered', 'completed'] }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            totalSales: { $sum: '$totalAmount' },
            orderCount: { $sum: 1 }
          }
        },
        {
          $sort: { '_id.year': -1, '_id.month': -1 }
        }
      ]);

      res.json({
        totalProducts,
        totalOrders,
        totalRevenue,
        productPerformance: products,
        recentOrders,
        monthlyData
      });
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ message: 'Server Error' });
    }
  }
);

// @route   GET api/farmers/nearby
// @desc    Get nearby farmers
// @access  Public
router.get('/nearby',
  async (req, res) => {
    try {
      const { longitude, latitude, maxDistance = 10000 } = req.query;

      if (!longitude || !latitude) {
        return res.status(400).json({ message: 'Location coordinates are required' });
      }

      const farmers = await User.find({
        role: 'farmer',
        'farmDetails.location': {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [parseFloat(longitude), parseFloat(latitude)]
            },
            $maxDistance: parseInt(maxDistance)
          }
        }
      })
      .select('name farmDetails ratings averageRating')
      .populate('ratings');

      res.json(farmers);
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ message: 'Server Error' });
    }
  }
);

module.exports = router; 