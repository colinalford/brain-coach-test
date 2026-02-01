/**
 * Tests for BrainDO channel routing: getChannelType and extractProjectSlug.
 *
 * These methods determine how incoming messages are routed based on
 * Slack channel ID or channel name conventions.
 */

import { jest } from '@jest/globals';
import { BrainDO, CHANNEL_TYPES } from '../../../worker/durable-objects/brain-do.js';
import { createMockState, createMockEnv } from '../helpers/mock-factories.js';

describe('Channel Routing', () => {
  let brain;

  beforeEach(() => {
    // Given a BrainDO instance with standard mock env (C_INBOX, C_WEEKLY, C_MONTHLY)
    brain = new BrainDO(createMockState(), createMockEnv());
  });

  describe('getChannelType', () => {
    describe('context: env-configured channel IDs take priority', () => {
      it('should return INBOX when channel ID matches SLACK_INBOX_CHANNEL_ID', () => {
        // Given the env has SLACK_INBOX_CHANNEL_ID = 'C_INBOX'
        // When getChannelType is called with that channel ID
        const result = brain.getChannelType('C_INBOX', 'some-other-name');

        // Then it returns INBOX regardless of channel name
        expect(result).toBe(CHANNEL_TYPES.INBOX);
      });

      it('should return WEEKLY when channel ID matches SLACK_WEEKLY_CHANNEL_ID', () => {
        // Given the env has SLACK_WEEKLY_CHANNEL_ID = 'C_WEEKLY'
        // When getChannelType is called with that channel ID
        const result = brain.getChannelType('C_WEEKLY', null);

        // Then it returns WEEKLY
        expect(result).toBe(CHANNEL_TYPES.WEEKLY);
      });

      it('should return MONTHLY when channel ID matches SLACK_MONTHLY_CHANNEL_ID', () => {
        // Given the env has SLACK_MONTHLY_CHANNEL_ID = 'C_MONTHLY'
        // When getChannelType is called with that channel ID
        const result = brain.getChannelType('C_MONTHLY', null);

        // Then it returns MONTHLY
        expect(result).toBe(CHANNEL_TYPES.MONTHLY);
      });
    });

    describe('context: channel name pattern fallback', () => {
      it('should return INBOX when channel name is sb-inbox', () => {
        // Given a channel ID that does not match any env-configured ID
        // When getChannelType is called with channel name 'sb-inbox'
        const result = brain.getChannelType('C_UNKNOWN', 'sb-inbox');

        // Then it returns INBOX based on name pattern
        expect(result).toBe(CHANNEL_TYPES.INBOX);
      });

      it('should return PROJECT when channel name starts with proj-', () => {
        // Given a channel name following the 'proj-*' convention
        // When getChannelType is called with 'proj-find-pcp'
        const result = brain.getChannelType('C_UNKNOWN', 'proj-find-pcp');

        // Then it returns PROJECT
        expect(result).toBe(CHANNEL_TYPES.PROJECT);
      });

      it('should return PROJECT for any proj- prefixed channel', () => {
        // Given multiple project channel names
        // When getChannelType is called with each
        // Then all return PROJECT
        expect(brain.getChannelType('C_UNKNOWN', 'proj-website')).toBe(CHANNEL_TYPES.PROJECT);
        expect(brain.getChannelType('C_UNKNOWN', 'proj-a')).toBe(CHANNEL_TYPES.PROJECT);
        expect(brain.getChannelType('C_UNKNOWN', 'proj-long-slug-name')).toBe(CHANNEL_TYPES.PROJECT);
      });

      it('should return WEEKLY when channel name is sb-weekly', () => {
        // Given a channel name 'sb-weekly' with an unrecognized ID
        // When getChannelType is called
        const result = brain.getChannelType('C_UNKNOWN', 'sb-weekly');

        // Then it returns WEEKLY
        expect(result).toBe(CHANNEL_TYPES.WEEKLY);
      });

      it('should return MONTHLY when channel name is sb-monthly', () => {
        // Given a channel name 'sb-monthly' with an unrecognized ID
        // When getChannelType is called
        const result = brain.getChannelType('C_UNKNOWN', 'sb-monthly');

        // Then it returns MONTHLY
        expect(result).toBe(CHANNEL_TYPES.MONTHLY);
      });
    });

    describe('context: unknown channels', () => {
      it('should return UNKNOWN when neither ID nor name matches', () => {
        // Given a channel with no matching ID or name pattern
        // When getChannelType is called
        const result = brain.getChannelType('C_RANDOM', 'random-channel');

        // Then it returns UNKNOWN
        expect(result).toBe(CHANNEL_TYPES.UNKNOWN);
      });

      it('should return UNKNOWN when channel name is null', () => {
        // Given an unrecognized ID and no channel name
        // When getChannelType is called with null name
        const result = brain.getChannelType('C_RANDOM', null);

        // Then it returns UNKNOWN
        expect(result).toBe(CHANNEL_TYPES.UNKNOWN);
      });

      it('should return UNKNOWN when channel name is undefined', () => {
        // Given an unrecognized ID and undefined channel name
        // When getChannelType is called without a name argument
        const result = brain.getChannelType('C_RANDOM', undefined);

        // Then it returns UNKNOWN
        expect(result).toBe(CHANNEL_TYPES.UNKNOWN);
      });
    });
  });

  describe('extractProjectSlug', () => {
    describe('context: valid project channel names', () => {
      it('should extract slug from proj-find-pcp', () => {
        // Given a project channel name 'proj-find-pcp'
        // When extractProjectSlug is called
        const result = brain.extractProjectSlug('proj-find-pcp');

        // Then it returns the slug 'find-pcp'
        expect(result).toBe('find-pcp');
      });

      it('should extract slug from proj-website-redesign', () => {
        // Given a project channel name with a multi-word slug
        // When extractProjectSlug is called
        const result = brain.extractProjectSlug('proj-website-redesign');

        // Then it returns the full slug after the prefix
        expect(result).toBe('website-redesign');
      });

      it('should extract a single-word slug from proj-test', () => {
        // Given a project channel name with a single-word slug
        // When extractProjectSlug is called
        const result = brain.extractProjectSlug('proj-test');

        // Then it returns 'test'
        expect(result).toBe('test');
      });
    });

    describe('context: non-project channel names', () => {
      it('should return null for sb-inbox', () => {
        // Given a non-project channel name
        // When extractProjectSlug is called
        const result = brain.extractProjectSlug('sb-inbox');

        // Then it returns null
        expect(result).toBeNull();
      });

      it('should return null for null input', () => {
        // Given null as channel name
        // When extractProjectSlug is called
        const result = brain.extractProjectSlug(null);

        // Then it returns null
        expect(result).toBeNull();
      });

      it('should return null for undefined input', () => {
        // Given undefined as channel name
        // When extractProjectSlug is called
        const result = brain.extractProjectSlug(undefined);

        // Then it returns null
        expect(result).toBeNull();
      });

      it('should return null for channel names that contain but do not start with proj-', () => {
        // Given a channel name that contains 'proj-' but not at the start
        // When extractProjectSlug is called
        const result = brain.extractProjectSlug('my-proj-thing');

        // Then it returns null
        expect(result).toBeNull();
      });
    });
  });
});
