const express = require('express');
const router = express.Router();
const axios = require('axios');
const { check, validationResult } = require('express-validator');
const Prediction = require('../models/Prediction');
const { protect, authorize } = require('../middleware/auth');

// @route   POST api/predictions
// @desc    Get crop disease prediction from AI model
// @access  Private (Farmers only)
router.post('/',
  protect,
  authorize('farmer'),
  [
    check('imageUrl', 'Image URL is required').isURL()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { imageUrl } = req.body;

      // Send request to Flask AI server
      const flaskResponse = await axios.post('http://localhost:5000/predict', {
        imageUrl
      });

      const { prediction, confidence } = flaskResponse.data;

      // Create and save prediction document
      const predictionDoc = new Prediction({
        farmerId: req.user.id,
        imageUrl,
        prediction,
        confidence
      });

      await predictionDoc.save();

      res.json(predictionDoc);
    } catch (err) {
      console.error('Prediction Error:', err);
      
      if (err.response) {
        // Error from Flask server
        return res.status(err.response.status).json({
          message: 'AI Service Error',
          error: err.response.data
        });
      }

      if (err.code === 'ECONNREFUSED') {
        return res.status(503).json({
          message: 'AI Service Unavailable',
          error: 'Could not connect to the AI service'
        });
      }

      res.status(500).json({ message: 'Server Error' });
    }
  }
);

// @route   GET api/predictions
// @desc    Get farmer's prediction history
// @access  Private (Farmers only)
router.get('/',
  protect,
  authorize('farmer'),
  async (req, res) => {
    try {
      const predictions = await Prediction.find({ farmerId: req.user.id })
        .sort({ createdAt: -1 });

      res.json(predictions);
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ message: 'Server Error' });
    }
  }
);

// @route   GET api/predictions/:id
// @desc    Get specific prediction
// @access  Private (Farmers only)
router.get('/:id',
  protect,
  authorize('farmer'),
  async (req, res) => {
    try {
      const prediction = await Prediction.findById(req.params.id);

      if (!prediction) {
        return res.status(404).json({ message: 'Prediction not found' });
      }

      // Check if the farmer owns this prediction
      if (prediction.farmerId.toString() !== req.user.id) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      res.json(prediction);
    } catch (err) {
      console.error(err.message);
      if (err.kind === 'ObjectId') {
        return res.status(404).json({ message: 'Prediction not found' });
      }
      res.status(500).json({ message: 'Server Error' });
    }
  }
);

module.exports = router; 