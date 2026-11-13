import { describe, expect, test } from 'claude-code/testing'

import { share, toReading, tokens } from '../hooks/bar'

// /context's breakdown as the engine hands it over, for a 1M window.
const BREAKDOWN = {
  categories: [
    { name: 'System prompt', tokens: 3_400, color: 'promptBorder', kind: 'used', isDeferred: false },
    { name: 'System tools', tokens: 12_000, color: 'inactive', kind: 'used', isDeferred: false },
    { name: 'MCP tools', tokens: 2_600, color: 'cyan_FOR_SUBAGENTS_ONLY', kind: 'used', isDeferred: false },
    { name: 'MCP tools (deferred)', tokens: 40_000, color: 'inactive', kind: 'deferred', isDeferred: true },
    { name: 'Skills', tokens: 0, color: 'warning', kind: 'used', isDeferred: false },
    { name: 'Messages', tokens: 186_000, color: 'purple_FOR_SUBAGENTS_ONLY', kind: 'used', isDeferred: false },
    { name: 'Autocompact buffer', tokens: 50_000, color: 'inactive', kind: 'buffer', isDeferred: false },
    { name: 'Free space', tokens: 746_000, color: 'promptBorder', kind: 'free', isDeferred: false },
  ],
  totalTokens: 204_000,
  maxTokens: 1_000_000,
  rawMaxTokens: 1_000_000,
  percentage: 20,
  autoCompactThreshold: 950_000,
  isAutoCompactEnabled: true,
  gridRows: [],
  memoryFiles: [],
  mcpTools: [],
  agents: [],
  model: 'opus',
  apiUsage: null,
  autocompactSource: 'model-default',
}

describe('bar', () => {
  test('helpers', () => {
    expect(tokens(3_400)).toBe('3.4k')
    expect(tokens(186_000)).toBe('186k')
    expect(tokens(1_000_000)).toBe('1M')
    expect(tokens(950)).toBe('950')
    expect(share(3_400, 1_000_000)).toBe('0.3%')
    expect(share(186_000, 1_000_000)).toBe('19%')
    expect(share(494, 1_000_000)).toBe('<0.1%')

    const r = toReading(BREAKDOWN)
    // Deferred and empty rows are left out; used first, then free, then the buffer.
    expect(r.slices.map(s => s.name)).toEqual(['system prompt', 'system tools', 'mcp tools', 'messages', 'free space', 'autocompact buffer'])
    expect(r.compactsAt).toBe(950_000)
    // Every used row has its own color, and none matches free space or the buffer.
    const colors = r.slices.filter(s => s.kind === 'used').map(s => s.color)
    expect(new Set(colors).size).toBe(colors.length)
    expect(toReading({ ...BREAKDOWN, isAutoCompactEnabled: false }).compactsAt).toBeUndefined()
  })
})
