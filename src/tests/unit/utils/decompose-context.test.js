/**
 * Tests for decompose-context.js — reverse of rebuild-context.
 * Extracts sections from current.md and writes them back to source files.
 */

import { jest } from '@jest/globals';
import {
  extractSectionContent,
  parseVersionStamp,
  buildVersionStamp,
  computeDecomposePlan,
} from '../../../scripts/decompose-context.js';

describe('Decompose Context', () => {
  describe('buildVersionStamp', () => {
    it('should generate a version stamp comment', () => {
      const stamp = buildVersionStamp({
        sha: 'abc123',
        sourceRef: 'def456',
        direction: 'build',
      });
      expect(stamp).toContain('context_pack_version: abc123');
      expect(stamp).toContain('source_ref: def456');
      expect(stamp).toContain('direction: build');
    });
  });

  describe('parseVersionStamp', () => {
    it('should parse a version stamp from current.md content', () => {
      const content = `# Current Context
<!-- context_pack_version: abc123 source_ref: def456 direction: decompose -->
Last rebuilt: 2025-01-31 12:00

## Pending Review
some content`;
      const stamp = parseVersionStamp(content);
      expect(stamp).toEqual({
        sha: 'abc123',
        sourceRef: 'def456',
        direction: 'decompose',
      });
    });

    it('should return null if no version stamp found', () => {
      const content = `# Current Context
Last rebuilt: 2025-01-31

## Pending Review`;
      expect(parseVersionStamp(content)).toBeNull();
    });
  });

  describe('extractSectionContent', () => {
    const testContent = `# Current Context
Last rebuilt: 2025-01-31 12:00

## Pending Review
<!-- Managed inline - preserved during rebuild -->
- Item pending review

## Today's Stream
<!-- Source: stream/2025-01-31.md -->
### Captures
- Picked up groceries
- Idea for new project

## Open Loops
<!-- Managed inline - preserved during rebuild -->
- Fix the bug
- Call dentist

## This Week's Plan
<!-- Source: planning/weekly/2025-W05.md -->
# Weekly Plan - 2025-01-31

## Focus Areas
- Engineering

## Upcoming Calendar
<!-- Source: planning/calendar-current.md -->
## 2025-02-01
- Meeting at 10am

## Project Index
<!-- Source: projects/index.md -->
| Project | Status | Description |
|---------|--------|-------------|
| alpha | active | First project |

## This Month's Plan
<!-- Source: planning/monthly/2025-01.md -->
# Monthly Plan

## Learned Context
<!-- Source: system/learned.md -->
- User prefers morning work

## Identity
<!-- Source: identity/*.md (combined) -->
# Bio
Engineer.
`;

    it('should extract Today\'s Stream section content', () => {
      const content = extractSectionContent(testContent, "Today's Stream");
      expect(content).toContain('Picked up groceries');
      expect(content).toContain('Idea for new project');
    });

    it('should extract This Week\'s Plan section content', () => {
      const content = extractSectionContent(testContent, "This Week's Plan");
      expect(content).toContain('Weekly Plan');
      expect(content).toContain('Engineering');
    });

    it('should extract Upcoming Calendar section content', () => {
      const content = extractSectionContent(testContent, 'Upcoming Calendar');
      expect(content).toContain('Meeting at 10am');
    });

    it('should extract Project Index section content', () => {
      const content = extractSectionContent(testContent, 'Project Index');
      expect(content).toContain('alpha');
    });

    it('should extract Learned Context section content', () => {
      const content = extractSectionContent(testContent, 'Learned Context');
      expect(content).toContain('morning work');
    });

    it('should return empty string for missing section', () => {
      expect(extractSectionContent(testContent, 'Nonexistent')).toBe('');
    });

    it('should strip source comment from extracted content', () => {
      const content = extractSectionContent(testContent, "Today's Stream");
      expect(content).not.toContain('<!-- Source:');
    });
  });

  describe('computeDecomposePlan', () => {
    it('should map sections to their source file paths', () => {
      const content = `# Current Context

## Today's Stream
<!-- Source: stream/2025-01-31.md -->
- Capture

## This Week's Plan
<!-- Source: planning/weekly/2025-W05.md -->
Plan content

## Upcoming Calendar
<!-- Source: planning/calendar-current.md -->
Events

## Project Index
<!-- Source: projects/index.md -->
Index

## This Month's Plan
<!-- Source: planning/monthly/2025-01.md -->
Monthly

## Learned Context
<!-- Source: system/learned.md -->
Learned stuff
`;

      const plan = computeDecomposePlan(content);
      expect(plan).toHaveLength(6);
      expect(plan.find(p => p.path === 'data/stream/2025-01-31.md')).toBeDefined();
      expect(plan.find(p => p.path === 'data/planning/weekly/2025-W05.md')).toBeDefined();
      expect(plan.find(p => p.path === 'data/planning/calendar-current.md')).toBeDefined();
      expect(plan.find(p => p.path === 'data/projects/index.md')).toBeDefined();
      expect(plan.find(p => p.path === 'data/planning/monthly/2025-01.md')).toBeDefined();
      expect(plan.find(p => p.path === 'data/system/learned.md')).toBeDefined();
    });

    it('should skip inline-managed sections (Pending Review, Open Loops)', () => {
      const content = `# Current Context

## Pending Review
<!-- Managed inline - preserved during rebuild -->
- Item

## Open Loops
<!-- Managed inline - preserved during rebuild -->
- Loop

## Today's Stream
<!-- Source: stream/2025-01-31.md -->
- Capture
`;

      const plan = computeDecomposePlan(content);
      expect(plan).toHaveLength(1);
      expect(plan[0].path).toBe('data/stream/2025-01-31.md');
    });

    it('should skip Identity section (combined from multiple files)', () => {
      const content = `# Current Context

## Identity
<!-- Source: identity/*.md (combined) -->
Identity content
`;
      const plan = computeDecomposePlan(content);
      expect(plan).toHaveLength(0);
    });

    it('should include section content in each plan entry', () => {
      const content = `# Current Context

## Learned Context
<!-- Source: system/learned.md -->
- User prefers cats
- User likes coffee
`;
      const plan = computeDecomposePlan(content);
      expect(plan[0].content).toContain('User prefers cats');
      expect(plan[0].content).toContain('User likes coffee');
    });
  });
});
