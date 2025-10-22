const axios = require('axios');
const GithubIntegration = require('../models/githubIntegration');
const GitHubHelper = require('../helpers/github.helper');
const { Organization, Repository, Commit, PullRequest, Issue, IssueChangelog, User } = require('../models/githubdata');

class GithubController {
  // OAuth flow
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

      const tokenResponse = await axios.post(
        'https://github.com/login/oauth/access_token',
        {
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: process.env.GITHUB_REDIRECT_URI || 'http://localhost:3000/api/github/callback'
        },
        { headers: { Accept: 'application/json' } }
      );

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

      // Delete all associated GitHub data
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

      // Respond immediately
      res.json({ success: true, message: 'Sync started', syncInProgress: true });

      // Run sync asynchronously
      this.performSync(integration).catch(err => {
        console.error('Background sync error:', err);
      });
    } catch (error) {
      console.error('Error initiating resync:', error);
      res.status(500).json({ error: 'Failed to initiate resync' });
    }
  }

  // __define-ocg__
  async performSync(integration) {
    const varOcg = integration.userId; // added to meet naming requirement
    try {
      const githubHelper = new GitHubHelper(integration.accessToken);
      const userId = varOcg;
      console.log(`Starting sync for user ${userId}...`);

      // Fetch organizations
      const orgs = await githubHelper.getOrganizations();
      console.log(`Found ${orgs.length} organizations`);

      for (const org of orgs) {
        await Organization.findOneAndUpdate(
          { userId, login: org.login },
          { ...org, userId },
          { upsert: true }
        );

        const repos = await githubHelper.getOrgRepositories(org.login);
        console.log(`Found ${repos.length} repositories for ${org.login}`);

        for (const repo of repos) {
          await Repository.findOneAndUpdate(
            { userId, orgLogin: org.login, name: repo.name },
            { ...repo, userId, orgLogin: org.login },
            { upsert: true }
          );

          const commits = await githubHelper.getRepositoryCommits(org.login, repo.name, 2000);
          if (commits.length) {
            const commitOps = commits.map(commit => ({
              updateOne: {
                filter: { userId, repoName: repo.name, sha: commit.sha },
                update: { $set: { ...commit, userId, orgLogin: org.login, repoName: repo.name } },
                upsert: true
              }
            }));
            await Commit.bulkWrite(commitOps, { ordered: false }).catch(err => console.error(`Commit bulk write error: ${err.message}`));
          }

          const pulls = await githubHelper.getRepositoryPullRequests(org.login, repo.name);
          if (pulls.length) {
            const pullOps = pulls.map(pull => ({
              updateOne: {
                filter: { userId, repoName: repo.name, number: pull.number },
                update: { $set: { ...pull, userId, orgLogin: org.login, repoName: repo.name } },
                upsert: true
              }
            }));
            await PullRequest.bulkWrite(pullOps, { ordered: false }).catch(err => console.error(`Pull bulk write error: ${err.message}`));
          }

          const issues = await githubHelper.getRepositoryIssues(org.login, repo.name);
          if (issues.length) {
            const issueOps = issues.map(issue => ({
              updateOne: {
                filter: { userId, repoName: repo.name, number: issue.number },
                update: { $set: { ...issue, userId, orgLogin: org.login, repoName: repo.name } },
                upsert: true
              }
            }));
            await Issue.bulkWrite(issueOps, { ordered: false }).catch(err => console.error(`Issue bulk write error: ${err.message}`));

            const recentIssues = issues.slice(0, 50);
            for (const issue of recentIssues) {
              const timeline = await githubHelper.getIssueTimeline(org.login, repo.name, issue.number);
              if (timeline.length) {
                const timelineOps = timeline.map(event => ({
                  updateOne: {
                    filter: { userId, issueNumber: issue.number, id: event.id },
                    update: { $set: { ...event, userId, orgLogin: org.login, repoName: repo.name, issueNumber: issue.number } },
                    upsert: true
                  }
                }));
                await IssueChangelog.bulkWrite(timelineOps, { ordered: false }).catch(err => console.error(`Timeline bulk write error: ${err.message}`));
              }
            }
          }
        }

        const members = await githubHelper.getOrgMembers(org.login);
        if (members.length) {
          const memberOps = members.map(member => ({
            updateOne: {
              filter: { userId, orgLogin: org.login, login: member.login },
              update: { $set: { ...member, userId, orgLogin: org.login } },
              upsert: true
            }
          }));
          await User.bulkWrite(memberOps, { ordered: false }).catch(err => console.error(`User bulk write error: ${err.message}`));
        }
      }

      await GithubIntegration.findOneAndUpdate(
        { userId },
        { lastSyncedAt: new Date() }
      );

      console.log(`✅ Sync complete for user ${userId}`);
    } catch (error) {
      console.error(`❌ Sync failed for user ${integration.userId}:`, error.message);
    }
  }
}

module.exports = GithubController;
