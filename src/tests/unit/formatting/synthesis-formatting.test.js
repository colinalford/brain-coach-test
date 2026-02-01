/**
 * Tests for synthesis formatting utilities.
 *
 * formatSynthesisForSpread renders a synthesis object as markdown suitable for
 * appending to a project spread document.
 *
 * formatSynthesisForSlack renders a compact Slack-friendly version with
 * truncated lists and distinctive bullet characters.
 */

import { formatSynthesisForSpread, formatSynthesisForSlack } from '../../../worker/agents/synthesis-agent.js';

describe('Synthesis Formatting', () => {
  const synthesis = {
    summary: 'Research found several options.',
    keyPoints: ['Point 1', 'Point 2', 'Point 3'],
    recommendations: ['Rec 1', 'Rec 2'],
    sources: ['https://example.com'],
  };

  describe('formatSynthesisForSpread', () => {
    describe('context: heading and metadata', () => {
      it('should include the query and date in a heading', () => {
        // Given a synthesis, query, and date
        // When formatted for spread
        const result = formatSynthesisForSpread(synthesis, 'best frameworks', '2026-01-31');

        // Then the heading contains both query and date
        expect(result).toContain('### best frameworks (2026-01-31)');
      });
    });

    describe('context: summary text', () => {
      it('should include the summary text', () => {
        // Given a synthesis with a summary
        // When formatted for spread
        const result = formatSynthesisForSpread(synthesis, 'test query', '2026-01-31');

        // Then the summary appears in the output
        expect(result).toContain('Research found several options.');
      });
    });

    describe('context: key points section', () => {
      it('should format key points as a bullet list under Key Findings', () => {
        // Given a synthesis with three key points
        // When formatted for spread
        const result = formatSynthesisForSpread(synthesis, 'test query', '2026-01-31');

        // Then each key point appears as a markdown bullet under the Key Findings header
        expect(result).toContain('**Key Findings:**');
        expect(result).toContain('- Point 1');
        expect(result).toContain('- Point 2');
        expect(result).toContain('- Point 3');
      });
    });

    describe('context: recommendations section', () => {
      it('should format recommendations as a bullet list', () => {
        // Given a synthesis with recommendations
        // When formatted for spread
        const result = formatSynthesisForSpread(synthesis, 'test query', '2026-01-31');

        // Then each recommendation appears as a markdown bullet under the Recommendations header
        expect(result).toContain('**Recommendations:**');
        expect(result).toContain('- Rec 1');
        expect(result).toContain('- Rec 2');
      });
    });

    describe('context: sources section', () => {
      it('should format sources as a bullet list', () => {
        // Given a synthesis with sources
        // When formatted for spread
        const result = formatSynthesisForSpread(synthesis, 'test query', '2026-01-31');

        // Then each source appears as a markdown bullet under the Sources header
        expect(result).toContain('**Sources:**');
        expect(result).toContain('- https://example.com');
      });
    });

    describe('context: empty optional fields', () => {
      it('should handle empty keyPoints gracefully', () => {
        // Given a synthesis with no key points
        const emptySynthesis = { ...synthesis, keyPoints: [] };

        // When formatted for spread
        const result = formatSynthesisForSpread(emptySynthesis, 'test query', '2026-01-31');

        // Then the Key Findings header is omitted
        expect(result).not.toContain('**Key Findings:**');
      });

      it('should handle empty recommendations gracefully', () => {
        // Given a synthesis with no recommendations
        const emptySynthesis = { ...synthesis, recommendations: [] };

        // When formatted for spread
        const result = formatSynthesisForSpread(emptySynthesis, 'test query', '2026-01-31');

        // Then the Recommendations header is omitted
        expect(result).not.toContain('**Recommendations:**');
      });

      it('should handle empty sources gracefully', () => {
        // Given a synthesis with no sources
        const emptySynthesis = { ...synthesis, sources: [] };

        // When formatted for spread
        const result = formatSynthesisForSpread(emptySynthesis, 'test query', '2026-01-31');

        // Then the Sources header is omitted
        expect(result).not.toContain('**Sources:**');
      });
    });
  });

  describe('formatSynthesisForSlack', () => {
    describe('context: header', () => {
      it('should start with a Research Complete header', () => {
        // Given a synthesis
        // When formatted for Slack
        const result = formatSynthesisForSlack(synthesis);

        // Then it starts with the Research Complete header
        expect(result).toMatch(/^\*\*Research Complete\*\*/);
      });
    });

    describe('context: summary', () => {
      it('should include the summary', () => {
        // Given a synthesis with a summary
        // When formatted for Slack
        const result = formatSynthesisForSlack(synthesis);

        // Then the summary text appears
        expect(result).toContain('Research found several options.');
      });
    });

    describe('context: key points limit', () => {
      it('should limit key points to 5 using bullet character', () => {
        // Given a synthesis with 7 key points
        const manySynthesis = {
          ...synthesis,
          keyPoints: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'],
        };

        // When formatted for Slack
        const result = formatSynthesisForSlack(manySynthesis);

        // Then only 5 key points appear, each prefixed with bullet
        const bulletMatches = result.match(/\u2022 /g);
        expect(bulletMatches).toHaveLength(5);
        expect(result).toContain('\u2022 P5');
        expect(result).not.toContain('\u2022 P6');
      });
    });

    describe('context: recommendations limit', () => {
      it('should limit recommendations to 3 using arrow prefix', () => {
        // Given a synthesis with 5 recommendations
        const manySynthesis = {
          ...synthesis,
          recommendations: ['R1', 'R2', 'R3', 'R4', 'R5'],
        };

        // When formatted for Slack
        const result = formatSynthesisForSlack(manySynthesis);

        // Then only 3 recommendations appear, each prefixed with arrow
        const arrowMatches = result.match(/\u2192 /g);
        expect(arrowMatches).toHaveLength(3);
        expect(result).toContain('\u2192 R3');
        expect(result).not.toContain('\u2192 R4');
      });
    });

    describe('context: empty synthesis', () => {
      it('should handle empty synthesis without errors', () => {
        // Given a synthesis with empty arrays
        const emptySynthesis = {
          summary: 'Nothing found.',
          keyPoints: [],
          recommendations: [],
          sources: [],
        };

        // When formatted for Slack
        const result = formatSynthesisForSlack(emptySynthesis);

        // Then it renders the header and summary without list sections
        expect(result).toContain('**Research Complete**');
        expect(result).toContain('Nothing found.');
        expect(result).not.toContain('\u2022');
        expect(result).not.toContain('\u2192');
      });
    });
  });
});
