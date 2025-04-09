const express = require('express');
const router = express.Router();
const axios = require('axios');
const { check, validationResult } = require('express-validator');
const Prediction = require('../models/Prediction');
const { protect, authorize } = require('../middleware/auth');

// Configuration
const FLASK_API_URL = 'http://localhost:5001';
const USE_MOCK_API = true; // Set to true to use mock data if Python API is not available

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
      let predictionResult;
      let isMockPrediction = false;

      try {
        // Try to connect to the Python Flask API
        console.log(`Sending request to ${FLASK_API_URL}/predict with image URL: ${imageUrl}`);
        const flaskResponse = await axios.post(`${FLASK_API_URL}/predict`, {
          image_url: imageUrl
        }, { timeout: 15000 }); // 15-second timeout

        // Check if the response is from the mock prediction in Python API
        isMockPrediction = flaskResponse.data.is_mock === true;
        
        if (isMockPrediction) {
          console.log('Received mock prediction from Python API');
        }

        predictionResult = {
          prediction: `${flaskResponse.data.crop} - ${flaskResponse.data.prediction}`,
          confidence: flaskResponse.data.confidence,
          isMock: isMockPrediction
        };
        console.log('Received prediction from Python API:', predictionResult);
      } catch (apiError) {
        console.error('Error connecting to Python API:', apiError.message);
        
        if (USE_MOCK_API) {
          // Fallback to mock prediction if Python API is not available
          console.log('Falling back to JavaScript mock prediction');
          const mockResult = generateMockDiseasePrediction(imageUrl);
          predictionResult = {
            prediction: mockResult.prediction,
            confidence: mockResult.confidence,
            isMock: true
          };
          isMockPrediction = true;
        } else {
          // Re-throw the error if we don't want to use mock data
          throw apiError;
        }
      }

      // Create and save prediction document
      const predictionDoc = new Prediction({
        farmerId: req.user.id,
        imageUrl,
        prediction: predictionResult.prediction,
        confidence: predictionResult.confidence,
        isMock: isMockPrediction
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

// Mock ML model for crop disease detection (fallback if Python API is not available)
function generateMockDiseasePrediction(imageUrl) {
  // Common crop diseases with their descriptions and treatments
  const cropDiseases = {
    'Healthy': {
      description: 'The plant appears to be healthy with no signs of disease.',
      treatment: 'Continue regular maintenance and monitoring.'
    },
    'Bacterial Leaf Blight': {
      description: 'Yellow to white streaks on leaves, starting from the leaf tip and extending down the leaf blade.',
      treatment: 'Use resistant varieties, apply copper-based bactericides, and ensure proper field drainage.'
    },
    'Blast Disease': {
      description: 'Diamond-shaped lesions on leaves, stems, and panicles. Lesions have a gray center with a brown margin.',
      treatment: 'Use resistant varieties, apply fungicides, and maintain proper spacing between plants.'
    },
    'Brown Spot': {
      description: 'Small, circular to oval brown spots on leaves, which may coalesce to form larger lesions.',
      treatment: 'Use certified seeds, apply fungicides, and maintain proper field sanitation.'
    },
    'Downy Mildew': {
      description: 'Yellow to brown patches on the upper surface of leaves with a white to grayish downy growth on the lower surface.',
      treatment: 'Improve air circulation, apply fungicides, and remove infected plants.'
    },
    'Powdery Mildew': {
      description: 'White to grayish powdery growth on the upper surface of leaves, which may spread to stems and fruits.',
      treatment: 'Improve air circulation, apply sulfur-based fungicides, and remove infected plant parts.'
    },
    'Rust': {
      description: 'Small, circular to oval, reddish-brown to black pustules on leaves, stems, and fruits.',
      treatment: 'Use resistant varieties, apply fungicides, and maintain proper spacing between plants.'
    },
    'Septoria Leaf Spot': {
      description: 'Small, circular to oval, gray to brown spots with a dark brown margin on leaves.',
      treatment: 'Remove infected leaves, apply fungicides, and maintain proper field sanitation.'
    },
    'Verticillium Wilt': {
      description: 'Yellowing and wilting of leaves, starting from the lower leaves and progressing upward.',
      treatment: 'Use resistant varieties, practice crop rotation, and maintain proper soil moisture.'
    },
    'Fusarium Wilt': {
      description: 'Yellowing and wilting of leaves, starting from the lower leaves and progressing upward. Vascular tissue may be discolored.',
      treatment: 'Use resistant varieties, practice crop rotation, and maintain proper soil moisture.'
    }
  };

  // Extract crop type from image URL (in a real implementation, this would be done by the ML model)
  // For mock purposes, we'll randomly select a crop type
  const cropTypes = ['Rice', 'Wheat', 'Maize', 'Tomato', 'Potato', 'Cotton', 'Sugarcane'];
  const cropType = cropTypes[Math.floor(Math.random() * cropTypes.length)];
  
  // Determine if the plant is healthy or has a disease
  // In a real implementation, this would be based on the ML model's analysis
  const isHealthy = Math.random() > 0.7; // 30% chance of being healthy
  
  let prediction;
  let confidence;
  
  if (isHealthy) {
    prediction = 'Healthy';
    confidence = 0.85 + Math.random() * 0.1; // 85-95% confidence for healthy plants
  } else {
    // Select a random disease (excluding 'Healthy')
    const diseaseKeys = Object.keys(cropDiseases).filter(key => key !== 'Healthy');
    const randomDisease = diseaseKeys[Math.floor(Math.random() * diseaseKeys.length)];
    prediction = randomDisease;
    confidence = 0.7 + Math.random() * 0.2; // 70-90% confidence for diseased plants
  }
  
  // Add crop type to the prediction
  prediction = `${cropType} - ${prediction}`;
  
  return {
    prediction,
    confidence
  };
}

module.exports = router; 