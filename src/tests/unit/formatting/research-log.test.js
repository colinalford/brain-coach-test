/**
 * Tests for formatResearchLog from the research coordinator.
 *
 * formatResearchLog converts a research thread state object into an archival
 * markdown document containing the query, conversation, sources, and synthesis.
 */

import { formatResearchLog } from '../../../worker/agents/research-coordinator.js';

describe('formatResearchLog', () => {
  const baseThreadState = {
    query: 'best PCP near Portland',
    startedAt: new Date('2026-01-15T10:30:00Z').getTime(),
    scope: 'Healthcare',
    messages: [
      { role: 'user', content: 'Find me a good PCP near Portland.' },
      { role: 'assistant', content: 'I found several options in the Portland area.' },
    ],
    findings: [
      { title: 'Portland Health Clinic', source: 'https://portland-health.example.com' },
      { title: 'Oregon Primary Care', source: 'https://oregon-pc.example.com' },
    ],
    synthesis: {
      summary: 'Two strong candidates identified in the Portland area.',
    },
  };

  describe('context: title and metadata', () => {
    it('should include the query in the title', () => {
      // Given a thread state with a query
      // When formatting the research log
      const result = formatResearchLog(baseThreadState);

      // Then the title contains the query
      expect(result).toContain('# Research: best PCP near Portland');
    });

    it('should include the start time', () => {
      // Given a thread state with a startedAt timestamp
      // When formatting the research log
      const result = formatResearchLog(baseThreadState);

      // Then the start time appears as an ISO string
      expect(result).toContain('Started: 2026-01-15T10:30:00.000Z');
    });
  });

  describe('context: conversation section', () => {
    it('should format conversation messages with role labels', () => {
      // Given a thread state with user and assistant messages
      // When formatting the research log
      const result = formatResearchLog(baseThreadState);

      // Then user messages are bold-labeled and assistant messages are italic-labeled
      expect(result).toContain('**User**: Find me a good PCP near Portland.');
      expect(result).toContain('_Assistant_: I found several options in the Portland area.');
    });
  });

  describe('context: sources section', () => {
    it('should include sources as markdown links', () => {
      // Given a thread state with findings
      // When formatting the research log
      const result = formatResearchLog(baseThreadState);

      // Then each finding is a markdown link in the Sources section
      expect(result).toContain('## Sources');
      expect(result).toContain('- [Portland Health Clinic](https://portland-health.example.com)');
      expect(result).toContain('- [Oregon Primary Care](https://oregon-pc.example.com)');
    });
  });

  describe('context: synthesis section', () => {
    it('should include synthesis section when present', () => {
      // Given a thread state with a synthesis
      // When formatting the research log
      const result = formatResearchLog(baseThreadState);

      // Then the synthesis summary appears under a Synthesis heading
      expect(result).toContain('## Synthesis');
      expect(result).toContain('Two strong candidates identified in the Portland area.');
    });

    it('should omit synthesis section when not present', () => {
      // Given a thread state without a synthesis
      const stateWithoutSynthesis = { ...baseThreadState, synthesis: null };

      // When formatting the research log
      const result = formatResearchLog(stateWithoutSynthesis);

      // Then no Synthesis heading appears
      expect(result).not.toContain('## Synthesis');
    });
  });

  describe('context: empty data', () => {
    it('should handle empty findings gracefully', () => {
      // Given a thread state with no findings
      const stateNoFindings = { ...baseThreadState, findings: [] };

      // When formatting the research log
      const result = formatResearchLog(stateNoFindings);

      // Then the Sources section is omitted
      expect(result).not.toContain('## Sources');
      // And the finding count is 0
      expect(result).toContain('Findings: 0');
    });

    it('should handle empty messages gracefully', () => {
      // Given a thread state with no messages
      const stateNoMessages = { ...baseThreadState, messages: [] };

      // When formatting the research log
      const result = formatResearchLog(stateNoMessages);

      // Then the Conversation section exists but has no message entries
      expect(result).toContain('## Conversation');
      expect(result).not.toContain('**User**');
      expect(result).not.toContain('_Assistant_');
    });

    it('should handle undefined findings and messages gracefully', () => {
      // Given a thread state with undefined findings and messages
      const minimalState = {
        query: 'minimal query',
        startedAt: Date.now(),
      };

      // When formatting the research log
      const result = formatResearchLog(minimalState);

      // Then the log renders without errors
      expect(result).toContain('# Research: minimal query');
      expect(result).toContain('Findings: 0');
    });
  });
});
