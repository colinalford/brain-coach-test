/**
 * Research Agent - Unified research pipeline.
 *
 * Implements a 7-step research pipeline used by both slash commands
 * and project channel messages:
 *   1. PLAN - Parse request into search strategy
 *   2. SEARCH - Parallel Tavily queries
 *   3. EVALUATE - Check completeness against criteria
 *   4. FILL GAPS - Targeted follow-up searches
 *   5. SYNTHESIZE - Process through user + project context
 *   6. QUALITY CHECK - Evaluate artifact against original request
 *   7. DELIVER + PERSIST - Post to Slack, write to git
 */

import { formatSynthesisForSpread, formatSynthesisForSlack } from './synthesis-agent.js';
import { formatResearchLog } from './research-coordinator.js';

/**
 * Execute a full research pipeline.
 *
 * @param {Object} request
 * @param {string} request.query - Research query
 * @param {Object} context
 * @param {string|null} context.projectSlug - Associated project (if any)
 * @param {string|null} context.spread - Project spread.md content
 * @param {string} context.channelId - Slack channel ID
 * @param {string} context.threadTs - Thread timestamp for replies
 * @param {string|null} context.contextPack - User's current.md context
 * @param {Object} deps
 * @param {Object} deps.claudeClient - Claude API client
 * @param {Object} deps.tavilyClient - Tavily search client
 * @param {Object} deps.slackClient - Slack API client
 * @param {Object} deps.githubWriter - GitHub writer for persistence
 * @param {Object} deps.logger - Logger instance
 * @returns {Promise<Object>} Research result with synthesis and metadata
 */
export async function executeResearch(request, context, deps) {
  const { query } = request;
  const { projectSlug, spread, channelId, threadTs, contextPack } = context;
  const { claudeClient, tavilyClient, slackClient, githubWriter, logger } = deps;

  logger.info('Research pipeline starting', { query, projectSlug });

  // 1. PLAN
  const plan = await planResearch(query, context, claudeClient, logger);
  logger.info('Research planned', {
    queryCount: plan.queries.length,
    format: plan.format,
  });

  // Post progress update
  await slackClient.postMessage({
    channel: channelId,
    text: `Searching ${plan.queries.length} angles...`,
    thread_ts: threadTs,
  });

  // 2. SEARCH - Parallel queries
  const initialFindings = await parallelSearch(plan.queries, { tavilyClient, logger });
  logger.info('Initial search complete', { findingCount: initialFindings.length });

  // 3. EVALUATE completeness
  const evaluation = await evaluateResults(
    initialFindings,
    plan.completeness_criteria,
    claudeClient,
    logger
  );

  // 4. FILL GAPS (up to 2 rounds)
  let allFindings = [...initialFindings];
  if (!evaluation.complete && evaluation.gap_queries.length > 0) {
    await slackClient.postMessage({
      channel: channelId,
      text: `Filling gaps: ${evaluation.missing.join(', ')}`,
      thread_ts: threadTs,
    });

    const gapFindings = await parallelSearch(
      evaluation.gap_queries.slice(0, 3),
      { tavilyClient, logger }
    );
    allFindings = [...allFindings, ...gapFindings];

    // Second round if still incomplete
    const eval2 = await evaluateResults(
      allFindings,
      plan.completeness_criteria,
      claudeClient,
      logger
    );

    if (!eval2.complete && eval2.gap_queries.length > 0) {
      const gapFindings2 = await parallelSearch(
        eval2.gap_queries.slice(0, 2),
        { tavilyClient, logger }
      );
      allFindings = [...allFindings, ...gapFindings2];
    }
  }

  logger.info('Search phase complete', { totalFindings: allFindings.length });

  // 5. SYNTHESIZE through user context
  const synthesis = await synthesizeWithContext(
    allFindings,
    { query, format: plan.format, projectSlug, spread, contextPack },
    claudeClient,
    logger
  );

  // 6. QUALITY CHECK
  const quality = await qualityCheck(synthesis, request, claudeClient, logger);

  let finalSynthesis = synthesis;
  if (quality.score < 0.7 && quality.issues.length > 0) {
    logger.info('Quality check failed, retrying synthesis', { score: quality.score });
    finalSynthesis = await synthesizeWithContext(
      allFindings,
      {
        query,
        format: plan.format,
        projectSlug,
        spread,
        contextPack,
        qualityFeedback: quality.issues,
      },
      claudeClient,
      logger
    );
  }

  // 7. DELIVER + PERSIST
  const slackMessage = formatSynthesisForSlack(finalSynthesis);
  await slackClient.postMessage({
    channel: channelId,
    text: slackMessage,
    thread_ts: threadTs,
  });

  // Build thread state for logging
  const threadState = {
    query,
    scope: plan.format,
    findings: allFindings,
    synthesis: finalSynthesis,
    startedAt: Date.now(),
    messages: [],
  };

  await persistResearch(projectSlug, finalSynthesis, threadState, {
    query,
    allFindings,
    githubWriter,
    logger,
  });

  logger.info('Research pipeline complete', {
    query,
    projectSlug,
    findingCount: allFindings.length,
    qualityScore: quality.score,
  });

  return {
    synthesis: finalSynthesis,
    findings: allFindings,
    plan,
    quality,
    projectSlug,
  };
}

