/**
 * Tests for Ritual Coordinator — initialization, phase advancement,
 * commit behavior, and RitualDO /start route.
 *
 * Uses mock Claude client to isolate ritual flow logic.
 */

import { jest } from '@jest/globals';
import {
  initializeRitual,
  ritualCoordinator,
  RITUAL_PHASES,
} from '../../../worker/agents/ritual-coordinator.js';
import { RitualDO } from '../../../worker/durable-objects/ritual-do.js';
import {
  createMockClaudeClient,
  createMockLogger,
  createMockState,
  createMockEnv,
  createMockSlackClient,
  createMockGitHubReader,
} from '../helpers/mock-factories.js';

describe('Ritual Phases', () => {
  let logger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  describe('initializeRitual', () => {
    describe('context: session state structure', () => {
      it('should return session state with REFLECT phase', () => {
        const context = {
          roles: ['Engineer', 'Partner'],
          goals: ['Ship v1'],
          openLoops: ['Fix bug'],
        };

        const result = initializeRitual('weekly', context, { logger });

        expect(result.sessionState).toBeDefined();
        expect(result.sessionState.phase).toBe(RITUAL_PHASES.REFLECT);
        expect(result.sessionState.ritualType).toBe('weekly');
      });
    });

    describe('context: context passthrough', () => {
      it('should include roles, goals, and openLoops from context', () => {
        const context = {
          roles: ['Engineer', 'Partner'],
          goals: ['Ship v1', 'Exercise more'],
          openLoops: ['Fix bug', 'Call dentist'],
        };

        const result = initializeRitual('weekly', context, { logger });

        expect(result.sessionState.context.roles).toEqual(['Engineer', 'Partner']);
        expect(result.sessionState.context.goals).toEqual(['Ship v1', 'Exercise more']);
        expect(result.sessionState.context.openLoops).toEqual(['Fix bug', 'Call dentist']);
      });
    });

    describe('context: weekly ritual kickoff', () => {
      it('should return kickoff message with roles/goals for weekly ritual', () => {
        const context = {
          roles: ['Engineer'],
          goals: ['Ship v1'],
        };
        const result = initializeRitual('weekly', context, { logger });

        expect(result.slackReply).toContain('weekly review');
        expect(result.slackReply).toContain('Engineer');
        expect(result.slackReply).toContain('Ship v1');
        expect(result.slackReply).toContain('Reflect on the past week');
      });
    });

    describe('context: monthly ritual kickoff', () => {
      it('should return kickoff message with roles/goals for monthly ritual', () => {
        const context = {
          roles: ['Engineer'],
          goals: ['Ship v1'],
        };
        const result = initializeRitual('monthly', context, { logger });

        expect(result.slackReply).toContain('monthly review');
        expect(result.slackReply).toContain('Reflect on the past month');
      });
    });
  });

  describe('ritualCoordinator', () => {
    const createSessionState = (overrides = {}) => ({
      ritualType: 'weekly',
      phase: RITUAL_PHASES.REFLECT,
      messages: [],
      commitments: {
        rolesFocus: [],
        goalPriorities: [],
        keptLoops: [],
        weekCommitments: [],
        theme: null,
      },
      context: {
        roles: ['Engineer', 'Partner'],
        goals: ['Ship v1'],
        openLoops: ['Fix bug'],
      },
      lastPlanText: null,
      startedAt: Date.now(),
      ...overrides,
    });

    describe('context: skip / advance phase', () => {
      it('should advance from REFLECT to SORT when user says "skip"', async () => {
        const sessionState = createSessionState();
        const claudeClient = createMockClaudeClient();

        const result = await ritualCoordinator(
          'skip',
          sessionState,
          { claudeClient, logger }
        );

        expect(result.stateUpdate.phase).toBe(RITUAL_PHASES.SORT);
      });

      it('should advance from SORT to PLAN when user says "next"', async () => {
        const sessionState = createSessionState({ phase: RITUAL_PHASES.SORT });
        const claudeClient = createMockClaudeClient();

        const result = await ritualCoordinator(
          'next',
          sessionState,
          { claudeClient, logger }
        );

        expect(result.stateUpdate.phase).toBe(RITUAL_PHASES.PLAN);
      });
    });

    describe('context: commit in PLAN phase', () => {
      it('should return commit: true when user says "commit" during PLAN', async () => {
        const sessionState = createSessionState({
          phase: RITUAL_PHASES.PLAN,
          commitments: {
            rolesFocus: ['Engineering'],
            goalPriorities: ['Ship v1'],
            keptLoops: [],
            weekCommitments: ['Review PRs daily', 'Deploy feature'],
            theme: null,
          },
        });
        const claudeClient = createMockClaudeClient();

        const result = await ritualCoordinator(
          'commit',
          sessionState,
          { claudeClient, logger }
        );

        expect(result.commit).toBe(true);
        expect(result.planContent).toBeDefined();
        expect(result.planContent).toContain('Weekly Plan');
        expect(result.slackReply).toContain('Committed');
      });

      it('should also accept commit from SORT phase', async () => {
        const sessionState = createSessionState({
          phase: RITUAL_PHASES.SORT,
          commitments: {
            rolesFocus: ['Engineering'],
            goalPriorities: [],
            keptLoops: [],
            weekCommitments: ['Deploy feature'],
            theme: 'Focus and deliver',
          },
        });
        const claudeClient = createMockClaudeClient();

        const result = await ritualCoordinator(
          'commit',
          sessionState,
          { claudeClient, logger }
        );

        expect(result.commit).toBe(true);
        expect(result.planContent).toContain('Weekly Plan');
      });
    });

    describe('context: regular message processing', () => {
      it('should process with Claude and return response for a message', async () => {
        const sessionState = createSessionState();

        const claudeClient = createMockClaudeClient({
          message: [JSON.stringify({
            response: 'Here is my cognitive sorting of your reflection. You advanced in engineering but slipped on health.',
            captured: {
              insights: ['Engineering is strong this week'],
              commitments: [],
              focus_areas: ['Engineering'],
            },
            ready_to_advance: true,
          })],
        });

        const result = await ritualCoordinator(
          'Engineering is going great, shipped two features',
          sessionState,
          { claudeClient, logger }
        );

        expect(result.slackReply).toContain('cognitive sorting');
        expect(result.stateUpdate.commitments.rolesFocus).toContain('Engineering');
      });

      it('should auto-advance from REFLECT to SORT after processing', async () => {
        const sessionState = createSessionState({ phase: RITUAL_PHASES.REFLECT });

        const claudeClient = createMockClaudeClient({
          message: ['Great reflection. Here is the sorting.'],
        });

        const result = await ritualCoordinator(
          'This week was fine',
          sessionState,
          { claudeClient, logger }
        );

        expect(result.stateUpdate.phase).toBe(RITUAL_PHASES.SORT);
      });

      it('should auto-advance from SORT to PLAN after processing', async () => {
        const sessionState = createSessionState({ phase: RITUAL_PHASES.SORT });

        const claudeClient = createMockClaudeClient({
          message: ['Here is your plan for the week.'],
        });

        const result = await ritualCoordinator(
          'Focus on health and engineering this week',
          sessionState,
          { claudeClient, logger }
        );

        expect(result.stateUpdate.phase).toBe(RITUAL_PHASES.PLAN);
      });

      it('should stay in PLAN phase after processing (no auto-advance)', async () => {
        const sessionState = createSessionState({ phase: RITUAL_PHASES.PLAN });

        const claudeClient = createMockClaudeClient({
          message: ['Updated plan with your changes.'],
        });

        const result = await ritualCoordinator(
          'Actually move the gym commitment to 3x/week',
          sessionState,
          { claudeClient, logger }
        );

        // Should NOT have a phase in stateUpdate (stays in PLAN)
        expect(result.stateUpdate.phase).toBeUndefined();
      });
    });
  });
});

