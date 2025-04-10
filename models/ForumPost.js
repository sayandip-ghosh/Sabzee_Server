const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

const forumPostSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  comments: [commentSchema],
  commentCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Middleware to update comment count
forumPostSchema.pre('save', function(next) {
  if (this.isModified('comments')) {
    this.commentCount = this.comments.length;
  }
  next();
});

module.exports = mongoose.model('ForumPost', forumPostSchema); 