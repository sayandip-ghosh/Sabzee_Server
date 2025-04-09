const express = require('express');
const router = express.Router();
const axios = require('axios');
const { check, validationResult } = require('express-validator');
const YieldPrediction = require('../models/YieldPrediction');
const { protect, authorize } = require('../middleware/auth');

// Configuration
const FLASK_API_URL = 'http://localhost:5002';
const USE_MOCK_API = true; // Set to true to use mock data if Python API is not available

// @route   POST api/yield-predictions
// @desc    Get crop yield prediction and crop recommendations from AI model
// @access  Private (Farmers only)
router.post('/',
  protect,
  authorize('farmer'),
  [
    check('latitude', 'Latitude is required').isFloat(),
    check('longitude', 'Longitude is required').isFloat(),
    check('crop', 'Crop name is required').notEmpty(),
    check('season', 'Season is required').isIn(['Rabi', 'Kharif', 'Zaid']),
    check('area_of_land', 'Land area is required').isNumeric(),
    check('soil_type', 'Soil type is required').notEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { 
        latitude, 
        longitude, 
        crop, 
        season, 
        area_of_land, 
        soil_type 
      } = req.body;

      let predictionResult;
      let isMockPrediction = false;

      try {
        // Try to connect to the Python Flask API
        console.log(`Sending request to ${FLASK_API_URL}/predict with data:`, req.body);
        const flaskResponse = await axios.post(`${FLASK_API_URL}/predict`, {
          latitude,
          longitude,
          crop,
          season,
          area_of_land,
          soil_type
        }, { timeout: 15000 }); // 15-second timeout

        // Check if the response is from the mock prediction in Python API
        isMockPrediction = flaskResponse.data.is_mock === true;
        if (isMockPrediction) {
          console.log('Received feature-based prediction from Python API');
        } else {
          console.log('Received ML-based prediction from Python API');
        }

        predictionResult = {
          predicted_yield_kg: flaskResponse.data.predicted_yield_kg,
          suggested_crops: flaskResponse.data.suggested_crops,
          confidence: flaskResponse.data.confidence,
          weather: flaskResponse.data.weather
        };

        console.log('Received prediction from Python API:', predictionResult);
      } catch (apiError) {
        console.error('Error connecting to Python API:', apiError.message);
        
        if (USE_MOCK_API) {
          // Fallback to mock prediction if Python API is not available
          console.log('Falling back to JavaScript mock prediction');
          
          // Get weather data
          const weatherData = await getWeatherData(latitude, longitude);
          
          // Generate mock prediction
          const mockResult = generateMockPrediction(crop, season, area_of_land, soil_type, weatherData);
          
          predictionResult = {
            predicted_yield_kg: mockResult.predicted_yield_kg,
            suggested_crops: mockResult.suggested_crops,
            confidence: mockResult.confidence,
            weather: weatherData
          };
          
          isMockPrediction = true;
        } else {
          // Re-throw the error if we don't want to use mock data
          throw apiError;
        }
      }

      // Create and save yield prediction document
      const yieldPrediction = new YieldPrediction({
        farmerId: req.user.id,
        location: {
          lat: latitude,
          lng: longitude
        },
        crop,
        season,
        area_of_land,
        soil_type,
        weather: predictionResult.weather,
        predicted_yield_kg: predictionResult.predicted_yield_kg,
        suggested_crops: predictionResult.suggested_crops,
        confidence: predictionResult.confidence,
        isMock: isMockPrediction
      });

      await yieldPrediction.save();

      res.json(yieldPrediction);
    } catch (err) {
      console.error('Yield Prediction Error:', err);
      
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

// @route   GET api/yield-predictions
// @desc    Get farmer's yield prediction history
// @access  Private (Farmers only)
router.get('/',
  protect,
  authorize('farmer'),
  async (req, res) => {
    try {
      const yieldPredictions = await YieldPrediction.find({ farmerId: req.user.id })
        .sort({ createdAt: -1 });

      res.json(yieldPredictions);
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ message: 'Server Error' });
    }
  }
);

// @route   GET api/yield-predictions/:id
// @desc    Get specific yield prediction
// @access  Private (Farmers only)
router.get('/:id',
  protect,
  authorize('farmer'),
  async (req, res) => {
    try {
      const yieldPrediction = await YieldPrediction.findById(req.params.id);

      if (!yieldPrediction) {
        return res.status(404).json({ message: 'Yield prediction not found' });
      }

      // Check if the farmer owns this prediction
      if (yieldPrediction.farmerId.toString() !== req.user.id) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      res.json(yieldPrediction);
    } catch (err) {
      console.error(err.message);
      if (err.kind === 'ObjectId') {
        return res.status(404).json({ message: 'Yield prediction not found' });
      }
      res.status(500).json({ message: 'Server Error' });
    }
  }
);

