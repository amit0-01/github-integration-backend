const mongoose = require('mongoose');

// Organizations
const organizationSchema = new mongoose.Schema({
  userId: String,
  login: String,
  id: Number,
  node_id: String,
  url: String,
  repos_url: String,
  events_url: String,
  hooks_url: String,
  issues_url: String,
  members_url: String,
  public_members_url: String,
  avatar_url: String,
  description: String,
  name: String,
  company: String,
  blog: String,
  location: String,
  email: String,
  twitter_username: String,
  is_verified: Boolean,
  has_organization_projects: Boolean,
  has_repository_projects: Boolean,
  public_repos: Number,
  public_gists: Number,
  followers: Number,
  following: Number,
  html_url: String,
  created_at: Date,
  updated_at: Date,
  type: String
}, { timestamps: true, strict: false });

// Repositories
const repositorySchema = new mongoose.Schema({
  userId: String,
  orgLogin: String,
  id: Number,
  node_id: String,
  name: String,
  full_name: String,
  private: Boolean,
  owner: Object,
  html_url: String,
  description: String,
  fork: Boolean,
  url: String,
  created_at: Date,
  updated_at: Date,
  pushed_at: Date,
  git_url: String,
  ssh_url: String,
  clone_url: String,
  svn_url: String,
  homepage: String,
  size: Number,
  stargazers_count: Number,
  watchers_count: Number,
  language: String,
  has_issues: Boolean,
  has_projects: Boolean,
  has_downloads: Boolean,
  has_wiki: Boolean,
  has_pages: Boolean,
  forks_count: Number,
  mirror_url: String,
  archived: Boolean,
  disabled: Boolean,
  open_issues_count: Number,
  license: Object,
  topics: [String],
  forks: Number,
  open_issues: Number,
  watchers: Number,
  default_branch: String
}, { timestamps: true, strict: false });

// Commits
const commitSchema = new mongoose.Schema({
  userId: String,
  orgLogin: String,
  repoName: String,
  sha: String,
  node_id: String,
  commit: Object,
  url: String,
  html_url: String,
  comments_url: String,
  author: Object,
  committer: Object,
  parents: [Object],
  stats: Object,
  files: [Object]
}, { timestamps: true, strict: false });

// Pull Requests
const pullRequestSchema = new mongoose.Schema({
  userId: String,
  orgLogin: String,
  repoName: String,
  id: Number,
  node_id: String,
  url: String,
  html_url: String,
  diff_url: String,
  patch_url: String,
  issue_url: String,
  number: Number,
  state: String,
  locked: Boolean,
  title: String,
  user: Object,
  body: String,
  created_at: Date,
  updated_at: Date,
  closed_at: Date,
  merged_at: Date,
  merge_commit_sha: String,
  assignee: Object,
  assignees: [Object],
  requested_reviewers: [Object],
  requested_teams: [Object],
  labels: [Object],
  milestone: Object,
  draft: Boolean,
  head: Object,
  base: Object,
  author_association: String,
  auto_merge: Object,
  active_lock_reason: String
}, { timestamps: true, strict: false });

// Issues
const issueSchema = new mongoose.Schema({
  userId: String,
  orgLogin: String,
  repoName: String,
  id: Number,
  node_id: String,
  url: String,
  repository_url: String,
  labels_url: String,
  comments_url: String,
  events_url: String,
  html_url: String,
  number: Number,
  state: String,
  title: String,
  body: String,
  user: Object,
  labels: [Object],
  assignee: Object,
  assignees: [Object],
  milestone: Object,
  locked: Boolean,
  active_lock_reason: String,
  comments: Number,
  pull_request: Object,
  closed_at: Date,
  created_at: Date,
  updated_at: Date,
  author_association: String,
  state_reason: String
}, { timestamps: true, strict: false });

// Issue Changelogs (Timeline Events)
const issueChangelogSchema = new mongoose.Schema({
  userId: String,
  orgLogin: String,
  repoName: String,
  issueNumber: Number,
  id: Number,
  node_id: String,
  url: String,
  actor: Object,
  event: String,
  commit_id: String,
  commit_url: String,
  created_at: Date,
  label: Object,
  assignee: Object,
  assigner: Object,
  milestone: Object,
  rename: Object,
  author_association: String
}, { timestamps: true, strict: false });

// Users
const userSchema = new mongoose.Schema({
  userId: String,
  orgLogin: String,
  login: String,
  id: Number,
  node_id: String,
  avatar_url: String,
  gravatar_id: String,
  url: String,
  html_url: String,
  followers_url: String,
  following_url: String,
  gists_url: String,
  starred_url: String,
  subscriptions_url: String,
  organizations_url: String,
  repos_url: String,
  events_url: String,
  received_events_url: String,
  type: String,
  site_admin: Boolean,
  name: String,
  company: String,
  blog: String,
  location: String,
  email: String,
  hireable: Boolean,
  bio: String,
  twitter_username: String,
  public_repos: Number,
  public_gists: Number,
  followers: Number,
  following: Number,
  created_at: Date,
  updated_at: Date
}, { timestamps: true, strict: false });

// Create indexes
organizationSchema.index({ userId: 1, login: 1 });
repositorySchema.index({ userId: 1, orgLogin: 1, name: 1 });
commitSchema.index({ userId: 1, repoName: 1, sha: 1 });
pullRequestSchema.index({ userId: 1, repoName: 1, number: 1 });
issueSchema.index({ userId: 1, repoName: 1, number: 1 });
issueChangelogSchema.index({ userId: 1, issueNumber: 1 });
userSchema.index({ userId: 1, orgLogin: 1, login: 1 });

module.exports = {
  Organization: mongoose.model('Organization', organizationSchema, 'organizations'),
  Repository: mongoose.model('Repository', repositorySchema, 'repositories'),
  Commit: mongoose.model('Commit', commitSchema, 'commits'),
  PullRequest: mongoose.model('PullRequest', pullRequestSchema, 'pull-requests'),
  Issue: mongoose.model('Issue', issueSchema, 'issues'),
  IssueChangelog: mongoose.model('IssueChangelog', issueChangelogSchema, 'issue-changelogs'),
  User: mongoose.model('User', userSchema, 'users')
};