/**
 * Plan research: extract queries, output format, and completeness criteria.
 *
 * @param {string} query - User's research query
 * @param {Object} context - Research context
 * @param {Object} claudeClient - Claude client
 * @param {Object} logger - Logger
 * @returns {Promise<Object>} Plan with queries, format, completeness_criteria
 */
export async function planResearch(query, context, claudeClient, logger) {
  const { projectSlug, spread } = context;

  const system = `You are a research planner. Given a research request, create a search strategy.

${projectSlug ? `This research is for the "${projectSlug}" project.` : ''}
${spread ? `Project context:\n${spread.slice(0, 1000)}` : ''}

Respond with JSON:
{
  "queries": ["search query 1", "search query 2", "search query 3"],
  "format": "Brief description of desired output format",
  "completeness_criteria": ["criterion 1", "criterion 2", "criterion 3"]
}

Guidelines:
- Generate 2-3 specific search queries that cover different angles
- Make queries specific and targeted, not generic
- Completeness criteria define what "done" looks like for this research
- Format describes how results should be structured`;

  try {
    const plan = await claudeClient.messageJson({ system, userMessage: query });
    return {
      queries: plan.queries || [query],
      format: plan.format || 'structured summary',
      completeness_criteria: plan.completeness_criteria || [],
    };
  } catch (error) {
    logger.warn('Research planning failed, using defaults', { error: error.message });
    return {
      queries: [query],
      format: 'structured summary',
      completeness_criteria: [],
    };
  }
}

/**
 * Run parallel Tavily searches with error isolation.
 *
 * @param {string[]} queries - Search queries
 * @param {Object} deps
 * @param {Object} deps.tavilyClient - Tavily client
 * @param {Object} deps.logger - Logger
 * @returns {Promise<Object[]>} Combined findings from all queries
 */
async function parallelSearch(queries, { tavilyClient, logger }) {
  logger.info('Parallel search', { queryCount: queries.length });

  const results = await Promise.all(
    queries.map(async (query) => {
      try {
        const response = await tavilyClient.search({
          query,
          maxResults: 5,
          searchDepth: 'advanced',
          includeAnswer: true,
        });

        return (response.results || []).map(r => ({
          source: r.url,
          title: r.title,
          content: r.content?.slice(0, 500),
          score: r.score,
          query,
          answer: response.answer,
        }));
      } catch (error) {
        logger.error('Search failed for query', { query, error: error.message });
        return [];
      }
    })
  );

  return results.flat();
}

/**
 * Evaluate research completeness against criteria.
 *
 * @param {Object[]} findings - Current findings
 * @param {string[]} criteria - Completeness criteria
 * @param {Object} claudeClient - Claude client
 * @param {Object} logger - Logger
 * @returns {Promise<Object>} Evaluation with complete, missing, gap_queries
 */
export async function evaluateResults(findings, criteria, claudeClient, logger) {
  if (criteria.length === 0 || findings.length === 0) {
    return { complete: findings.length > 0, missing: [], gap_queries: [] };
  }

  const system = `You are evaluating research completeness. Given findings and criteria, determine what's missing.

Respond with JSON:
{
  "complete": true/false,
  "missing": ["what's still needed"],
  "gap_queries": ["specific search query to fill gap"]
}

Be conservative - only flag truly missing information.`;

  const findingsSummary = findings.slice(0, 15).map((f, i) =>
    `[${i + 1}] ${f.title}: ${f.content?.slice(0, 200)}`
  ).join('\n');

  const userMessage = `Criteria:\n${criteria.map(c => `- ${c}`).join('\n')}\n\nFindings (${findings.length}):\n${findingsSummary}`;

  try {
    const result = await claudeClient.messageJson({ system, userMessage });
    return {
      complete: result.complete ?? true,
      missing: result.missing || [],
      gap_queries: result.gap_queries || [],
    };
  } catch (error) {
    logger.warn('Evaluation failed, assuming complete', { error: error.message });
    return { complete: true, missing: [], gap_queries: [] };
  }
}

