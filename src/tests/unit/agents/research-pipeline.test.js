/**
 * Tests for Research Agent exported functions — evaluateResults, planResearch,
 * and qualityCheck.
 *
 * Uses mock Claude client to isolate evaluation/planning logic from
 * network and search concerns.
 */

import { jest } from '@jest/globals';
import { evaluateResults, planResearch, qualityCheck } from '../../../worker/agents/research-agent.js';
import { createMockClaudeClient, createMockLogger } from '../helpers/mock-factories.js';

describe('Research Pipeline', () => {
  let logger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  describe('evaluateResults', () => {
    describe('context: empty criteria with findings present', () => {
      it('should return complete: true when findings exist', async () => {
        // Given findings exist but criteria list is empty
        const findings = [
          { title: 'Result A', content: 'Some content', source: 'https://example.com/a' },
        ];
        const criteria = [];
        const claudeClient = createMockClaudeClient();

        // When evaluateResults is called
        const result = await evaluateResults(findings, criteria, claudeClient, logger);

        // Then it returns complete since there are findings and no criteria to fail
        expect(result.complete).toBe(true);
        expect(result.gap_queries).toHaveLength(0);
      });
    });

    describe('context: empty findings', () => {
      it('should return complete: false since no data was gathered', async () => {
        // Given no findings at all but criteria exist
        const findings = [];
        const criteria = ['must have contact info'];
        const claudeClient = createMockClaudeClient();

        // When evaluateResults is called
        const result = await evaluateResults(findings, criteria, claudeClient, logger);

        // Then it returns incomplete because there is nothing to evaluate
        expect(result.complete).toBe(false);
      });
    });

    describe('context: findings matching criteria', () => {
      it('should return complete: true when Claude confirms completeness', async () => {
        // Given findings that satisfy the criteria
        const findings = [
          { title: 'Clinic A', content: 'Phone: 555-1234, Specialty: Internal Medicine', source: 'https://example.com' },
          { title: 'Clinic B', content: 'Phone: 555-5678, Specialty: Family Medicine', source: 'https://example.com/b' },
        ];
        const criteria = ['has phone numbers', 'has specialties'];

        // And Claude evaluates them as complete
        const claudeClient = createMockClaudeClient({
          messageJson: [{ complete: true, missing: [], gap_queries: [] }],
        });

        // When evaluateResults is called
        const result = await evaluateResults(findings, criteria, claudeClient, logger);

        // Then it returns complete
        expect(result.complete).toBe(true);
        expect(result.missing).toHaveLength(0);
      });
    });

    describe('context: incomplete findings', () => {
      it('should return gap queries when Claude identifies missing data', async () => {
        // Given findings that do not fully meet criteria
        const findings = [
          { title: 'Clinic A', content: 'Good reviews but no phone', source: 'https://example.com' },
        ];
        const criteria = ['has phone numbers', 'has reviews'];

        // And Claude identifies gaps
        const claudeClient = createMockClaudeClient({
          messageJson: [{
            complete: false,
            missing: ['phone numbers for Clinic A'],
            gap_queries: ['Clinic A phone number contact info'],
          }],
        });

        // When evaluateResults is called
        const result = await evaluateResults(findings, criteria, claudeClient, logger);

        // Then it returns incomplete with gap queries
        expect(result.complete).toBe(false);
        expect(result.gap_queries.length).toBeGreaterThan(0);
        expect(result.missing).toContain('phone numbers for Clinic A');
      });
    });
  });

  describe('planResearch', () => {
    describe('context: successful planning', () => {
      it('should return queries array from Claude response', async () => {
        // Given Claude returns a well-formed plan
        const claudeClient = createMockClaudeClient({
          messageJson: [{
            queries: ['query alpha', 'query beta', 'query gamma'],
            format: 'comparison table',
            completeness_criteria: ['has pricing', 'has reviews'],
          }],
        });

        // When planResearch is called
        const plan = await planResearch('test topic', {}, claudeClient, logger);

        // Then the returned plan includes the queries from Claude
        expect(plan.queries).toEqual(['query alpha', 'query beta', 'query gamma']);
        expect(plan.format).toBe('comparison table');
        expect(plan.completeness_criteria).toHaveLength(2);
      });
    });

    describe('context: planning failure', () => {
      it('should fall back to [query] if Claude errors', async () => {
        // Given Claude throws an error during planning
        const claudeClient = createMockClaudeClient({
          messageJson: [() => { throw new Error('Claude API error'); }],
        });

        // When planResearch is called
        const plan = await planResearch('fallback query', {}, claudeClient, logger);

        // Then it falls back to using the original query
        expect(plan.queries).toEqual(['fallback query']);
        expect(plan.format).toBe('structured summary');
        expect(plan.completeness_criteria).toEqual([]);
      });
    });

    describe('context: project context inclusion', () => {
      it('should include project context in system prompt when projectSlug provided', async () => {
        // Given a project slug and spread are provided
        const claudeClient = createMockClaudeClient({
          messageJson: [{
            queries: ['project-aware query'],
            format: 'summary',
            completeness_criteria: [],
          }],
        });

        const projectContext = {
          projectSlug: 'find-pcp',
          spread: '# Find PCP\n## Summary\nFinding a primary care physician',
        };

        // When planResearch is called with project context
        await planResearch('doctors in asheville', projectContext, claudeClient, logger);

        // Then Claude was called with a system prompt mentioning the project
        const systemArg = claudeClient.messageJson.mock.calls[0][0].system;
        expect(systemArg).toContain('find-pcp');
      });
    });
  });

  describe('qualityCheck', () => {
    const sampleSynthesis = {
      summary: 'Found 3 options for primary care.',
      keyPoints: ['Option A is closest', 'Option B has best reviews'],
      recommendations: ['Schedule visit with Option A'],
      sources: ['https://example.com'],
    };

    describe('context: successful quality check', () => {
      it('should return score and issues from Claude response', async () => {
        // Given Claude returns a quality evaluation
        const claudeClient = createMockClaudeClient({
          messageJson: [{
            score: 0.85,
            issues: [],
          }],
        });

        // When qualityCheck is called
        const result = await qualityCheck(
          sampleSynthesis,
          { query: 'primary care options' },
          claudeClient,
          logger
        );

        // Then it returns the score and empty issues array
        expect(result.score).toBe(0.85);
        expect(result.issues).toHaveLength(0);
      });
    });

    describe('context: quality check failure', () => {
      it('should return default 0.7 score if quality check fails', async () => {
        // Given Claude throws an error during quality check
        const claudeClient = createMockClaudeClient({
          messageJson: [() => { throw new Error('Quality check API error'); }],
        });

        // When qualityCheck is called
        const result = await qualityCheck(
          sampleSynthesis,
          { query: 'test' },
          claudeClient,
          logger
        );

        // Then it returns the default passing score
        expect(result.score).toBe(0.7);
        expect(result.issues).toHaveLength(0);
      });
    });

    describe('context: low quality score', () => {
      it('should indicate retry needed when score is below 0.7', async () => {
        // Given Claude returns a low quality score with issues
        const claudeClient = createMockClaudeClient({
          messageJson: [{
            score: 0.4,
            issues: ['Missing specific addresses', 'No comparison between options'],
          }],
        });

        // When qualityCheck is called
        const result = await qualityCheck(
          sampleSynthesis,
          { query: 'compare clinics with addresses' },
          claudeClient,
          logger
        );

        // Then the score is below the retry threshold
        expect(result.score).toBeLessThan(0.7);
        // And specific issues are returned
        expect(result.issues).toHaveLength(2);
        expect(result.issues).toContain('Missing specific addresses');
      });
    });
  });
});
