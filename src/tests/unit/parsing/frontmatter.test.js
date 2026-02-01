/**
 * Tests for frontmatter parsing and serialization utilities.
 *
 * parseFrontmatter extracts YAML-like key-value pairs from --- delimited
 * frontmatter blocks at the top of markdown files.
 *
 * serializeFrontmatter converts a frontmatter object and body back into
 * the standard markdown-with-frontmatter format.
 */

import { parseFrontmatter, serializeFrontmatter } from '../../../lib/utils/files.js';

describe('Frontmatter', () => {
  describe('parseFrontmatter', () => {
    describe('context: standard frontmatter', () => {
      it('should parse standard YAML frontmatter with --- delimiters', () => {
        // Given markdown content with frontmatter delimited by ---
        const content = [
          '---',
          'type: project',
          'name: Find PCP',
          'status: active',
          '---',
          '',
          '## Next Action',
          'Call the office.',
        ].join('\n');

        // When parsing the frontmatter
        const { frontmatter, body } = parseFrontmatter(content);

        // Then key-value pairs are extracted correctly
        expect(frontmatter.type).toBe('project');
        expect(frontmatter.name).toBe('Find PCP');
        expect(frontmatter.status).toBe('active');
        // And the body contains everything after the closing ---
        expect(body).toContain('## Next Action');
        expect(body).toContain('Call the office.');
      });
    });

    describe('context: no frontmatter', () => {
      it('should return empty frontmatter and full body when no --- prefix', () => {
        // Given markdown content that does not start with ---
        const content = '## Just a heading\n\nSome text.';

        // When parsing the frontmatter
        const { frontmatter, body } = parseFrontmatter(content);

        // Then frontmatter is empty and body is the entire content
        expect(frontmatter).toEqual({});
        expect(body).toBe(content);
      });
    });

    describe('context: quoted string values', () => {
      it('should handle double-quoted string values', () => {
        // Given frontmatter with double-quoted values
        const content = '---\nname: "Hello World"\n---\n\nBody.';

        // When parsing
        const { frontmatter } = parseFrontmatter(content);

        // Then quotes are stripped from the value
        expect(frontmatter.name).toBe('Hello World');
      });

      it('should handle single-quoted string values', () => {
        // Given frontmatter with single-quoted values
        const content = "---\nname: 'Hello World'\n---\n\nBody.";

        // When parsing
        const { frontmatter } = parseFrontmatter(content);

        // Then quotes are stripped from the value
        expect(frontmatter.name).toBe('Hello World');
      });
    });

    describe('context: array values', () => {
      it('should parse array values like [tag1, tag2]', () => {
        // Given frontmatter with a JSON array value
        const content = '---\ntags: ["tag1", "tag2"]\n---\n\nBody.';

        // When parsing
        const { frontmatter } = parseFrontmatter(content);

        // Then the value is parsed as a JavaScript array
        expect(frontmatter.tags).toEqual(['tag1', 'tag2']);
      });
    });

    describe('context: missing closing delimiter', () => {
      it('should return empty frontmatter when closing --- is missing', () => {
        // Given content that starts with --- but never closes
        const content = '---\nname: test\nSome body text without closing delimiter.';

        // When parsing
        const { frontmatter, body } = parseFrontmatter(content);

        // Then it falls back to treating the entire content as body
        expect(frontmatter).toEqual({});
        expect(body).toBe(content);
      });
    });
  });

  describe('serializeFrontmatter', () => {
    describe('context: simple key-value pairs', () => {
      it('should serialize simple key-value pairs', () => {
        // Given a simple frontmatter object
        const frontmatter = { type: 'project', status: 'active' };
        const body = 'Some body text.';

        // When serializing
        const result = serializeFrontmatter(frontmatter, body);

        // Then it produces valid frontmatter markdown
        expect(result).toContain('---');
        expect(result).toContain('type: project');
        expect(result).toContain('status: active');
        expect(result).toContain('Some body text.');
      });
    });

    describe('context: strings with colons', () => {
      it('should quote strings containing colons', () => {
        // Given a frontmatter value that contains a colon
        const frontmatter = { name: 'Time: 3pm' };
        const body = '';

        // When serializing
        const result = serializeFrontmatter(frontmatter, body);

        // Then the value is wrapped in double quotes
        expect(result).toContain('name: "Time: 3pm"');
      });
    });

    describe('context: arrays', () => {
      it('should serialize arrays as JSON', () => {
        // Given a frontmatter object with an array value
        const frontmatter = { tags: ['one', 'two'] };
        const body = '';

        // When serializing
        const result = serializeFrontmatter(frontmatter, body);

        // Then the array is serialized as a JSON string
        expect(result).toContain('tags: ["one","two"]');
      });
    });

    describe('context: full document structure', () => {
      it('should combine frontmatter and body with --- delimiters', () => {
        // Given a frontmatter object and body
        const frontmatter = { type: 'idea' };
        const body = '## Notes\n\nSome notes.';

        // When serializing
        const result = serializeFrontmatter(frontmatter, body);

        // Then the result starts and ends frontmatter with --- and includes body
        const lines = result.split('\n');
        expect(lines[0]).toBe('---');
        expect(lines[2]).toBe('---');
        expect(result).toContain('## Notes');
        expect(result).toContain('Some notes.');
      });
    });

    describe('context: round-trip integrity', () => {
      it('should round-trip: parse then serialize preserves data', () => {
        // Given a markdown document with frontmatter
        const original = [
          '---',
          'type: project',
          'name: Test Project',
          'tags: ["a","b"]',
          '---',
          '',
          '## Notes',
          'Important notes here.',
        ].join('\n');

        // When parsing then re-serializing
        const { frontmatter, body } = parseFrontmatter(original);
        const result = serializeFrontmatter(frontmatter, body);

        // Then the key data is preserved
        const reparsed = parseFrontmatter(result);
        expect(reparsed.frontmatter.type).toBe('project');
        expect(reparsed.frontmatter.name).toBe('Test Project');
        expect(reparsed.frontmatter.tags).toEqual(['a', 'b']);
        expect(reparsed.body).toContain('Important notes here.');
      });
    });
  });
});
