/**
 * Unit Tests: Context Pruner
 *
 * Tests the pruning cascade at various sizes.
 */

import { pruneContext } from '../../../worker/lib/context-pruner.js';

describe('Context Pruner', () => {
  it('should return content unchanged if under limit', () => {
    const content = '# Test\n\nShort content';
    expect(pruneContext(content, 1000)).toBe(content);
  });

  it('should return empty/null content unchanged', () => {
    expect(pruneContext(null)).toBeNull();
    expect(pruneContext('')).toBe('');
  });

  it('should truncate Identity section when over limit', () => {
    const longIdentity = '### Values\n' + '- Value '.repeat(500) + '\n';
    const content = `# Context

## Identity

### Mission
Be well.

### Roles
- Engineer

${longIdentity}

## Open Loops

- [ ] Task 1
`;

    const pruned = pruneContext(content, 500);
    expect(pruned.length).toBeLessThan(content.length);
    expect(pruned).toContain('Mission');
    expect(pruned).toContain('Roles');
  });

  it('should hard-truncate as last resort', () => {
    const hugeContent = 'x'.repeat(100000);
    const pruned = pruneContext(hugeContent, 50000);
    expect(pruned.length).toBeLessThanOrEqual(50100); // Some margin for appended message
    expect(pruned).toContain('[Context truncated');
  });

  it('should preserve essential sections during pruning', () => {
    const content = `# Context

## Pending Review

- Check something

## Open Loops

- [ ] Important task

## Identity

### Mission
Be well.

### Roles
- Engineer

### Values
${'- Long value entry\n'.repeat(200)}

## Learned Context

${'### Person\n- Detail\n'.repeat(50)}
`;

    const pruned = pruneContext(content, 2000);
    expect(pruned).toContain('## Pending Review');
    expect(pruned).toContain('## Open Loops');
  });
});
