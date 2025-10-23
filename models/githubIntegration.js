const mongoose = require('mongoose');

const githubIntegrationSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: true
  },
  accessToken: {
    type: String,
    required: true
  },
  refreshToken: String,
  tokenType: String,
  scope: String,
  avatarUrl: String,
  profileUrl: String,
  email: String,
  name: String,
  connectedAt: {
    type: Date,
    default: Date.now
  },
  lastSyncedAt: Date,
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

githubIntegrationSchema.index({ userId: 1 });
githubIntegrationSchema.index({ username: 1 });

module.exports = mongoose.model('GithubIntegration', githubIntegrationSchema, 'github-integration');