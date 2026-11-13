import { describe, expect, test } from 'claude-code/testing'

import { share, toReading, tokens } from '../hooks/register'

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 84 } }

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

// Stands for the engine beneath the mod.
function engine(on: any, store: Record<string, unknown> = {}) {
  const asked: unknown[] = []
  on('session.start', (_$: any, e: any) => ({ sessionId: 's', cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('turn.complete', () => ({ text: '' }))
  on('store.get', (_$: any, e: any) => ({ value: store[e.key] }))
  on('store.set', (_$: any, e: any) => ((store[e.key] = e.value), { value: undefined }))
  on('session.usage', (_$: any, e: any) => {
    asked.push(e)
    return { value: { startedAt: 0, context: { tokens: 204_000, window: 1_000_000, percent: 20, breakdown: BREAKDOWN }, rateLimits: {}, cost: { usd: 0 } } }
  })
  on('ui.render', ($: any, e: any) => $.ui.resolve(e).Text({ children: 'band below' }))
  return { asked, store }
}

const settle = () => new Promise(done => (globalThis as any).setTimeout(done, 20)) // the first refresh runs in the background

describe('context-bar', () => {
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

  test('draws the bar and legend above the prompt from a summary breakdown', async ($, on) => {
    const { asked } = engine(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
    await settle()
    expect(asked).toEqual([{ breakdown: 'summary' }]) // estimated locally, never the token-count API

    const band = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...BAND } as any)
    expect(await band.find({ type: 'Text', text: /204k of 1M · compacts at 950k/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: / 20% / })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /^messages $/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /^186k$/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /mcp tools \(deferred\)/ })).toBeUndefined()
    expect(await band.find({ type: 'Text', text: 'band below' })).toBeDefined() // the band beneath stays
    // Free space and the buffer have no legend entry; the header says what is used and where compaction starts.
    expect(await band.find({ type: 'Text', text: /free space|autocompact buffer/ })).toBeUndefined()
    await band.unmount()
  })

  // Claude Code no longer lets a hook narrow bodyColumns for the hooks beneath it, so the bar is laid out by
  // flex in whatever room the pet and the rings leave: its segments grow in proportion to their share of the window.
  test('the bar lays itself out, whatever the band is told', async ($, on) => {
    engine(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
    await settle()
    const grows = async (bodyColumns: number) => {
      const band = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...BAND, props: { ...BAND.props, bodyColumns } } as any)
      const segments = (await band.findAll({ type: 'Box' })).filter(b => b.props.width === 0)
      const bar = { grow: segments.map(b => b.props.flexGrow), min: segments.map(b => b.props.minWidth), glyphs: segments.map(b => b.text.length) }
      await band.unmount()
      return bar
    }
    const narrow = await grows(60)
    const wide = await grows(200)
    expect(narrow.grow).toEqual([34, 120, 26, 1_860, 7_460, 500]) // each one's share of the window in 10,000ths: used rows, free space, the buffer
    expect(wide.grow).toEqual(narrow.grow) // the proportions never depend on the width
    expect(narrow.min).toEqual([1, 1, 1, 1, 0, 0]) // a small used row still shows one cell
    expect(narrow.glyphs).toEqual([60, 60, 60, 60, 0, 60]) // more glyphs than any room, clipped by its box; free space draws none
    expect(wide.glyphs).toEqual([200, 200, 200, 200, 0, 200])
  })

  test('a band too narrow for a bar draws nothing of its own', async ($, on) => {
    engine(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
    await settle()
    const band = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...BAND, props: { ...BAND.props, bodyColumns: 20 } } as any)
    expect(await band.find({ type: 'Text', text: /of 1M/ })).toBeUndefined()
    expect(await band.find({ type: 'Text', text: 'band below' })).toBeDefined()
    await band.unmount()
  })

  test('refreshes after a main turn, not after a subagent turn', async ($, on) => {
    const { asked } = engine(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
    await settle()
    await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, agentId: 'a1' } as any)
    expect(asked.length).toBe(1)
    await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1 } as any)
    expect(asked.length).toBe(2)
  })

  test('refreshes after a compaction', async ($, on) => {
    const { asked } = engine(on)
    on('session.compact', () => ({ messages: [{ role: 'user', text: 'summary', toolUses: [] }] }))
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
    await settle()
    await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'hi', toolUses: [] }] } as any)
    await settle()
    expect(asked.length).toBe(2)
  })

  test('/context-bar hides and shows it, and remembers the choice', async ($, on) => {
    const { store } = engine(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
    await settle()
    expect((await $.command.run({ command: 'context-bar', args: '' } as any)).text).toMatch(/hidden/)
    expect(store.isHidden).toBe(true)
    let band = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...BAND } as any)
    expect(await band.find({ type: 'Text', text: /of 1M/ })).toBeUndefined()
    await band.unmount()

    expect((await $.command.run({ command: 'context-bar', args: '' } as any)).text).toBe('Context bar on')
    expect(store.isHidden).toBe(false)
    band = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...BAND } as any)
    expect(await band.find({ type: 'Text', text: /of 1M/ })).toBeDefined()
    await band.unmount()
  })

  test('a session that hid it starts hidden', async ($, on) => {
    engine(on, { isHidden: true })
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
    await settle()
    const band = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...BAND } as any)
    expect(await band.find({ type: 'Text', text: /of 1M/ })).toBeUndefined()
    await band.unmount()
  })

  test('/context-bar takes on, off and status, and says so when it does not understand', async ($, on) => {
    const { store } = engine(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
    await settle()
    const run = async (args: string) => ($ as any).command.run({ command: 'context-bar', args }).then((r: any) => r.text)
    expect(await run('off')).toMatch(/hidden/)
    expect(await run('off')).toMatch(/hidden/) // `off` twice stays off; it does not flip
    expect(store.isHidden).toBe(true)
    expect(await run('status')).toMatch(/hidden/)
    expect(await run('on')).toBe('Context bar on')
    expect(await run('on')).toBe('Context bar on')
    expect(store.isHidden).toBe(false)
    expect(await run('status')).toBe('Context bar on')
    expect(await run('sideways')).toMatch(/^Use \/context-bar/)
    expect(store.isHidden).toBe(false)
  })
})
