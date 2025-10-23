const mongoose = require('mongoose');
const { Organization, Repository, Commit, PullRequest, Issue, IssueChangelog, User } = require('../models/githubdata');

class DataController {
  constructor() {
    this.collectionMap = {
      'organizations': Organization,
      'repositories': Repository,
      'commits': Commit,
      'pull-requests': PullRequest,
      'issues': Issue,
      'issue-changelogs': IssueChangelog,
      'users': User
    };
  }

  async getCollections(req, res) {
    try {
      const collections = Object.keys(this.collectionMap);
      res.json({ collections });
    } catch (error) {
      console.error('Error fetching collections:', error);
      res.status(500).json({ error: 'Failed to fetch collections' });
    }
  }

  async queryCollection(req, res) {
    try {
      const { collection } = req.params;
      const { 
        page = 1, 
        pageSize = 100, 
        sortField, 
        sortOrder = 'asc',
        filters = {},
        searchTerm = ''
      } = req.body;

      const Model = this.collectionMap[collection];
      if (!Model) {
        return res.status(404).json({ error: 'Collection not found' });
      }

      let query = {};

      if (Object.keys(filters).length > 0) {
        Object.keys(filters).forEach(key => {
          const filterValue = filters[key];
          if (filterValue !== null && filterValue !== undefined && filterValue !== '') {
            if (typeof filterValue === 'object' && filterValue.type) {
              switch (filterValue.type) {
                case 'contains':
                  query[key] = { $regex: filterValue.value, $options: 'i' };
                  break;
                case 'equals':
                  query[key] = filterValue.value;
                  break;
                case 'startsWith':
                  query[key] = { $regex: `^${filterValue.value}`, $options: 'i' };
                  break;
                case 'endsWith':
                  query[key] = { $regex: `${filterValue.value}$`, $options: 'i' };
                  break;
                case 'greaterThan':
                  query[key] = { $gt: filterValue.value };
                  break;
                case 'lessThan':
                  query[key] = { $lt: filterValue.value };
                  break;
                default:
                  query[key] = { $regex: filterValue.value, $options: 'i' };
              }
            } else {
              query[key] = { $regex: filterValue, $options: 'i' };
            }
          }
        });
      }

      if (searchTerm) {
        const sampleDoc = await Model.findOne().lean();
        if (sampleDoc) {
          const searchableFields = this.getSearchableFields(sampleDoc);
          query.$or = searchableFields.map(field => ({
            [field]: { $regex: searchTerm, $options: 'i' }
          }));
        }
      }

      const totalCount = await Model.countDocuments(query);

      let sort = {};
      if (sortField) {
        sort[sortField] = sortOrder === 'desc' ? -1 : 1;
      } else {
        sort = { createdAt: -1 };
      }

      const skip = (page - 1) * pageSize;
      const data = await Model.find(query)
        .sort(sort)
        .skip(skip)
        .limit(pageSize)
        .lean();

      let fields = [];
      if (data.length > 0) {
        fields = this.extractFields(data[0]);
      }

      res.json({
        data,
        totalCount,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(totalCount / pageSize),
        fields
      });
    } catch (error) {
      console.error('Error querying collection:', error);
      res.status(500).json({ error: 'Failed to query collection' });
    }
  }

  async globalSearch(req, res) {
    try {
      const { searchTerm, collections = [] } = req.body;

      if (!searchTerm) {
        return res.json({ results: [] });
      }

      const searchCollections = collections.length > 0 
        ? collections 
        : Object.keys(this.collectionMap);

      const results = [];

      for (const collectionName of searchCollections) {
        const Model = this.collectionMap[collectionName];
        if (!Model) continue;

        const sampleDoc = await Model.findOne().lean();
        if (!sampleDoc) continue;

        const searchableFields = this.getSearchableFields(sampleDoc);
        
        const query = {
          $or: searchableFields.map(field => ({
            [field]: { $regex: searchTerm, $options: 'i' }
          }))
        };

        const count = await Model.countDocuments(query);
        const samples = await Model.find(query).limit(5).lean();

        if (count > 0) {
          results.push({
            collection: collectionName,
            count,
            samples
          });
        }
      }

      res.json({ results });
    } catch (error) {
      console.error('Error performing global search:', error);
      res.status(500).json({ error: 'Failed to perform global search' });
    }
  }

  extractFields(obj, prefix = '') {
    let fields = [];
    
    for (const key in obj) {
      if (key === '_id' || key === '__v') continue;
      
      const value = obj[key];
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (value === null || value === undefined) {
        fields.push({ field: fullKey, type: 'string' });
      } else if (Array.isArray(value)) {
        fields.push({ field: fullKey, type: 'array' });
      } else if (typeof value === 'object' && !(value instanceof Date)) {
        fields.push({ field: fullKey, type: 'object' });
      } else if (value instanceof Date) {
        fields.push({ field: fullKey, type: 'date' });
      } else if (typeof value === 'number') {
        fields.push({ field: fullKey, type: 'number' });
      } else if (typeof value === 'boolean') {
        fields.push({ field: fullKey, type: 'boolean' });
      } else {
        fields.push({ field: fullKey, type: 'string' });
      }
    }
    
    return fields;
  }

  getSearchableFields(obj, prefix = '', depth = 0) {
    let fields = [];
    
    if (depth > 2) return fields;
    
    for (const key in obj) {
      if (key === '_id' || key === '__v') continue;
      
      const value = obj[key];
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'string' || typeof value === 'number') {
        fields.push(fullKey);
      } else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        const nestedFields = this.getSearchableFields(value, fullKey, depth + 1);
        fields.push(...nestedFields);
      }
    }
    
    return fields;
  }
}

module.exports = DataController;