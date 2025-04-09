const mongoose = require('mongoose');

const yieldPredictionSchema = new mongoose.Schema({
  farmerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  location: {
    lat: {
      type: Number,
      required: true
    },
    lng: {
      type: Number,
      required: true
    }
  },
  crop: {
    type: String,
    required: true
  },
  season: {
    type: String,
    required: true,
    enum: ['Rabi', 'Kharif', 'Zaid']
  },
  area_of_land: {
    type: Number,
    required: true
  },
  soil_type: {
    type: String,
    required: true
  },
  weather: {
    temperature: Number,
    humidity: Number,
    rainfall: Number
  },
  predicted_yield_kg: {
    type: Number,
    required: true
  },
  suggested_crops: [{
    type: String
  }],
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },
  isMock: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('YieldPrediction', yieldPredictionSchema); 