describe('RitualDO /start route', () => {
  let ritualDO;
  let mockState;
  let mockEnv;

  beforeEach(() => {
    mockState = createMockState();
    mockEnv = createMockEnv({
      GITHUB_TOKEN: 'ghp_mock',
      GITHUB_REPO: 'test/repo',
      SLACK_BOT_TOKEN: 'xoxb-mock',
      ANTHROPIC_API_KEY: 'sk-mock',
    });
    ritualDO = new RitualDO(mockState, mockEnv);

    // Inject mock clients
    ritualDO._logger = createMockLogger();
    ritualDO._slackClient = {
      postMessage: jest.fn(async () => ({
        ok: true,
        ts: '1234567890.000001',
        channel: 'C_WEEKLY',
      })),
      addReaction: jest.fn(async () => ({ ok: true })),
    };
    ritualDO._githubReader = createMockGitHubReader({
      'data/identity/roles.md': '## Roles\n- Engineer\n- Partner\n',
      'data/identity/goals.md': '## Goals\n- Ship v1\n- Exercise more\n',
      'data/current.md': '## Open Loops\n- Fix bug\n- Call dentist\n',
    });
  });

  it('should handle /start route and return a message', async () => {
    const request = new Request('http://internal/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ritualType: 'weekly',
        channelId: 'C_WEEKLY',
      }),
    });

    const response = await ritualDO.fetch(request);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.status).toBe('ok');
    expect(result.message).toBeDefined();
  });

  it('should post kickoff message to Slack channel', async () => {
    const request = new Request('http://internal/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ritualType: 'weekly',
        channelId: 'C_WEEKLY',
      }),
    });

    await ritualDO.fetch(request);

    expect(ritualDO._slackClient.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C_WEEKLY',
        text: expect.stringContaining('weekly review'),
      })
    );
  });

  it('should save session state keyed by thread timestamp', async () => {
    const request = new Request('http://internal/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ritualType: 'weekly',
        channelId: 'C_WEEKLY',
      }),
    });

    await ritualDO.fetch(request);

    expect(mockState.storage.put).toHaveBeenCalledWith(
      expect.stringMatching(/^ritual-/),
      expect.objectContaining({
        ritualType: 'weekly',
        phase: RITUAL_PHASES.REFLECT,
      })
    );
  });

  it('should load identity context for the ritual', async () => {
    const request = new Request('http://internal/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ritualType: 'weekly',
        channelId: 'C_WEEKLY',
      }),
    });

    await ritualDO.fetch(request);

    expect(ritualDO._githubReader.getContent).toHaveBeenCalledWith('data/identity/roles.md');
    expect(ritualDO._githubReader.getContent).toHaveBeenCalledWith('data/identity/goals.md');
  });

  it('should return 404 for unknown routes (not /start, /message, /health)', async () => {
    const request = new Request('http://internal/unknown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await ritualDO.fetch(request);

    expect(response.status).toBe(404);
  });
});
