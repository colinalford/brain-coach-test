/**
 * Tests for slug generation and project channel name utilities.
 *
 * generateSlug converts arbitrary strings into URL-safe, hyphenated slugs.
 * generateProjectChannelName, extractProjectSlugFromChannel, and isProjectChannel
 * handle the proj- naming convention for Slack project channels.
 */

import {
  generateSlug,
  generateProjectChannelName,
  extractProjectSlugFromChannel,
  isProjectChannel,
} from '../../../lib/utils/slugs.js';

describe('Slug Utilities', () => {
  describe('generateSlug', () => {
    describe('context: basic transformations', () => {
      it('should lowercase the input', () => {
        // Given an uppercase string
        // When generating a slug
        const result = generateSlug('Hello World');

        // Then the result is entirely lowercase
        expect(result).toBe('hello-world');
      });

      it('should replace non-alphanumeric characters with hyphens', () => {
        // Given a string with special characters
        // When generating a slug
        const result = generateSlug('foo@bar!baz');

        // Then special chars become hyphens
        expect(result).toBe('foo-bar-baz');
      });

      it('should collapse multiple consecutive hyphens', () => {
        // Given a string that would produce multiple hyphens
        // When generating a slug
        const result = generateSlug('hello---world');

        // Then consecutive hyphens are collapsed to one
        expect(result).toBe('hello-world');
      });

      it('should remove leading and trailing hyphens', () => {
        // Given a string with leading/trailing special characters
        // When generating a slug
        const result = generateSlug('--hello--');

        // Then leading/trailing hyphens are removed
        expect(result).toBe('hello');
      });
    });

    describe('context: truncation', () => {
      it('should truncate to 40 characters by default', () => {
        // Given a very long string
        const longInput = 'a'.repeat(60);

        // When generating a slug with default options
        const result = generateSlug(longInput);

        // Then the result is at most 40 characters
        expect(result.length).toBeLessThanOrEqual(40);
      });

      it('should respect a custom maxLength option', () => {
        // Given a long string and a custom max length
        const result = generateSlug('this is a long project name', { maxLength: 10 });

        // Then the result is at most 10 characters
        expect(result.length).toBeLessThanOrEqual(10);
      });
    });

    describe('context: edge cases', () => {
      it('should return empty string for empty input', () => {
        // Given an empty string
        // When generating a slug
        // Then the result is an empty string
        expect(generateSlug('')).toBe('');
      });

      it('should return empty string for null input', () => {
        // Given null input
        // When generating a slug
        // Then the result is an empty string
        expect(generateSlug(null)).toBe('');
      });

      it('should return empty string for undefined input', () => {
        // Given undefined input
        // When generating a slug
        // Then the result is an empty string
        expect(generateSlug(undefined)).toBe('');
      });
    });
  });

  describe('generateProjectChannelName', () => {
    it('should add proj- prefix to the generated slug', () => {
      // Given a project name
      // When generating a project channel name
      const result = generateProjectChannelName('Find PCP');

      // Then the result is prefixed with proj-
      expect(result).toBe('proj-find-pcp');
    });

    it('should handle long project names within Slack limits', () => {
      // Given a very long project name
      const longName = 'a'.repeat(100);

      // When generating a project channel name
      const result = generateProjectChannelName(longName);

      // Then the result is at most 80 characters (Slack limit)
      expect(result.length).toBeLessThanOrEqual(80);
      expect(result.startsWith('proj-')).toBe(true);
    });
  });

  describe('extractProjectSlugFromChannel', () => {
    it('should extract slug from a proj- prefixed channel name', () => {
      // Given a project channel name
      // When extracting the slug
      const result = extractProjectSlugFromChannel('proj-foo');

      // Then the slug after the prefix is returned
      expect(result).toBe('foo');
    });

    it('should extract multi-word slugs', () => {
      // Given a project channel with a multi-word slug
      // When extracting the slug
      const result = extractProjectSlugFromChannel('proj-find-pcp');

      // Then the full slug is returned
      expect(result).toBe('find-pcp');
    });

    it('should return null for a non-project channel', () => {
      // Given a non-project channel name
      // When extracting the slug
      const result = extractProjectSlugFromChannel('sb-inbox');

      // Then null is returned
      expect(result).toBeNull();
    });

    it('should return null for null input', () => {
      // Given null input
      // When extracting the slug
      const result = extractProjectSlugFromChannel(null);

      // Then null is returned
      expect(result).toBeNull();
    });

    it('should return null for undefined input', () => {
      // Given undefined input
      // When extracting the slug
      const result = extractProjectSlugFromChannel(undefined);

      // Then null is returned
      expect(result).toBeNull();
    });
  });

  describe('isProjectChannel', () => {
    it('should return true for proj- prefixed channel names', () => {
      // Given a project channel name
      // When checking
      // Then it returns true
      expect(isProjectChannel('proj-foo')).toBe(true);
      expect(isProjectChannel('proj-find-pcp')).toBe(true);
    });

    it('should return false for non-project channel names', () => {
      // Given a non-project channel name
      // When checking
      // Then it returns false
      expect(isProjectChannel('sb-inbox')).toBe(false);
      expect(isProjectChannel('general')).toBe(false);
    });

    it('should return false for null or undefined', () => {
      // Given null/undefined input
      // When checking
      // Then it returns false
      expect(isProjectChannel(null)).toBe(false);
      expect(isProjectChannel(undefined)).toBe(false);
    });
  });
});
