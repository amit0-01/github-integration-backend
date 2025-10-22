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
      const orgs = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await this.client.get('/user/orgs', {
          params: { per_page: 100, page }
        });
        
        orgs.push(...response.data);
        hasMore = response.data.length === 100;
        page++;
      }

      // Get detailed info for each org
      const detailedOrgs = await Promise.all(
        orgs.map(org => this.client.get(`/orgs/${org.login}`).then(res => res.data))
      );

      return detailedOrgs;
    } catch (error) {
      console.error('Error fetching organizations:', error.response?.data || error.message);
      throw error;
    }
  }

  async getOrgRepositories(orgLogin) {
    try {
      const repos = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await this.client.get(`/orgs/${orgLogin}/repos`, {
          params: { per_page: 100, page, type: 'all' }
        });
        
        repos.push(...response.data);
        hasMore = response.data.length === 100;
        page++;
        
        // Add small delay to avoid rate limiting
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
        
        // Add delay to avoid rate limiting
        if (hasMore) await this.delay(100);
      }

      return commits.slice(0, maxCommits);
    } catch (error) {
      console.error(`Error fetching commits for ${owner}/${repo}:`, error.response?.data || error.message);
      return []; // Return empty array if repo has no commits or is empty
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
      const members = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await this.client.get(`/orgs/${orgLogin}/members`, {
          params: { per_page: 100, page }
        });
        
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
              return member; // Return basic info if detailed fetch fails
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