// Helper function to get weather data (in production, use a real weather API)
async function getWeatherData(lat, lng) {
  // In a real application, this would make a call to a weather API
  // This is a simplified mock version
  try {
    // For a real implementation:
    // const response = await axios.get(`https://weather-api.example.com?lat=${lat}&lng=${lng}`);
    // return response.data;

    // Mock data for demonstration
    return {
      temperature: Math.round(20 + Math.random() * 15), // 20-35°C
      humidity: Math.round(40 + Math.random() * 40),    // 40-80%
      rainfall: Math.round(50 + Math.random() * 150)    // 50-200mm
    };
  } catch (error) {
    console.error('Weather data fetch error:', error);
    // Return default values if weather API fails
    return {
      temperature: 25,
      humidity: 60,
      rainfall: 100
    };
  }
}

// Mock AI prediction function
function generateMockPrediction(crop, season, area_of_land, soil_type, weather) {
  // Base yield factors for different crops (kg per hectare)
  const cropBaseYields = {
    'Rice': 4000,
    'Wheat': 3500,
    'Maize': 5000,
    'Sugarcane': 70000,
    'Cotton': 500,
    'Soybeans': 2500,
    'Potatoes': 25000,
    'Tomatoes': 40000,
    'Onions': 20000,
    'Chillies': 15000,
    'Default': 3000
  };

  // Season multipliers
  const seasonMultipliers = {
    'Rabi': 1.2,  // Winter crops (Oct-Mar)
    'Kharif': 1.0, // Monsoon crops (Jun-Sep)
    'Zaid': 0.8   // Summer crops (Mar-Jun)
  };

  // Soil type multipliers
  const soilMultipliers = {
    'Loamy': 1.2,
    'Clay': 1.0,
    'Sandy': 0.8,
    'Silt': 1.1,
    'Black': 1.3,
    'Red': 0.9
  };

  // Weather impact factors
  const getWeatherMultiplier = (weather) => {
    let multiplier = 1.0;
    
    // Temperature impact (optimal range: 20-30°C)
    if (weather.temperature < 15) {
      multiplier *= 0.7;
    } else if (weather.temperature > 35) {
      multiplier *= 0.8;
    }
    
    // Humidity impact (optimal range: 50-70%)
    if (weather.humidity < 30) {
      multiplier *= 0.9;
    } else if (weather.humidity > 90) {
      multiplier *= 0.85;
    }
    
    // Rainfall impact (optimal range: 100-150mm)
    if (weather.rainfall < 50) {
      multiplier *= 0.7;
    } else if (weather.rainfall > 300) {
      multiplier *= 0.8;
    }
    
    return multiplier;
  };

  // Get base yield for the crop or default if not found
  const baseYield = cropBaseYields[crop] || cropBaseYields['Default'];
  
  // Calculate multipliers
  const seasonMultiplier = seasonMultipliers[season] || 1.0;
  const soilMultiplier = soilMultipliers[soil_type] || 1.0;
  const weatherMultiplier = getWeatherMultiplier(weather);
  
  // Calculate predicted yield (kg)
  const predicted_yield_kg = Math.round(
    baseYield * 
    seasonMultiplier * 
    soilMultiplier * 
    weatherMultiplier * 
    (parseFloat(area_of_land) / 10) // Convert area to hectares (assuming input is in acres)
  );
  
  // Generate confidence score (0.7-0.95)
  const confidence = 0.7 + Math.random() * 0.25;
  
  // Generate suggested alternative crops
  const allCrops = Object.keys(cropBaseYields).filter(c => c !== 'Default');
  const suggested_crops = [];
  
  // Add 2-3 random crops as suggestions
  const numSuggestions = Math.floor(2 + Math.random() * 2);
  for (let i = 0; i < numSuggestions; i++) {
    const randomIndex = Math.floor(Math.random() * allCrops.length);
    const suggestedCrop = allCrops[randomIndex];
    if (suggestedCrop !== crop && !suggested_crops.includes(suggestedCrop)) {
      suggested_crops.push(suggestedCrop);
    }
  }
  
  return {
    predicted_yield_kg,
    suggested_crops,
    confidence
  };
}

module.exports = router; 