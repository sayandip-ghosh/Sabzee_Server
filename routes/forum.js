const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const ForumPost = require('../models/ForumPost');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// Apply protect and authorize middleware to all routes
router.use(protect);
router.use(authorize('farmer'));

// @route   POST api/forum
// @desc    Create a new forum post
// @access  Private (Farmers only)
router.post('/',
  [
    check('title', 'Title is required').not().isEmpty().trim(),
    check('content', 'Content is required').not().isEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { title, content } = req.body;

      const newPost = new ForumPost({
        title,
        content,
        author: req.user.id
      });

      const post = await newPost.save();
      await post.populate('author', 'name profileImage role');
      
      res.status(201).json({ post });
    } catch (err) {
      console.error('Error in post creation:', err.message);
      res.status(500).json({ message: 'Server Error' });
    }
  }
);

// @route   GET api/forum
// @desc    Get all forum posts
// @access  Private (Farmers only)
router.get('/', async (req, res) => {
  try {
    const { sort = '-createdAt', page = 1, limit = 10 } = req.query;

    const posts = await ForumPost.find()
      .sort(sort)
      .skip((page - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate('author', 'name profileImage role');

    const total = await ForumPost.countDocuments();

    res.json({
      posts,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      total
    });
  } catch (err) {
    console.error('Error fetching posts:', err.message);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET api/forum/:id
// @desc    Get forum post by ID
// @access  Private (Farmers only)
router.get('/:id', async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.id)
      .populate('author', 'name profileImage role')
      .populate('comments.author', 'name profileImage role');

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    res.json({ post });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Post not found' });
    }
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   PUT api/forum/:id
// @desc    Update a forum post
// @access  Private (Farmers only)
router.put('/:id',
  [
    check('title', 'Title is required').optional().not().isEmpty(),
    check('content', 'Content is required').optional().not().isEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      let post = await ForumPost.findById(req.params.id);

      if (!post) {
        return res.status(404).json({ message: 'Post not found' });
      }

      if (post.author.toString() !== req.user.id) {
        return res.status(401).json({ message: 'Not authorized to update this post' });
      }

      post = await ForumPost.findByIdAndUpdate(
        req.params.id,
        { $set: req.body },
        { new: true }
      ).populate('author', 'name profileImage role');

      res.json({ post });
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ message: 'Server Error' });
    }
  }
);

// @route   DELETE api/forum/:id
// @desc    Delete a forum post
// @access  Private (Farmers only)
router.delete('/:id', async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (post.author.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized to delete this post' });
    }

    await post.deleteOne();
    res.json({ message: 'Post removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Post not found' });
    }
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   POST api/forum/:id/comments
// @desc    Add a comment to a post
// @access  Private (Farmers only)
router.post('/:id/comments',
  [
    check('content', 'Comment content is required').not().isEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const post = await ForumPost.findById(req.params.id);

      if (!post) {
        return res.status(404).json({ message: 'Post not found' });
      }

      const newComment = {
        content: req.body.content,
        author: req.user.id
      };

      post.comments.unshift(newComment);
      await post.save();
      
      const populatedPost = await ForumPost.findById(req.params.id)
        .populate('comments.author', 'name profileImage role');
        
      const addedComment = populatedPost.comments[0];
      
      res.json({ comment: addedComment });
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ message: 'Server Error' });
    }
  }
);

// @route   DELETE api/forum/:id/comments/:commentId
// @desc    Delete a comment
// @access  Private (Farmers only)
router.delete('/:id/comments/:commentId', async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const comment = post.comments.find(
      comment => comment._id.toString() === req.params.commentId
    );

    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    if (comment.author.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized to delete this comment' });
    }

    post.comments = post.comments.filter(
      comment => comment._id.toString() !== req.params.commentId
    );
    
    await post.save();
    res.json({ message: 'Comment removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   POST api/forum/:id/like
// @desc    Like/Unlike a post
// @access  Private (Farmers only)
router.post('/:id/like', async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const likeIndex = post.likes.findIndex(like => like.toString() === req.user.id);

    if (likeIndex === -1) {
      // Like the post
      post.likes.push(req.user.id);
    } else {
      // Unlike the post
      post.likes.splice(likeIndex, 1);
    }

    await post.save();
    res.json({ likes: post.likes });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router; 