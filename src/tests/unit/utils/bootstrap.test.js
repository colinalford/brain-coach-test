/**
 * Tests for BrainDO bootstrap path — creating minimum viable repo structure
 * when current.md doesn't exist.
 */

import { jest } from '@jest/globals';
import { generateBootstrapContext } from '../../../worker/lib/bootstrap.js';

describe('Bootstrap', () => {
  describe('generateBootstrapContext', () => {
    it('should generate a valid current.md with all required sections', () => {
      const content = generateBootstrapContext();

      expect(content).toContain('# Current Context');
      expect(content).toContain('## Pending Review');
      expect(content).toContain("## Today's Stream");
      expect(content).toContain('## Open Loops');
      expect(content).toContain("## This Week's Plan");
      expect(content).toContain('## Upcoming Calendar');
      expect(content).toContain('## Project Index');
      expect(content).toContain("## This Month's Plan");
      expect(content).toContain('## Learned Context');
      expect(content).toContain('## Identity');
    });

    it('should include placeholder content in each section', () => {
      const content = generateBootstrapContext();

      // Sections should have placeholder content rather than being empty
      expect(content).toContain('*No items pending review*');
      expect(content).toContain('*No captures yet today*');
      expect(content).toContain('*No open loops*');
    });

    it('should include source comments for decomposable sections', () => {
      const content = generateBootstrapContext();

      expect(content).toContain('<!-- Source: stream/');
      expect(content).toContain('<!-- Source: planning/calendar-current.md -->');
      expect(content).toContain('<!-- Source: projects/index.md -->');
      expect(content).toContain('<!-- Source: system/learned.md -->');
    });

    it('should include inline markers for managed sections', () => {
      const content = generateBootstrapContext();

      expect(content).toContain('<!-- Managed inline - preserved during rebuild -->');
    });
  });
});