/**
 * Synthesize findings with user and project context.
 *
 * @param {Object[]} findings - All research findings
 * @param {Object} context - Synthesis context
 * @param {string} context.query - Original query
 * @param {string} context.format - Desired output format
 * @param {string|null} context.projectSlug - Project slug
 * @param {string|null} context.spread - Project spread content
 * @param {string|null} context.contextPack - User's current.md
 * @param {string[]} [context.qualityFeedback] - Issues from quality check to address
 * @param {Object} claudeClient - Claude client
 * @param {Object} logger - Logger
 * @returns {Promise<Object>} Synthesis result
 */
async function synthesizeWithContext(findings, context, claudeClient, logger) {
  const { query, format, projectSlug, spread, contextPack, qualityFeedback } = context;

  logger.info('Synthesizing with context', {
    findingCount: findings.length,
    hasProject: !!projectSlug,
    hasContextPack: !!contextPack,
    hasQualityFeedback: !!qualityFeedback,
  });

  if (findings.length === 0) {
    return {
      summary: 'No findings to synthesize.',
      keyPoints: [],
      recommendations: [],
      sources: [],
    };
  }

  const contextSection = [];
  if (contextPack) {
    contextSection.push(`## User Context\n${contextPack.slice(0, 2000)}`);
  }
  if (spread) {
    contextSection.push(`## Project Context (${projectSlug})\n${spread.slice(0, 1500)}`);
  }
  if (qualityFeedback && qualityFeedback.length > 0) {
    contextSection.push(`## Quality Feedback (address these issues)\n${qualityFeedback.map(i => `- ${i}`).join('\n')}`);
  }

  const system = `You are a research synthesizer working for a personal second brain system.

${contextSection.join('\n\n')}

Create a clear, actionable summary from research findings. Tailor your response to the user's context and the specific project if one is provided.

Desired format: ${format}

Structure your response as JSON:
{
  "summary": "2-3 paragraph executive summary in markdown, tailored to user context",
  "key_points": ["Key finding 1", "Key finding 2", "Key finding 3"],
  "recommendations": ["Actionable recommendation 1", "Actionable recommendation 2"],
  "sources_to_cite": ["Most important source URLs"]
}

Focus on:
- Extracting actionable insights relevant to the user
- Identifying patterns across sources
- Connecting findings to the user's existing projects and goals
- Being concise but comprehensive`;

  const findingsText = findings.map((f, i) => {
    const source = f.source || 'Unknown';
    const title = f.title || 'Untitled';
    const content = f.content || '';
    return `[${i + 1}] ${title}\nSource: ${source}\n${content}`;
  }).join('\n\n---\n\n');

  const userMessage = `Research Query: ${query}\n\nFindings (${findings.length} sources):\n\n${findingsText}`;

  try {
    const result = await claudeClient.messageJson({ system, userMessage });

    return {
      summary: result.summary || 'Summary not available.',
      keyPoints: result.key_points || [],
      recommendations: result.recommendations || [],
      sources: result.sources_to_cite || [],
    };
  } catch (error) {
    logger.error('Synthesis failed', { error: error.message });

    return {
      summary: `Research on "${query}" gathered ${findings.length} sources. Manual review recommended.`,
      keyPoints: findings.slice(0, 3).map(f => f.title || 'Finding'),
      recommendations: [],
      sources: findings.slice(0, 5).map(f => f.source).filter(Boolean),
      error: error.message,
    };
  }
}

/**
 * Quality check: evaluate synthesis against original request.
 *
 * @param {Object} synthesis - Synthesis result
 * @param {Object} request - Original request
 * @param {Object} claudeClient - Claude client
 * @param {Object} logger - Logger
 * @returns {Promise<Object>} Quality result with score and issues
 */
