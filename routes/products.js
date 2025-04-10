const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const Product = require('../models/Product');
const { protect, authorize } = require('../middleware/auth');

// Set up multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// @route   POST api/products
// @desc    Create a new product
// @access  Private (Farmers only)
router.post('/',
  protect,
  authorize('farmer'),
  upload.array('images', 5),
  [
    check('name', 'Name is required').not().isEmpty(),
    check('description', 'Description is required').not().isEmpty(),
    check('category', 'Category is required').isIn(['vegetables', 'fruits', 'grains', 'dairy', 'other']),
    check('price', 'Price is required').isNumeric(),
    check('unit', 'Unit is required').isIn(['kg', 'gram', 'piece', 'dozen', 'liter']),
    check('quantity', 'Quantity is required').isNumeric(),
    check('harvestDate', 'Harvest date is required').not().isEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const {
        name,
        description,
        category,
        price,
        unit,
        quantity,
        harvestDate
      } = req.body;

      // Upload images to Cloudinary
      const imagePromises = req.files.map(file => {
        return new Promise((resolve, reject) => {
          const base64Data = file.buffer.toString('base64');
          cloudinary.uploader.upload(`data:${file.mimetype};base64,${base64Data}`,
            { folder: 'products' },
            (error, result) => {
              if (error) reject(error);
              else resolve({ url: result.secure_url, public_id: result.public_id });
            }
          );
        });
      });

      const uploadedImages = await Promise.all(imagePromises);

      const product = new Product({
        farmer: req.user.id,
        name,
        description,
        category,
        price,
        unit,
        quantity,
        images: uploadedImages,
        harvestDate: new Date(harvestDate)
      });

      await product.save();
      res.status(201).json(product);
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ message: 'Server Error' });
    }
  }
);

// @route   GET api/products
// @desc    Get all products with filters
// @access  Public
router.get('/', async (req, res) => {
  try {
    const {
      category,
      minPrice,
      maxPrice,
      farmer,
      search,
      status,
      sort,
      page = 1,
      limit = 10
    } = req.query;

    const query = {};

    if (category) query.category = category;
    if (farmer) query.farmer = farmer;
    if (status) query.status = status;
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }
    if (search) {
      query.$text = { $search: search };
    }

    const sortOptions = {};
    if (sort) {
      const [field, order] = sort.split(':');
      sortOptions[field] = order === 'desc' ? -1 : 1;
    }

    const products = await Product.find(query)
      .populate('farmer', 'name farmDetails')
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Product.countDocuments(query);

    res.json({
      products,
      page: Number(page),
      pages: Math.ceil(total / limit),
      total
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET api/products/:id
// @desc    Get product by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('farmer', 'name farmDetails ratings averageRating');

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(product);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   PUT api/products/:id
// @desc    Update product
// @access  Private (Farmer only)
router.put('/:id',
  protect,
  authorize('farmer'),
  [
    check('name', 'Name is required').optional().not().isEmpty(),
    check('description', 'Description is required').optional().not().isEmpty(),
    check('category', 'Invalid category').optional().isIn(['vegetables', 'fruits', 'grains', 'dairy', 'other']),
    check('price', 'Price must be a number').optional().isNumeric(),
    check('unit', 'Invalid unit').optional().isIn(['kg', 'gram', 'piece', 'dozen', 'liter']),
    check('quantity', 'Quantity must be a number').optional().isNumeric(),
    check('harvestDate', 'Invalid harvest date').optional().isISO8601()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      let product = await Product.findById(req.params.id);

      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      // Check if the farmer owns the product
      if (product.farmer.toString() !== req.user.id) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      // Update the product
      const updateData = { ...req.body };
      if (updateData.harvestDate) {
        updateData.harvestDate = new Date(updateData.harvestDate);
      }

      product = await Product.findByIdAndUpdate(
        req.params.id,
        { $set: updateData },
        { new: true }
      );

      res.json(product);
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ message: 'Server Error' });
    }
  }
);

// @route   DELETE api/products/:id
// @desc    Delete product
// @access  Private (Farmer only)
router.delete('/:id',
  protect,
  authorize('farmer'),
  async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);

      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      // Check if the farmer owns the product
      if (product.farmer.toString() !== req.user.id) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      // Delete images from Cloudinary
      const deletePromises = product.images.map(image => {
        return new Promise((resolve, reject) => {
          cloudinary.uploader.destroy(image.public_id, (error, result) => {
            if (error) reject(error);
            else resolve(result);
          });
        });
      });

      await Promise.all(deletePromises);
      await Product.deleteOne({ _id: product._id });

      res.json({ message: 'Product removed' });
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ message: 'Server Error' });
    }
  }
);

// @route   POST api/products/:id/rate
// @desc    Rate a product
// @access  Private (Consumer only)
router.post('/:id/rate',
  protect,
  authorize('consumer'),
  [
    check('rating', 'Rating must be between 1 and 5').isInt({ min: 1, max: 5 }),
    check('review', 'Review is required').not().isEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const product = await Product.findById(req.params.id);

      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      // Check if user has already rated
      const alreadyRated = product.ratings.find(
        rating => rating.user.toString() === req.user.id
      );

      if (alreadyRated) {
        // Update existing rating
        alreadyRated.rating = req.body.rating;
        alreadyRated.review = req.body.review;
        alreadyRated.date = Date.now();
      } else {
        // Add new rating
        product.ratings.push({
          user: req.user.id,
          rating: req.body.rating,
          review: req.body.review
        });
      }

      // Calculate average rating
      const totalRatings = product.ratings.reduce((acc, item) => acc + item.rating, 0);
      product.averageRating = totalRatings / product.ratings.length;

      await product.save();

      res.json(product);
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ message: 'Server Error' });
    }
  }
);

module.exports = router; 