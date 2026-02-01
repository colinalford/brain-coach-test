/**
 * GitHub Writer - Commit files via GitHub Contents API.
 *
 * Provides methods for writing files back to the repository
 * from Cloudflare Workers/Durable Objects.
 */

const GITHUB_API_BASE = 'https://api.github.com';
const DEFAULT_TIMEOUT = 30000; // 30 seconds for write operations

/**
 * Encode string to base64 (edge-compatible, handles UTF-8).
 * @param {string} str - String to encode
 * @returns {string} Base64 encoded string
 */
function encodeBase64(str) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('');
  return btoa(binString);
}

/**
 * Decode base64 to string (edge-compatible, handles UTF-8).
 * @param {string} base64 - Base64 string to decode
 * @returns {string} Decoded string
 */
function decodeBase64(base64) {
  const binString = atob(base64);
  const bytes = Uint8Array.from(binString, (char) => char.codePointAt(0));
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}

/**
 * Create a GitHub writer client.
 * @param {Object} options
 * @param {string} options.token - GitHub access token
 * @param {string} options.repo - Repository in format 'owner/repo'
 * @param {string} [options.branch] - Branch to write to (default: 'main')
 * @param {Object} [options.logger] - Logger instance
 * @param {number} [options.timeout] - Request timeout in ms
 * @returns {Object} GitHub writer instance
 */
