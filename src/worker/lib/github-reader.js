/**
 * GitHub API client for reading repository files.
 * Used by Durable Objects to fetch context from the source of truth.
 */

/**
 * Create a GitHub reader client.
 * @param {Object} options
 * @param {string} options.token - GitHub personal access token
 * @param {string} options.repo - Repository in 'owner/repo' format
 * @param {string} [options.branch] - Branch name (default: 'main')
 * @param {Object} [options.logger] - Logger instance
 * @returns {Object} GitHub reader instance
 */
export function createGitHubReader({ token, repo, branch = 'main', logger }) {
  if (!token) {
    throw new Error('GitHub token is required');
  }
  if (!repo || !repo.includes('/')) {
    throw new Error('GitHub repo must be in owner/repo format');
  }

  const [owner, repoName] = repo.split('/');
  const baseUrl = `https://api.github.com/repos/${owner}/${repoName}`;

  const headers = {
    Accept: 'application/vnd.github.v3+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'SecondBrain-Worker',
  };

  /**
   * Make a GET request to GitHub API.
   * @param {string} endpoint - API endpoint path
   * @returns {Promise<Object>} Response data
   */
  async function get(endpoint) {
    const url = `${baseUrl}${endpoint}`;
    logger?.debug('GitHub API request', { url });

    const response = await fetch(url, { method: 'GET', headers });

    if (!response.ok) {
      const error = new Error(`GitHub API error: ${response.status}`);
      error.status = response.status;
      error.response = await response.text();
      throw error;
    }

    return response.json();
  }

  return {
    /**
     * Get the SHA of a file or directory.
     * @param {string} path - File path in repository
     * @returns {Promise<string|null>} SHA hash or null if not found
     */
    async getSha(path) {
      try {
        const data = await get(`/contents/${path}?ref=${branch}`);
        return data.sha;
      } catch (error) {
        if (error.status === 404) {
          return null;
        }
        throw error;
      }
    },

    /**
     * Get the content of a file.
     * @param {string} path - File path in repository
     * @returns {Promise<string|null>} File content (decoded) or null if not found
     */
    async getContent(path) {
      try {
        const data = await get(`/contents/${path}?ref=${branch}`);

        if (data.type !== 'file') {
          throw new Error(`Path is not a file: ${path}`);
        }

        // Content is base64 encoded
        const content = atob(data.content.replace(/\n/g, ''));
        return content;
      } catch (error) {
        if (error.status === 404) {
          return null;
        }
        throw error;
      }
    },

    /**
     * Get file metadata (including SHA) without content.
     * @param {string} path - File path in repository
     * @returns {Promise<Object|null>} File metadata or null if not found
     */
    async getFileInfo(path) {
      try {
        const data = await get(`/contents/${path}?ref=${branch}`);
        return {
          sha: data.sha,
          size: data.size,
          path: data.path,
          type: data.type,
          name: data.name,
        };
      } catch (error) {
        if (error.status === 404) {
          return null;
        }
        throw error;
      }
    },

    /**
     * List files in a directory.
     * @param {string} path - Directory path
     * @returns {Promise<Object[]>} Array of file/directory entries
     */
    async listDirectory(path) {
      try {
        const data = await get(`/contents/${path}?ref=${branch}`);

        if (!Array.isArray(data)) {
          throw new Error(`Path is not a directory: ${path}`);
        }

        return data.map((item) => ({
          name: item.name,
          path: item.path,
          type: item.type,
          sha: item.sha,
          size: item.size,
        }));
      } catch (error) {
        if (error.status === 404) {
          return [];
        }
        throw error;
      }
    },

    /**
     * Get multiple files in parallel.
     * @param {string[]} paths - Array of file paths
     * @returns {Promise<Object>} Map of path -> content (null for missing files)
     */
    async getMultiple(paths) {
      const results = await Promise.all(
        paths.map(async (path) => {
          const content = await this.getContent(path);
          return [path, content];
        })
      );
      return Object.fromEntries(results);
    },

    /**
     * Check if a path exists.
     * @param {string} path - Path to check
     * @returns {Promise<boolean>} True if exists
     */
    async exists(path) {
      const info = await this.getFileInfo(path);
      return info !== null;
    },
  };
}
