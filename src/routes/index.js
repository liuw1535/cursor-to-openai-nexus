const express = require('express');
const router = express.Router();
const v1Routes = require('./v1');
const anthropicRoutes = require('./anthropic');
router.use('/v1/messages', anthropicRoutes);

// OpenAI v1 API routes
router.use('/v1', v1Routes);

// Anthropic API routes

module.exports = router;
