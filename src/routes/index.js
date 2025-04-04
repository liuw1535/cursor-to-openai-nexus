const express = require('express');
const router = express.Router();
const v1Routes = require('./v1');
const anthropicRoutes = require('./anthropic');

// OpenAI v1 API routes
router.use('/v1', v1Routes);

// Anthropic API routes
router.use('/v1/messages', anthropicRoutes);

module.exports = router;
