const axios = require('axios');

class GitHubHelper {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseURL = 'https://api.github.com';
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
  }

  async getUserInfo() {
    try {
      const response = await this.client.get('/user');
      return response.data;
    } catch (error) {
      console.error('Error fetching user info:', error.response?.data || error.message);
      throw error;
    }
  }

  async getOrganizations() {
    try {
      console.log('  → Calling GitHub API: GET /user/orgs');
      const orgs = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await this.client.get('/user/orgs', {
          params: { per_page: 100, page }
        });
        
        console.log(`  → Page ${page}: Found ${response.data.length} organizations`);
        orgs.push(...response.data);
        hasMore = response.data.length === 100;
        page++;
      }

      console.log(`  → Total organizations from /user/orgs: ${orgs.length}`);

      // If no organizations found, try fetching user's own organizations via installations
      if (orgs.length === 0) {
        console.log('  → Trying alternative: Fetching user installations...');
        try {
          const installResponse = await this.client.get('/user/installations', {
            headers: {
              'Accept': 'application/vnd.github.v3+json'
            }
          });
          
          if (installResponse.data.installations) {
            console.log(`  → Found ${installResponse.data.installations.length} installations`);
          }
        } catch (err) {
          console.log('  → Could not fetch installations:', err.response?.status);
        }

        // Try fetching organizations the user created/owns
        console.log('  → Trying alternative: Checking user profile for owned orgs...');
        const userInfo = await this.getUserInfo();
        console.log('  → User login:', userInfo.login);
        
        // For personal accounts, we might need to list repositories instead
        // and extract unique organizations from there
        console.log('  → Fetching user repositories to find organizations...');
        const repos = await this.getUserRepositories();
        const orgLogins = new Set();
        
        repos.forEach(repo => {
          if (repo.owner.type === 'Organization') {
            orgLogins.add(repo.owner.login);
          }
        });

        console.log(`  → Found ${orgLogins.size} unique organizations from repositories`);

        // Fetch detailed info for each organization
        for (const orgLogin of orgLogins) {
          try {
            const orgResponse = await this.client.get(`/orgs/${orgLogin}`);
            orgs.push(orgResponse.data);
            console.log(`  → Added organization: ${orgLogin}`);
          } catch (err) {
            console.log(`  → Could not fetch org ${orgLogin}:`, err.response?.status);
          }
        }
      } else {
        // Get detailed info for each org
        console.log('  → Fetching detailed information for each organization...');
        const detailedOrgs = await Promise.all(
          orgs.map(org => 
            this.client.get(`/orgs/${org.login}`)
              .then(res => {
                console.log(`  → Fetched details for: ${org.login}`);
                return res.data;
              })
              .catch(err => {
                console.log(`  → Error fetching ${org.login}:`, err.response?.status);
                return org; // Return basic info if detailed fetch fails
              })
          )
        );
        return detailedOrgs;
      }

      return orgs;
    } catch (error) {
      console.error('Error fetching organizations:', error.response?.data || error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response headers:', error.response.headers);
      }
      throw error;
    }
  }

  async getUserRepositories() {
    try {
      const repos = [];
      let page = 1;
      let hasMore = true;

      // First, get all repos with affiliation (don't use 'type' with 'affiliation')
      while (hasMore) {
        const response = await this.client.get('/user/repos', {
          params: { 
            per_page: 100, 
            page,
            affiliation: 'owner,collaborator,organization_member',
            sort: 'updated',
            direction: 'desc'
          }
        });
        
        console.log(`  → Page ${page}: Found ${response.data.length} repositories`);
        repos.push(...response.data);
        hasMore = response.data.length === 100;
        page++;
        
        if (hasMore) await this.delay(100);
      }

      console.log(`  → Total repositories fetched: ${repos.length}`);
      return repos;
    } catch (error) {
      console.error('Error fetching user repositories:', error.response?.data || error.message);
      
      // Fallback: try without affiliation parameter
      try {
        console.log('  → Retrying without affiliation parameter...');
        const repos = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const response = await this.client.get('/user/repos', {
            params: { 
              per_page: 100, 
              page,
              visibility: 'all',
              sort: 'updated'
            }
          });
          
          console.log(`  → Page ${page}: Found ${response.data.length} repositories`);
          repos.push(...response.data);
          hasMore = response.data.length === 100;
          page++;
          
          if (hasMore) await this.delay(100);
        }

        console.log(`  → Total repositories fetched: ${repos.length}`);
        return repos;
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError.response?.data || fallbackError.message);
        return [];
      }
    }
  }

  async getOrgRepositories(orgLogin) {
    try {
      console.log(`    → Fetching repos for organization: ${orgLogin}`);
      const repos = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await this.client.get(`/orgs/${orgLogin}/repos`, {
          params: { per_page: 100, page, type: 'all' }
        });
        
        console.log(`    → Page ${page}: Found ${response.data.length} repositories`);
        repos.push(...response.data);
        hasMore = response.data.length === 100;
        page++;
        
        if (hasMore) await this.delay(100);
      }

      return repos;
    } catch (error) {
      console.error(`Error fetching repos for ${orgLogin}:`, error.response?.data || error.message);
      throw error;
    }
  }

  async getRepositoryCommits(owner, repo, maxCommits = 2000) {
    try {
      const commits = [];
      let page = 1;
      let hasMore = true;

      while (hasMore && commits.length < maxCommits) {
        const response = await this.client.get(`/repos/${owner}/${repo}/commits`, {
          params: { per_page: 100, page }
        });
        
        commits.push(...response.data);
        hasMore = response.data.length === 100 && commits.length < maxCommits;
        page++;
        
        if (hasMore) await this.delay(100);
      }

      return commits.slice(0, maxCommits);
    } catch (error) {
      console.error(`Error fetching commits for ${owner}/${repo}:`, error.response?.data || error.message);
      return [];
    }
  }

  async getRepositoryPullRequests(owner, repo) {
    try {
      const pulls = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await this.client.get(`/repos/${owner}/${repo}/pulls`, {
          params: { per_page: 100, page, state: 'all' }
        });
        
        pulls.push(...response.data);
        hasMore = response.data.length === 100;
        page++;
        
        if (hasMore) await this.delay(100);
      }

      return pulls;
    } catch (error) {
      console.error(`Error fetching pull requests for ${owner}/${repo}:`, error.response?.data || error.message);
      return [];
    }
  }

  async getRepositoryIssues(owner, repo) {
    try {
      const issues = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await this.client.get(`/repos/${owner}/${repo}/issues`, {
          params: { per_page: 100, page, state: 'all' }
        });
        
        // Filter out pull requests (they're also returned in issues endpoint)
        const pureIssues = response.data.filter(issue => !issue.pull_request);
        issues.push(...pureIssues);
        
        hasMore = response.data.length === 100;
        page++;
        
        if (hasMore) await this.delay(100);
      }

      return issues;
    } catch (error) {
      console.error(`Error fetching issues for ${owner}/${repo}:`, error.response?.data || error.message);
      return [];
    }
  }

  async getIssueTimeline(owner, repo, issueNumber) {
    try {
      const timeline = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await this.client.get(`/repos/${owner}/${repo}/issues/${issueNumber}/timeline`, {
          params: { per_page: 100, page },
          headers: {
            'Accept': 'application/vnd.github.mockingbird-preview+json'
          }
        });
        
        timeline.push(...response.data);
        hasMore = response.data.length === 100;
        page++;
        
        if (hasMore) await this.delay(100);
      }

      return timeline;
    } catch (error) {
      console.error(`Error fetching timeline for issue ${issueNumber}:`, error.response?.data || error.message);
      return [];
    }
  }

  async getOrgMembers(orgLogin) {
    try {
      console.log(`    → Fetching members for organization: ${orgLogin}`);
      const members = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await this.client.get(`/orgs/${orgLogin}/members`, {
          params: { per_page: 100, page }
        });
        
        console.log(`    → Page ${page}: Found ${response.data.length} members`);
        members.push(...response.data);
        hasMore = response.data.length === 100;
        page++;
        
        if (hasMore) await this.delay(100);
      }

      // Get detailed info for each member
      const detailedMembers = await Promise.all(
        members.map(member => 
          this.client.get(`/users/${member.login}`)
            .then(res => res.data)
            .catch(err => {
              console.error(`Error fetching user ${member.login}:`, err.message);
              return member;
            })
        )
      );

      return detailedMembers;
    } catch (error) {
      console.error(`Error fetching members for ${orgLogin}:`, error.response?.data || error.message);
      return [];
    }
  }

  async getRateLimit() {
    try {
      const response = await this.client.get('/rate_limit');
      return response.data;
    } catch (error) {
      console.error('Error fetching rate limit:', error.message);
      return null;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = GitHubHelper;