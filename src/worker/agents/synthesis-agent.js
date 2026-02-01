/**
 * Synthesis Agent - Summarizes research findings.
 *
 * Takes accumulated research findings and produces a coherent summary
 * suitable for adding to project documentation.
 */

/**
 * Synthesize research findings into a summary.
 *
 * @param {Object[]} findings - Array of research findings
 * @param {Object} context
 * @param {string} context.query - Original research query
 * @param {string} [context.scope] - Research scope
 * @param {string} [context.projectSlug] - Project context
 * @param {string} [context.contextPack] - User's current.md for context-aware synthesis
 * @param {string} [context.spread] - Project spread.md content
 * @param {Object} deps - Dependencies
 * @param {Object} deps.claudeClient - Claude client
 * @param {Object} deps.logger - Logger instance
 * @returns {Promise<Object>} Synthesized summary
 */
export async function synthesizeFindings(findings, context, { claudeClient, logger }) {
  const { query, scope, projectSlug, contextPack, spread } = context;

  logger.info('Synthesizing findings', {
    findingCount: findings.length,
    query,
    projectSlug,
    hasContextPack: !!contextPack,
    hasSpread: !!spread,
  });

  if (findings.length === 0) {
    return {
      summary: 'No findings to synthesize.',
      keyPoints: [],
      sources: [],
      recommendations: [],
    };
  }

  // Build context-aware system prompt
  const contextSections = [];
  if (contextPack) {
    contextSections.push(`## User Context\n${contextPack.slice(0, 2000)}`);
  }
  if (spread) {
    contextSections.push(`## Project Context (${projectSlug})\n${spread.slice(0, 1500)}`);
  }

  const contextBlock = contextSections.length > 0
    ? `\n\nYou have access to the user's personal context. Use it to tailor your synthesis:\n\n${contextSections.join('\n\n')}`
    : '';

  const system = `You are a research synthesizer. Create a clear, actionable summary from research findings.${contextBlock}

Structure your response as JSON:
{
  "summary": "2-3 paragraph executive summary in markdown",
  "key_points": ["Key finding 1", "Key finding 2", "Key finding 3"],
  "recommendations": ["Actionable recommendation 1", "Actionable recommendation 2"],
  "sources_to_cite": ["Most important source URLs to reference"]
}

Focus on:
- Extracting actionable insights${contextPack ? ' relevant to the user' : ''}
- Identifying patterns across sources
- Highlighting the most credible/relevant information
- Being concise but comprehensive`;

  const findingsText = findings.map((f, i) => {
    const source = f.source || f.url || 'Unknown';
    const title = f.title || 'Untitled';
    const content = f.content || f.snippet || '';
    return `[${i + 1}] ${title}\nSource: ${source}\n${content}`;
  }).join('\n\n---\n\n');

  const userMessage = `Research Query: ${query}
${scope ? `Scope: ${scope}` : ''}
${projectSlug ? `Project: ${projectSlug}` : ''}

Findings (${findings.length} sources):

${findingsText}`;

  try {
    const result = await claudeClient.messageJson({
      system,
      userMessage,
    });

    logger.info('Synthesis complete', {
      keyPointCount: result.key_points?.length || 0,
      recommendationCount: result.recommendations?.length || 0,
    });

    return {
      summary: result.summary || 'Summary not available.',
      keyPoints: result.key_points || [],
      recommendations: result.recommendations || [],
      sources: result.sources_to_cite || [],
    };
  } catch (error) {
    logger.error('Synthesis failed', { error: error.message });

    // Fallback to simple extraction
    return {
      summary: `Research on "${query}" gathered ${findings.length} sources. Manual review recommended.`,
      keyPoints: findings.slice(0, 3).map(f => f.title || 'Finding'),
      recommendations: [],
      sources: findings.slice(0, 5).map(f => f.source || f.url).filter(Boolean),
      error: error.message,
    };
  }
}

/**
 * Format synthesis for project spread.
 *
 * @param {Object} synthesis - Synthesis result
 * @param {string} query - Research query
 * @param {string} date - Current date (YYYY-MM-DD)
 * @returns {string} Markdown formatted for spread
 */
export function formatSynthesisForSpread(synthesis, query, date) {
  const parts = [];

  parts.push(`### ${query} (${date})`);
  parts.push('');
  parts.push(synthesis.summary);

  if (synthesis.keyPoints.length > 0) {
    parts.push('');
    parts.push('**Key Findings:**');
    synthesis.keyPoints.forEach(point => {
      parts.push(`- ${point}`);
    });
  }

  if (synthesis.recommendations.length > 0) {
    parts.push('');
    parts.push('**Recommendations:**');
    synthesis.recommendations.forEach(rec => {
      parts.push(`- ${rec}`);
    });
  }

  if (synthesis.sources.length > 0) {
    parts.push('');
    parts.push('**Sources:**');
    synthesis.sources.forEach(source => {
      parts.push(`- ${source}`);
    });
  }

  return parts.join('\n');
}

/**
 * Format synthesis for Slack message.
 *
 * @param {Object} synthesis - Synthesis result
 * @returns {string} Formatted Slack message
 */
export function formatSynthesisForSlack(synthesis) {
  const parts = [];

  parts.push('**Research Complete**');
  parts.push('');
  parts.push(synthesis.summary);

  if (synthesis.keyPoints.length > 0) {
    parts.push('');
    parts.push('Key findings:');
    synthesis.keyPoints.slice(0, 5).forEach(point => {
      parts.push(`• ${point}`);
    });
  }

  if (synthesis.recommendations.length > 0) {
    parts.push('');
    parts.push('Recommendations:');
    synthesis.recommendations.slice(0, 3).forEach(rec => {
      parts.push(`→ ${rec}`);
    });
  }

  return parts.join('\n');
}

/**
 * Quality check a synthesis against the original request.
 *
 * @param {Object} synthesis - Synthesis result
 * @param {Object} request - Original request
 * @param {string} request.query - Research query
 * @param {Object} deps - Dependencies
 * @param {Object} deps.claudeClient - Claude client
 * @param {Object} deps.logger - Logger instance
 * @returns {Promise<Object>} Quality result { score: 0-1, issues: string[] }
 */
export async function synthesisQualityCheck(synthesis, request, { claudeClient, logger }) {
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

  const userMessage = `Original request: ${request.query}\n\nSynthesis:\n${synthesis.summary}\n\nKey points: ${(synthesis.keyPoints || []).join('; ')}`;

  try {
    const result = await claudeClient.messageJson({ system, userMessage });

    logger.info('Quality check complete', { score: result.score });

    return {
      score: typeof result.score === 'number' ? result.score : 0.7,
      issues: result.issues || [],
    };
  } catch (error) {
    logger.warn('Quality check failed, assuming pass', { error: error.message });
    return { score: 0.7, issues: [] };
  }
}