export async function qualityCheck(synthesis, request, claudeClient, logger) {
  const system = `Evaluate this research synthesis against the original request.

Score 0.0-1.0:
- 1.0: Comprehensive, actionable, well-structured
- 0.7: Adequate, covers main points
- 0.5: Missing important aspects
- 0.3: Barely useful
- 0.0: Completely off-target

Respond with JSON:
{
  "score": 0.0-1.0,
  "issues": ["issue 1 if any", "issue 2 if any"]
}`;

  const userMessage = `Original request: ${request.query}\n\nSynthesis:\n${synthesis.summary}\n\nKey points: ${synthesis.keyPoints.join('; ')}`;

  try {
    const result = await claudeClient.messageJson({ system, userMessage });
    return {
      score: typeof result.score === 'number' ? result.score : 0.7,
      issues: result.issues || [],
    };
  } catch (error) {
    logger.warn('Quality check failed, assuming pass', { error: error.message });
    return { score: 0.7, issues: [] };
  }
}

/**
 * Persist research results to git.
 *
 * Writes spread update + research log atomically via batchWrite,
 * then appends stream entry separately.
 *
 * @param {string|null} projectSlug - Project to persist to
 * @param {Object} synthesis - Synthesis result
 * @param {Object} threadState - Thread state for log
 * @param {Object} opts
 * @param {string} opts.query - Research query
 * @param {Object[]} opts.allFindings - All findings
 * @param {Object} opts.githubWriter - GitHub writer
 * @param {Object} opts.logger - Logger
 */
export async function persistResearch(projectSlug, synthesis, threadState, opts) {
  const { query, allFindings, githubWriter, logger } = opts;

  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().slice(0, 5);
  const timestamp = Date.now();

  // Build files for atomic batch write
  const batchFiles = [];

  if (projectSlug) {
    // Spread update
    const spreadContent = formatSynthesisForSpread(synthesis, query, date);
    // We write the spread section content as a research log entry
    // The actual spread replacement is done by the caller since it needs current spread content

    // Research log
    const logContent = formatResearchLog({
      ...threadState,
      findings: allFindings,
      synthesis,
    });

    batchFiles.push({
      path: `data/projects/${projectSlug}/logs/${timestamp}-research.md`,
      content: logContent,
    });
  }

  // Stream entry
  const streamSummary = synthesis.keyPoints.slice(0, 2).join('; ').slice(0, 100);
  const streamLine = projectSlug
    ? `- ${time} | [research] ${query} -> proj-${projectSlug}`
    : `- ${time} | [research] ${query}${streamSummary ? ' | ' + streamSummary : ''}`;

  // Persist research log via batch (if there are files)
  if (batchFiles.length > 0) {
    try {
      await githubWriter.batchWrite(
        batchFiles,
        `Research: ${query.slice(0, 50)}${projectSlug ? ` (${projectSlug})` : ''}`
      );
      logger.info('Research log persisted', { fileCount: batchFiles.length });
    } catch (error) {
      logger.error('Failed to persist research log', { error: error.message });
    }
  }

  // Stream entry (separate commit since it appends)
  try {
    await githubWriter.appendToSection(
      `data/stream/${date}.md`,
      '## Captures',
      streamLine,
      `Log research: ${query.slice(0, 30)}`
    );
    logger.info('Stream entry written');
  } catch (error) {
    logger.error('Failed to write stream entry', { error: error.message });
  }
}

/**
 * Infer project association from query and context pack.
 *
 * @param {string} query - Research query
 * @param {string|null} contextPack - User's current.md
 * @param {Object} claudeClient - Claude client
 * @param {Object} logger - Logger
 * @returns {Promise<Object>} { projectSlug, confidence }
 */
export async function inferProject(query, contextPack, claudeClient, logger) {
  if (!contextPack) {
    return { projectSlug: null, confidence: 0 };
  }

  const system = `Given a research query and the user's active projects, determine if this research is related to a specific project.

Respond with JSON:
{
  "project_slug": "slug-name or null",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation"
}

Only match if clearly related. Use project slugs as they appear in the context.`;

  try {
    const result = await claudeClient.messageJson({
      system,
      userMessage: `Query: ${query}\n\nContext:\n${contextPack.slice(0, 3000)}`,
    });

    return {
      projectSlug: result.project_slug || null,
      confidence: typeof result.confidence === 'number' ? result.confidence : 0,
      reasoning: result.reasoning,
    };
  } catch (error) {
    logger.warn('Project inference failed', { error: error.message });
    return { projectSlug: null, confidence: 0 };
  }
}
