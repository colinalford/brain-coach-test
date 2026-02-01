/**
 * Tests for BrainDO.handleCommand routing logic.
 *
 * Verifies that slash commands are dispatched to the correct handler
 * methods, including the early-intercept path for /project research.
 */

import { jest } from '@jest/globals';
import { BrainDO } from '../../../worker/durable-objects/brain-do.js';
import { createMockState, createMockEnv, createMockLogger } from '../helpers/mock-factories.js';

describe('Command Dispatch', () => {
  let brain;
  let logger;
  let originalFetch;

  beforeEach(() => {
    const state = createMockState();
    const env = createMockEnv();
    brain = new BrainDO(state, env);

    // Pre-load context to skip ensureContext network calls
    brain.contextPack = 'mock context pack';
    brain.contextVersion = 'mock-sha';

    logger = createMockLogger();

    // Save and mock global fetch for response_url calls
    originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async () => new Response('ok', { status: 200 }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  /**
   * Helper to build a command payload.
   */
  function makePayload(overrides = {}) {
    return {
      command: '/what-matters',
      args: '',
      user_id: 'U_TEST',
      channel_id: 'C_INBOX',
      channel_name: 'sb-inbox',
      response_url: 'https://hooks.slack.com/commands/test',
      ...overrides,
    };
  }

  describe('/what-matters', () => {
    it('should route to handleWhatMatters', async () => {
      // Given the /what-matters command
      const spy = jest.spyOn(brain, 'handleWhatMatters').mockResolvedValue('Today: focus on tests');

      // When handleCommand is called
      const response = await brain.handleCommand(
        makePayload({ command: '/what-matters', args: '' }),
        logger
      );

      // Then handleWhatMatters is invoked (with args and logger)
      expect(spy).toHaveBeenCalledWith('', logger);

      // And the response indicates success
      const body = await response.json();
      expect(body.status).toBe('ok');
      expect(body.command).toBe('/what-matters');

      // And the result is sent to response_url
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/commands/test',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('/capture', () => {
    it('should route to handleCapture with args', async () => {
      // Given the /capture command with arguments
      const spy = jest.spyOn(brain, 'handleCapture').mockResolvedValue('Captured task.');

      // When handleCommand is called
      const response = await brain.handleCommand(
        makePayload({ command: '/capture', args: 'task Buy groceries' }),
        logger
      );

      // Then handleCapture is invoked with the args
      expect(spy).toHaveBeenCalledWith('task Buy groceries', logger);

      // And the response indicates success
      const body = await response.json();
      expect(body.status).toBe('ok');
      expect(body.command).toBe('/capture');
    });
  });

  describe('/ritual', () => {
    it('should route to handleRitualCommand', async () => {
      // Given the /ritual command
      const spy = jest.spyOn(brain, 'handleRitualCommand').mockResolvedValue('Starting weekly ritual...');

      // When handleCommand is called
      const response = await brain.handleCommand(
        makePayload({ command: '/ritual', args: 'weekly', channel_id: 'C_WEEKLY' }),
        logger
      );

      // Then handleRitualCommand is invoked with args and channel_id
      expect(spy).toHaveBeenCalledWith('weekly', 'C_WEEKLY', logger);

      // And the response indicates success
      const body = await response.json();
      expect(body.status).toBe('ok');
      expect(body.command).toBe('/ritual');
    });
  });

  describe('/project', () => {
    it('should route to handleProjectCommand for non-research subcommands', async () => {
      // Given the /project list command
      const spy = jest.spyOn(brain, 'handleProjectCommand').mockResolvedValue('No active projects.');

      // When handleCommand is called with /project list
      const response = await brain.handleCommand(
        makePayload({ command: '/project', args: 'list' }),
        logger
      );

      // Then handleProjectCommand is invoked
      expect(spy).toHaveBeenCalledWith('list', 'C_INBOX', logger);

      // And the response indicates success
      const body = await response.json();
      expect(body.status).toBe('ok');
      expect(body.command).toBe('/project');
    });

    it('should early-return with research_started for /project research with a query', async () => {
      // Given the /project research command with a query
      const startResearchSpy = jest.spyOn(brain, 'startResearch').mockResolvedValue({});

      // When handleCommand is called
      const response = await brain.handleCommand(
        makePayload({ command: '/project', args: 'research concierge doctors in asheville' }),
        logger
      );

      // Then the response indicates research_started (early return)
      const body = await response.json();
      expect(body.status).toBe('ok');
      expect(body.action).toBe('research_started');

      // And the ephemeral ack was sent to response_url
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/commands/test',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Research started'),
        })
      );

      // And startResearch was kicked off in the background
      expect(startResearchSpy).toHaveBeenCalledWith(
        'concierge doctors in asheville',
        'C_INBOX',
        'sb-inbox',
        logger
      );
    });

    it('should fall through to handleProjectCommand when /project research has no query', async () => {
      // Given the /project research command WITHOUT a query
      const projectSpy = jest.spyOn(brain, 'handleProjectCommand').mockResolvedValue('Usage: ...');
      const researchSpy = jest.spyOn(brain, 'startResearch').mockResolvedValue({});

      // When handleCommand is called
      const response = await brain.handleCommand(
        makePayload({ command: '/project', args: 'research' }),
        logger
      );

      // Then it does NOT trigger startResearch
      expect(researchSpy).not.toHaveBeenCalled();

      // And it falls through to handleProjectCommand for the usage message
      expect(projectSpy).toHaveBeenCalledWith('research', 'C_INBOX', logger);

      const body = await response.json();
      expect(body.status).toBe('ok');
    });
  });

  describe('unknown command', () => {
    it('should respond with an error message via response_url', async () => {
      // Given an unrecognized command
      // When handleCommand is called
      const response = await brain.handleCommand(
        makePayload({ command: '/unknown-thing', args: '' }),
        logger
      );

      // Then the response indicates success (the handler itself doesn't fail)
      const body = await response.json();
      expect(body.status).toBe('ok');

      // And the response_url receives an ephemeral error message
      const fetchCall = globalThis.fetch.mock.calls[0];
      const sentBody = JSON.parse(fetchCall[1].body);
      expect(sentBody.response_type).toBe('ephemeral');
      expect(sentBody.text).toContain('Unknown command');
      expect(sentBody.text).toContain('/unknown-thing');
    });
  });

  describe('error handling', () => {
    it('should send error to response_url when handler throws', async () => {
      // Given a command whose handler throws an error
      jest.spyOn(brain, 'handleWhatMatters').mockRejectedValue(new Error('Claude API down'));

      // When handleCommand is called
      // Then it throws the error upward
      await expect(
        brain.handleCommand(
          makePayload({ command: '/what-matters', args: '' }),
          logger
        )
      ).rejects.toThrow('Claude API down');

      // And the error was reported to response_url
      const fetchCall = globalThis.fetch.mock.calls[0];
      const sentBody = JSON.parse(fetchCall[1].body);
      expect(sentBody.response_type).toBe('ephemeral');
      expect(sentBody.text).toContain('failed');
      expect(sentBody.text).toContain('Claude API down');
    });
  });
});
