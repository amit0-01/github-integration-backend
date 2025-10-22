const express = require('express');
const router = express.Router();
const GithubController = require('../controller/github.controller');

const githubController = new GithubController();

// OAuth routes
router.get('/auth-url', (req, res) => githubController.getAuthUrl(req, res));
router.get('/callback', (req, res) => githubController.handleCallback(req, res));

// Integration management
router.get('/status/:userId', (req, res) => githubController.getIntegrationStatus(req, res));
router.delete('/integration/:userId', (req, res) => githubController.removeIntegration(req, res));
router.post('/resync/:userId', (req, res) => githubController.resyncIntegration(req, res));

module.exports = router;