export function createGitHubWriter({ token, repo, branch = 'main', logger, timeout = DEFAULT_TIMEOUT }) {
  if (!token) {
    throw new Error('GitHub token is required');
  }

  if (!repo || !repo.includes('/')) {
    throw new Error('GitHub repo must be in format "owner/repo"');
  }

  const log = logger || { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };

  /**
   * Make an authenticated request to GitHub API.
   */
  async function makeRequest(method, endpoint, body = null) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const options = {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'SecondBrain-Worker/1.0',
        },
        signal: controller.signal,
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, options);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitHub API error: ${response.status} - ${errorText}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get file info (SHA and content) from GitHub.
   */
  async function getFileInfo(path) {
    try {
      const response = await makeRequest('GET', `/repos/${repo}/contents/${path}?ref=${branch}`);
      return {
        sha: response.sha,
        content: response.content ? decodeBase64(response.content.replace(/\n/g, '')) : null,
        exists: true,
      };
    } catch (error) {
      if (error.message.includes('404')) {
        return { sha: null, content: null, exists: false };
      }
      throw error;
    }
  }

  return {
    /**
     * Create or update a file.
     * @param {string} path - File path in repo
     * @param {string} content - File content
     * @param {string} message - Commit message
     * @returns {Promise<Object>} Commit result
     */
    async writeFile(path, content, message) {
      log.info('Writing file', { path, messageLength: content.length });

      // Get current file SHA if exists
      const fileInfo = await getFileInfo(path);

      const body = {
        message,
        content: encodeBase64(content),
        branch,
      };

      // Include SHA if updating existing file
      if (fileInfo.sha) {
        body.sha = fileInfo.sha;
      }

      const result = await makeRequest('PUT', `/repos/${repo}/contents/${path}`, body);

      log.info('File written', {
        path,
        sha: result.content?.sha,
        commitSha: result.commit?.sha,
      });

      return {
        sha: result.content?.sha,
        commitSha: result.commit?.sha,
        path,
      };
    },

    /**
     * Append content to an existing file.
     * @param {string} path - File path in repo
     * @param {string} content - Content to append
     * @param {string} message - Commit message
     * @returns {Promise<Object>} Commit result
     */
    async appendToFile(path, content, message) {
      log.info('Appending to file', { path });

      const fileInfo = await getFileInfo(path);

      let newContent;
      if (fileInfo.exists) {
        newContent = fileInfo.content.trimEnd() + '\n' + content;
      } else {
        newContent = content;
      }

      return this.writeFile(path, newContent, message);
    },

    /**
     * Append content to a specific section in a markdown file.
     * @param {string} path - File path
     * @param {string} sectionHeader - Section header (e.g., '## Notes')
     * @param {string} content - Content to append
     * @param {string} message - Commit message
     * @returns {Promise<Object>} Commit result
     */
    async appendToSection(path, sectionHeader, content, message) {
      log.info('Appending to section', { path, section: sectionHeader });

      const fileInfo = await getFileInfo(path);

      if (!fileInfo.exists) {
        // Create file with section
        const newContent = `${sectionHeader}\n\n${content}\n`;
        return this.writeFile(path, newContent, message);
      }

      const currentContent = fileInfo.content;
      const sectionIndex = currentContent.indexOf(sectionHeader);

      let newContent;
      if (sectionIndex === -1) {
        // Section doesn't exist - add at end
        newContent = currentContent.trimEnd() + `\n\n${sectionHeader}\n\n${content}\n`;
      } else {
        // Find end of section
        const sectionStart = sectionIndex + sectionHeader.length;
        let sectionEnd = currentContent.length;
        const nextSection = currentContent.indexOf('\n## ', sectionStart);
        if (nextSection !== -1) {
          sectionEnd = nextSection;
        }

        const beforeSection = currentContent.slice(0, sectionStart);
        const afterSection = currentContent.slice(sectionEnd);
        const sectionContent = currentContent.slice(sectionStart, sectionEnd);

        newContent = beforeSection + sectionContent.trimEnd() + '\n' + content + '\n' + afterSection;
      }

      return this.writeFile(path, newContent, message);
    },

    /**
     * Replace a section in a markdown file.
     * @param {string} path - File path
     * @param {string} sectionHeader - Section header (e.g., '## Notes')
     * @param {string} content - New section content
     * @param {string} message - Commit message
     * @returns {Promise<Object>} Commit result
     */
    async replaceSection(path, sectionHeader, content, message) {
      log.info('Replacing section', { path, section: sectionHeader });

      const fileInfo = await getFileInfo(path);

      if (!fileInfo.exists) {
        const newContent = `${sectionHeader}\n\n${content}\n`;
        return this.writeFile(path, newContent, message);
      }

      const currentContent = fileInfo.content;
      const sectionIndex = currentContent.indexOf(sectionHeader);

      let newContent;
      if (sectionIndex === -1) {
        // Section doesn't exist - add at end
        newContent = currentContent.trimEnd() + `\n\n${sectionHeader}\n\n${content}\n`;
      } else {
        // Find end of section
        const sectionStart = sectionIndex + sectionHeader.length;
        let sectionEnd = currentContent.length;
        const nextSection = currentContent.indexOf('\n## ', sectionStart);
        if (nextSection !== -1) {
          sectionEnd = nextSection;
        }

        const beforeSection = currentContent.slice(0, sectionStart);
        const afterSection = currentContent.slice(sectionEnd);

        newContent = beforeSection + '\n\n' + content + '\n' + afterSection;
      }

      return this.writeFile(path, newContent, message);
    },

    /**
     * Create a new file (fails if exists).
     * @param {string} path - File path
     * @param {string} content - File content
     * @param {string} message - Commit message
     * @returns {Promise<Object>} Commit result
     */
    async createFile(path, content, message) {
      log.info('Creating file', { path });

      const fileInfo = await getFileInfo(path);

      if (fileInfo.exists) {
        throw new Error(`File already exists: ${path}`);
      }

      return this.writeFile(path, content, message);
    },

    /**
     * Delete a file.
     * @param {string} path - File path
     * @param {string} message - Commit message
     * @returns {Promise<Object>} Commit result
     */
    async deleteFile(path, message) {
      log.info('Deleting file', { path });

      const fileInfo = await getFileInfo(path);

      if (!fileInfo.exists) {
        log.warn('File does not exist', { path });
        return { deleted: false, path };
      }

      const result = await makeRequest('DELETE', `/repos/${repo}/contents/${path}`, {
        message,
        sha: fileInfo.sha,
        branch,
      });

      log.info('File deleted', { path, commitSha: result.commit?.sha });

      return {
        deleted: true,
        commitSha: result.commit?.sha,
        path,
      };
    },

    /**
     * Batch write multiple files in a single commit.
     * Uses the Git Data API for atomic commits.
     * @param {Array<{path: string, content: string}>} files - Files to write
     * @param {string} message - Commit message
     * @returns {Promise<Object>} Commit result
     */
    async batchWrite(files, message) {
      log.info('Batch writing files', { fileCount: files.length });

      // Get current commit SHA
      const refResponse = await makeRequest('GET', `/repos/${repo}/git/ref/heads/${branch}`);
      const latestCommitSha = refResponse.object.sha;

      // Get the tree SHA
      const commitResponse = await makeRequest('GET', `/repos/${repo}/git/commits/${latestCommitSha}`);
      const baseTreeSha = commitResponse.tree.sha;

      // Create blobs for each file
      const treeItems = [];
      for (const file of files) {
        const blobResponse = await makeRequest('POST', `/repos/${repo}/git/blobs`, {
          content: file.content,
          encoding: 'utf-8',
        });

        treeItems.push({
          path: file.path,
          mode: '100644',
          type: 'blob',
          sha: blobResponse.sha,
        });
      }

      // Create new tree
      const treeResponse = await makeRequest('POST', `/repos/${repo}/git/trees`, {
        base_tree: baseTreeSha,
        tree: treeItems,
      });

      // Create commit
      const newCommitResponse = await makeRequest('POST', `/repos/${repo}/git/commits`, {
        message,
        tree: treeResponse.sha,
        parents: [latestCommitSha],
      });

      // Update ref (force=false — fails if HEAD moved)
      await makeRequest('PATCH', `/repos/${repo}/git/refs/heads/${branch}`, {
        sha: newCommitResponse.sha,
        force: false,
      });

      log.info('Batch write complete', {
        fileCount: files.length,
        commitSha: newCommitResponse.sha,
      });

      return {
        commitSha: newCommitResponse.sha,
        files: files.map(f => f.path),
      };
    },

    /**
     * Check if a file exists.
     * @param {string} path - File path
     * @returns {Promise<boolean>} True if file exists
     */
    async exists(path) {
      const fileInfo = await getFileInfo(path);
      return fileInfo.exists;
    },
  };
}
