/**
 * Tests for Project Agent — verifying that project messages generate the
 * correct spread updates and action types, and that applySpreadUpdates
 * correctly transforms markdown content.
 */

import { jest } from '@jest/globals';
import { projectAgent, applySpreadUpdates } from '../../../worker/agents/project-agent.js';
import { createMockClaudeClient, createMockLogger } from '../helpers/mock-factories.js';

describe('Project Actions', () => {
  let logger;

  const context = {
    projectSlug: 'test-project',
    spread: '# Test Project\n\n## Status\nActive\n\n## Notes\nSome notes',
    date: '2026-01-31',
    time: '10:00',
  };

  beforeEach(() => {
    logger = createMockLogger();
  });

  describe('projectAgent', () => {
    describe('context: project update message', () => {
      it('should generate spread update actions', async () => {
        // Given Claude returns spread updates for the message
        const claudeClient = createMockClaudeClient({
          messageJson: [{
            thinking: 'User is adding a status update',
            spread_updates: [
              { section: 'Status', action: 'replace', content: 'In progress - phase 2' },
              { section: 'Notes', action: 'append', content: '- Started phase 2 work' },
            ],
            slack_reply: 'Updated status and notes.',
          }],
        });

        // When projectAgent processes the message
        const result = await projectAgent(
          'Moving to phase 2 now',
          context,
          { claudeClient, logger }
        );

        // Then it generates spread update actions for the project file
        const spreadActions = result.actions.filter(
          (a) => a.file === 'projects/test-project/spread.md'
        );
        expect(spreadActions.length).toBeGreaterThanOrEqual(2);

        // And the first action targets the Status section
        const statusAction = spreadActions.find((a) => a.section === '## Status');
        expect(statusAction).toBeDefined();
      });
    });

    describe('context: research trigger message', () => {
      it('should return start_research action when message contains "research"', async () => {
        // Given Claude extracts a research query from the message
        const claudeClient = createMockClaudeClient({
          messageJson: [{
            query: 'best testing frameworks 2026',
            scope: 'Compare modern JavaScript testing frameworks',
          }],
        });

        // When projectAgent processes a message containing "research"
        const result = await projectAgent(
          'Can you research best testing frameworks?',
          context,
          { claudeClient, logger }
        );

        // Then it returns a start_research action
        expect(result.actions[0].type).toBe('start_research');
        expect(result.actions[0].projectSlug).toBe('test-project');
        expect(result.actions[0].query).toBe('best testing frameworks 2026');
      });
    });

    describe('context: log entry generation', () => {
      it('should include a log entry append in generated actions', async () => {
        // Given Claude returns a spread update
        const claudeClient = createMockClaudeClient({
          messageJson: [{
            thinking: 'Adding note',
            spread_updates: [
              { section: 'Notes', action: 'append', content: '- New finding' },
            ],
            slack_reply: 'Added note.',
          }],
        });

        // When projectAgent processes the message
        const result = await projectAgent(
          'Found something interesting about the project',
          context,
          { claudeClient, logger }
        );

        // Then the actions include a log entry append
        const logAction = result.actions.find(
          (a) => a.section === '## Log' && a.file === 'projects/test-project/spread.md'
        );
        expect(logAction).toBeDefined();
        expect(logAction.type).toBe('append_to_section');
        expect(logAction.content).toContain('2026-01-31 10:00');
      });
    });
  });

  describe('applySpreadUpdates', () => {
    const baseSpread = '# Test Project\n\n## Status\nActive\n\n## Notes\nSome notes\n\n## Log\n- 2026-01-25 | Created';

    describe('context: appending to existing section', () => {
      it('should append content to the section', () => {
        // Given a spread with an existing Notes section
        // When an append update is applied to Notes
        const result = applySpreadUpdates(baseSpread, [
          { section: 'Notes', action: 'append', content: '- Additional note' },
        ]);

        // Then the original content is preserved
        expect(result).toContain('Some notes');
        // And the new content is appended
        expect(result).toContain('- Additional note');
        // And the new content appears after the original
        expect(result.indexOf('- Additional note')).toBeGreaterThan(result.indexOf('Some notes'));
      });
    });

    describe('context: creating a new section', () => {
      it('should create the section when it does not exist', () => {
        // Given a spread without a Research section
        // When an append update targets a non-existent section
        const result = applySpreadUpdates(baseSpread, [
          { section: 'Research', action: 'append', content: '- Finding from research' },
        ]);

        // Then the new section header is added
        expect(result).toContain('## Research');
        // And the content is included
        expect(result).toContain('- Finding from research');
      });
    });

    describe('context: replacing section content', () => {
      it('should replace the section content when action is replace', () => {
        // Given a spread with existing Status content
        // When a replace update is applied to Status
        const result = applySpreadUpdates(baseSpread, [
          { section: 'Status', action: 'replace', content: 'Completed' },
        ]);

        // Then the old content is gone
        expect(result).not.toMatch(/\nActive\n/);
        // And the new content is present
        expect(result).toContain('Completed');
      });
    });

    describe('context: multiple sequential updates', () => {
      it('should handle multiple updates in sequence', () => {
        // Given a spread with multiple sections
        // When multiple updates are applied in one call
        const result = applySpreadUpdates(baseSpread, [
          { section: 'Status', action: 'replace', content: 'In progress' },
          { section: 'Notes', action: 'append', content: '- Note A' },
          { section: 'Log', action: 'append', content: '- 2026-01-31 | Updated' },
        ]);

        // Then all updates are reflected in the output
        expect(result).toContain('In progress');
        expect(result).toContain('- Note A');
        expect(result).toContain('- 2026-01-31 | Updated');
        // And the original log entry is still present
        expect(result).toContain('- 2026-01-25 | Created');
      });
    });
  });
});
