const axios = require('axios');
const GithubIntegration = require('../models/githubIntegration');
const GitHubHelper = require('../helpers/github.helper');
const { Organization, Repository, Commit, PullRequest, Issue, IssueChangelog, User } = require('../models/githubdata');

class GithubController {
  async getAuthUrl(req, res) {
    try {
      const clientId = process.env.GITHUB_CLIENT_ID;
      const redirectUri = process.env.GITHUB_REDIRECT_URI || 'http://localhost:3000/api/github/callback';
      const scope = 'read:org,read:user,repo,user:email';
      
      const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}`;
      
      res.json({ authUrl });
    } catch (error) {
      console.error('Error generating auth URL:', error);
      res.status(500).json({ error: 'Failed to generate authorization URL' });
    }
  }

  async handleCallback(req, res) {
    try {
      const { code } = req.query;
      
      if (!code) {
        return res.status(400).json({ error: 'No authorization code provided' });
      }

      const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: process.env.GITHUB_REDIRECT_URI || 'http://localhost:3000/api/github/callback'
      }, {
        headers: {
          'Accept': 'application/json'
        }
      });

      const { access_token, token_type, scope } = tokenResponse.data;

      if (!access_token) {
        return res.status(400).json({ error: 'Failed to obtain access token' });
      }

      const githubHelper = new GitHubHelper(access_token);
      const userInfo = await githubHelper.getUserInfo();

      const integration = await GithubIntegration.findOneAndUpdate(
        { userId: userInfo.id.toString() },
        {
          userId: userInfo.id.toString(),
          username: userInfo.login,
          accessToken: access_token,
          tokenType: token_type,
          scope,
          avatarUrl: userInfo.avatar_url,
          profileUrl: userInfo.html_url,
          email: userInfo.email,
          name: userInfo.name,
          connectedAt: new Date(),
          lastSyncedAt: null,
          isActive: true
        },
        { upsert: true, new: true }
      );

      console.log('Starting initial sync for user:', userInfo.id);
      this.performSync(integration).catch(err => {
        console.error('Initial sync error:', err);
      });

      res.redirect(`http://localhost:4200/integrations?success=true&userId=${userInfo.id}`);
    } catch (error) {
      console.error('Error handling OAuth callback:', error.response?.data || error.message);
      res.redirect(`http://localhost:4200/integrations?success=false&error=${encodeURIComponent(error.message)}`);
    }
  }

  async getIntegrationStatus(req, res) {
    try {
      const { userId } = req.params;
      
      const integration = await GithubIntegration.findOne({ userId, isActive: true });
      
      if (!integration) {
        return res.json({ connected: false });
      }

      res.json({
        connected: true,
        connectedAt: integration.connectedAt,
        lastSyncedAt: integration.lastSyncedAt,
        username: integration.username,
        avatarUrl: integration.avatarUrl,
        email: integration.email,
        name: integration.name
      });
    } catch (error) {
      console.error('Error fetching integration status:', error);
      res.status(500).json({ error: 'Failed to fetch integration status' });
    }
  }

  async removeIntegration(req, res) {
    try {
      const { userId } = req.params;
      
      await GithubIntegration.findOneAndDelete({ userId });
      
      await Promise.all([
        Organization.deleteMany({ userId }),
        Repository.deleteMany({ userId }),
        Commit.deleteMany({ userId }),
        PullRequest.deleteMany({ userId }),
        Issue.deleteMany({ userId }),
        IssueChangelog.deleteMany({ userId }),
        User.deleteMany({ userId })
      ]);

      res.json({ success: true, message: 'Integration removed successfully' });
    } catch (error) {
      console.error('Error removing integration:', error);
      res.status(500).json({ error: 'Failed to remove integration' });
    }
  }

  async resyncIntegration(req, res) {
    try {
      const { userId } = req.params;
      
      const integration = await GithubIntegration.findOne({ userId, isActive: true });
      
      if (!integration) {
        return res.status(404).json({ error: 'Integration not found' });
      }

      res.json({ success: true, message: 'Sync started', syncInProgress: true });

      this.performSync(integration).catch(err => {
        console.error('Background sync error:', err);
      });
    } catch (error) {
      console.error('Error initiating resync:', error);
      res.status(500).json({ error: 'Failed to initiate resync' });
    }
  }

  async performSync(integration) {
    try {
      const githubHelper = new GitHubHelper(integration.accessToken);
      const userId = integration.userId;

      const orgs = await githubHelper.getOrganizations();

      if (orgs.length === 0) {
        console.log('⚠ No organizations found. Make sure your GitHub account has organizations.');
        await GithubIntegration.findOneAndUpdate(
          { userId },
          { lastSyncedAt: new Date() }
        );
        return;
      }

      for (const org of orgs) {
        
        // Save organization
        await Organization.findOneAndUpdate(
          { userId, login: org.login },
          { ...org, userId },
          { upsert: true }
        );

        const repos = await githubHelper.getOrgRepositories(org.login);

        if (repos.length === 0) {
          console.log(`  ⚠ No repositories found for ${org.login}`);
          continue;
        }

        for (const repo of repos) {
          
          // Save repository
          await Repository.findOneAndUpdate(
            { userId, orgLogin: org.login, name: repo.name },
            { ...repo, userId, orgLogin: org.login },
            { upsert: true }
          );


          const commits = await githubHelper.getRepositoryCommits(org.login, repo.name, 2000);
          
          if (commits.length > 0) {
            const commitOps = commits.map(commit => ({
              updateOne: {
                filter: { userId, repoName: repo.name, sha: commit.sha },
                update: { $set: { ...commit, userId, orgLogin: org.login, repoName: repo.name } },
                upsert: true
              }
            }));
            
            await Commit.bulkWrite(commitOps, { ordered: false }).catch(err => {
              if (err.code !== 11000) { // Ignore duplicate key errors
                console.error(`    ✗ Error saving commits: ${err.message}`);
              }
            });
          }

         
          const pulls = await githubHelper.getRepositoryPullRequests(org.login, repo.name);
          
          if (pulls.length > 0) {
            const pullOps = pulls.map(pull => ({
              updateOne: {
                filter: { userId, repoName: repo.name, number: pull.number },
                update: { $set: { ...pull, userId, orgLogin: org.login, repoName: repo.name } },
                upsert: true
              }
            }));
            
            await PullRequest.bulkWrite(pullOps, { ordered: false }).catch(err => {
              if (err.code !== 11000) {
                console.error(`    ✗ Error saving pull requests: ${err.message}`);
              }
            });
          }

          console.log(`Fetching issues for ${repo.name}...`);
          const issues = await githubHelper.getRepositoryIssues(org.login, repo.name);
          
          if (issues.length > 0) {
            const issueOps = issues.map(issue => ({
              updateOne: {
                filter: { userId, repoName: repo.name, number: issue.number },
                update: { $set: { ...issue, userId, orgLogin: org.login, repoName: repo.name } },
                upsert: true
              }
            }));
            
            await Issue.bulkWrite(issueOps, { ordered: false }).catch(err => {
              if (err.code !== 11000) {
                console.error(`Error saving issues: ${err.message}`);
              }
            });

            const recentIssues = issues.slice(0, 50);
            console.log(`Fetching timelines for ${recentIssues.length} issues...`);
            
            let totalTimelines = 0;
            for (const issue of recentIssues) {
              const timeline = await githubHelper.getIssueTimeline(org.login, repo.name, issue.number);
              
              if (timeline.length > 0) {
                const timelineOps = timeline.map(event => ({
                  updateOne: {
                    filter: { userId, issueNumber: issue.number, id: event.id },
                    update: { $set: { ...event, userId, orgLogin: org.login, repoName: repo.name, issueNumber: issue.number } },
                    upsert: true
                  }
                }));
                
                await IssueChangelog.bulkWrite(timelineOps, { ordered: false }).catch(err => {
                  if (err.code !== 11000) {
                    console.error(`    ✗ Error saving timeline: ${err.message}`);
                  }
                });
                totalTimelines += timeline.length;
              }
            }
          }
        }

        // Fetch organization members
        const members = await githubHelper.getOrgMembers(org.login);
        
        if (members.length > 0) {
          const memberOps = members.map(member => ({
            updateOne: {
              filter: { userId, orgLogin: org.login, login: member.login },
              update: { $set: { ...member, userId, orgLogin: org.login } },
              upsert: true
            }
          }));
          
          await User.bulkWrite(memberOps, { ordered: false }).catch(err => {
            if (err.code !== 11000) {
              console.error(`Error saving users: ${err.message}`);
            }
          });
        }
      }

      // Update last synced time
      await GithubIntegration.findOneAndUpdate(
        { userId },
        { lastSyncedAt: new Date() }
      );

      console.log(`✓ Sync completed successfully for user ${userId}!`);

    } catch (error) {
      console.error('Sync failed:', error.message);
      throw error;
    }
  }

  // Get sync status
  async getSyncStatus(req, res) {
    try {
      const { userId } = req.params;

      const counts = await Promise.all([
        Organization.countDocuments({ userId }),
        Repository.countDocuments({ userId }),
        Commit.countDocuments({ userId }),
        PullRequest.countDocuments({ userId }),
        Issue.countDocuments({ userId }),
        IssueChangelog.countDocuments({ userId }),
        User.countDocuments({ userId })
      ]);

      res.json({
        organizations: counts[0],
        repositories: counts[1],
        commits: counts[2],
        pullRequests: counts[3],
        issues: counts[4],
        issueChangelogs: counts[5],
        users: counts[6]
      });
    } catch (error) {
      console.error('Error fetching sync status:', error);
      res.status(500).json({ error: 'Failed to fetch sync status' });
    }
  }
}

module.exports = GithubController;