const express = require('express');
const router = express.Router();
const DataController = require('../controller/data.controller');

const dataController = new DataController();

// Get collections list
router.get('/collections', (req, res) => dataController.getCollections(req, res));

// Get data from a specific collection with pagination, sorting, filtering
router.post('/query/:collection', (req, res) => dataController.queryCollection(req, res));

// Global search across all collections
router.post('/search', (req, res) => dataController.globalSearch(req, res));

module.exports = router;