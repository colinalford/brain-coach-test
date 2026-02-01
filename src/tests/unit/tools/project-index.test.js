/**
 * Tests for project-index.js — index generation and filtering.
 */

import {
  parseSpreadForIndex,
  buildIndexContent,
  filterActiveProjects,
  buildActiveIndexSummary,
} from '../../../worker/lib/project-index.js';

describe('Project Index', () => {
  describe('parseSpreadForIndex', () => {
    it('should extract name from H1 heading', () => {
      const content = '# Website Redesign\n\n## Status\nActive\n\n## Description\nRedesign the company site\n';
      const result = parseSpreadForIndex('website-redesign', content);
      expect(result.name).toBe('Website Redesign');
      expect(result.slug).toBe('website-redesign');
    });

    it('should extract status from Status section', () => {
      const content = '# Test\n\n## Status\nActive\n\n## Description\nTest project\n';
      const result = parseSpreadForIndex('test', content);
      expect(result.status).toBe('active');
    });

    it('should handle archived status', () => {
      const content = '# Old Project\n\n## Status\nArchived\n\n## Description\nDone\n';
      const result = parseSpreadForIndex('old', content);
      expect(result.status).toBe('archived');
    });

    it('should extract first line of description', () => {
      const content = '# Test\n\n## Status\nActive\n\n## Description\nFirst line\nSecond line\n';
      const result = parseSpreadForIndex('test', content);
      expect(result.description).toBe('First line');
    });

    it('should fall back to slug for name when no H1', () => {
      const content = '## Status\nActive\n';
      const result = parseSpreadForIndex('my-project', content);
      expect(result.name).toBe('my-project');
    });

    it('should default to active when no status section', () => {
      const content = '# Test\n\nSome content\n';
      const result = parseSpreadForIndex('test', content);
      expect(result.status).toBe('active');
    });
  });

  describe('buildIndexContent', () => {
    it('should generate a markdown table', () => {
      const projects = [
        { slug: 'alpha', name: 'Alpha', status: 'active', description: 'First project' },
        { slug: 'beta', name: 'Beta', status: 'archived', description: 'Done' },
      ];
      const content = buildIndexContent(projects);
      expect(content).toContain('# Project Index');
      expect(content).toContain('| [Alpha](alpha/spread.md) | active | First project |');
      expect(content).toContain('| [Beta](beta/spread.md) | archived | Done |');
    });

    it('should sort active projects before archived', () => {
      const projects = [
        { slug: 'beta', name: 'Beta', status: 'archived', description: 'Done' },
        { slug: 'alpha', name: 'Alpha', status: 'active', description: 'Active' },
      ];
      const content = buildIndexContent(projects);
      const alphaIdx = content.indexOf('Alpha');
      const betaIdx = content.indexOf('Beta');
      expect(alphaIdx).toBeLessThan(betaIdx);
    });

    it('should sort alphabetically within same status', () => {
      const projects = [
        { slug: 'zebra', name: 'Zebra', status: 'active', description: '' },
        { slug: 'alpha', name: 'Alpha', status: 'active', description: '' },
      ];
      const content = buildIndexContent(projects);
      const alphaIdx = content.indexOf('Alpha');
      const zebraIdx = content.indexOf('Zebra');
      expect(alphaIdx).toBeLessThan(zebraIdx);
    });
  });

  describe('filterActiveProjects', () => {
    it('should return only active projects', () => {
      const projects = [
        { slug: 'a', name: 'A', status: 'active', description: '' },
        { slug: 'b', name: 'B', status: 'archived', description: '' },
        { slug: 'c', name: 'C', status: 'active', description: '' },
      ];
      const active = filterActiveProjects(projects);
      expect(active).toHaveLength(2);
      expect(active.map(p => p.slug)).toEqual(['a', 'c']);
    });

    it('should return empty array when no active projects', () => {
      const projects = [
        { slug: 'a', name: 'A', status: 'archived', description: '' },
      ];
      expect(filterActiveProjects(projects)).toHaveLength(0);
    });
  });

  describe('buildActiveIndexSummary', () => {
    it('should generate a table with only active projects', () => {
      const projects = [
        { slug: 'a', name: 'A', status: 'active', description: 'Active one' },
        { slug: 'b', name: 'B', status: 'archived', description: 'Done' },
      ];
      const summary = buildActiveIndexSummary(projects);
      expect(summary).toContain('A');
      expect(summary).not.toContain('B');
    });

    it('should return "No active projects." when none are active', () => {
      const projects = [
        { slug: 'a', name: 'A', status: 'archived', description: '' },
      ];
      expect(buildActiveIndexSummary(projects)).toBe('No active projects.');
    });
  });
});
