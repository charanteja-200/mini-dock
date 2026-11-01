import { describe, expect, mock, test } from 'claude-code/testing'

import { fillColor, label, paceColor, rings } from '../hooks/rings'

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 84 } }
const LIMITS = [
  { kind: 'five_hour', percentUsed: 37 },
  { kind: 'seven_day', percentUsed: 72 },
]

// Stands for the engine beneath the mod; the band beneath says how wide it was laid out.
function engine(on: any, rateLimits: unknown[] = LIMITS, store: Record<string, unknown> = {}) {
  on('session.start', (_$: any, e: any) => ({ sessionId: 's', cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('store.get', (_$: any, e: any) => ({ value: store[e.key] }))
  on('store.set', (_$: any, e: any) => ((store[e.key] = e.value), { value: undefined }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 0, window: 1_000_000, percent: 0 }, rateLimits } }))
  on('session.measure', (_$: any, e: any) => ({ changed: e.changed }))
  on('ui.render', ($: any, e: any) => $.ui.resolve(e).Text({ children: `beneath at ${e.props.bodyColumns}` }))
  return store
}

const settle = () => new Promise(done => (globalThis as any).setTimeout(done, 20))
const start = ($: any) => $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)

describe('status-ring', () => {
  test('rings', () => {
    expect([fillColor(10), fillColor(50), fillColor(80)]).toEqual(['#4ade80', '#fbbf24', '#fb7185'])
    const rows = rings(37, 72)
    expect(rows.length).toBe(5)
    for (const row of rows) expect(row.reduce((n, r) => n + r.text.length, 0)).toBe(11)
    expect(rows[2]!.map(r => r.text).join('').slice(4, 7)).toBe('   ') // room for the 3-cell number in the middle cell's row
    const runs = rows.flat()
    expect(runs.some(r => r.ring === 'outer' && r.color === '#4ade80')).toBe(true)
    expect(runs.some(r => r.ring === 'inner' && r.color === '#fbbf24')).toBe(true)
  })

  test('the number is always 3 cells, so it centres on the middle cell', () => {
    expect([0, 4.6, 9, 42, 99.4, 99.6, 100].map(label)).toEqual(['00%', '05%', '09%', '42%', '99%', '100', '100'])
  })

  test('an empty ring is all track and a full one has none', () => {
    const dots = (outer: number, inner: number) => rings(outer, inner).flat().filter(r => r.ring)
    expect(dots(0, 0).every(r => r.color === '#4a4a4a')).toBe(true)
    expect(dots(100, 100).some(r => r.color === '#4a4a4a')).toBe(false)
    for (const ring of ['outer', 'inner'] as const)
      for (const p of [90, 96, 97]) expect(dots(p, p).some(r => r.ring === ring && r.color === '#4a4a4a')).toBe(true) // a gap you can see, in each ring
  })

  test('the arc starts in the top middle cell, at twelve oclock', () => {
    const top = (p: number) => rings(p, p)[0]!.flatMap(r => Array.from(r.text, () => r.color))
    expect(top(10)[5]).toBe('#4ade80') // the middle cell is filled
    expect(top(10)[4]).toBe('#4a4a4a') // the cell to its left is not
    const chars = (p: number) => Array.from(rings(p, p)[0]!.map(r => r.text).join(''))
    expect(chars(10)[5]!.charCodeAt(0) & 0x47).toBe(0) // twelve oclock is between its two dot columns: the left one stays blank
    expect(chars(10)[5]!.charCodeAt(0) & 0xb8).not.toBe(0)
    expect(top(96)[4]).toBe('#4a4a4a') // and at 96% it is the one left empty, so the gap shows
  })

  test('a ring is complete from a number of 98 up', () => {
    expect(rings(97.6, 99)).toEqual(rings(100, 100))
    expect(rings(97.4, 97.4)).not.toEqual(rings(100, 100))
  })

  test('weekly pace', () => {
    const DAY = 24 * 60 * 60 * 1000
    const reset = 7 * DAY // the week runs from 0 to 7 days
    const [green, amber, rose] = ['#4ade80', '#fbbf24', '#fb7185']
    expect(paceColor(30, reset, 1 * DAY)).toBe(rose) // 30% on day one: pace is 14%, over by more than 10 points
    expect(paceColor(20, reset, 1 * DAY)).toBe(amber) // ahead of pace, within 10 points
    expect(paceColor(10, reset, 1 * DAY)).toBe(green)
    expect(paceColor(50, reset, 4 * DAY)).toBe(green) // pace at day four is 56%
    expect(paceColor(90, reset, reset - 1)).toBe(green) // end of the week, under 98
    expect(paceColor(98, reset, reset - 1)).toBe(rose) // at the 98% mark
    expect(paceColor(1, reset, 0)).toBe(green) // the week's first moments: within the grace
    expect(paceColor(5, reset, -DAY)).toBe(amber) // a reset more than a week away counts as a fresh week
    const inner = rings(10, 72, rose).flat().filter(r => r.ring === 'inner' && r.color !== '#4a4a4a')
    expect(inner.length > 0 && inner.every(r => r.color === rose)).toBe(true)
  })

  test('colours the weekly number by pace when the reset is known', async ($, on) => {
    const DAY = 24 * 60 * 60 * 1000
    mock.clock(on, { now: 1 * DAY })
    engine(on, [{ kind: 'five_hour', percentUsed: 10 }, { kind: 'seven_day', percentUsed: 30, resetsAt: new Date(7 * DAY).toISOString() }])
    await start($)
    await settle()
    const band = await $.ui.mount({ plugin: 'status-ring', surface: 'terminal', ...BAND } as any)
    expect((await band.find({ type: 'Text', text: '30%' }))?.props.color).toBe('#fb7185')
    expect((await band.find({ type: 'Text', text: '10%' }))?.props.color).toBe('#4ade80')
    await band.unmount()
  })

  test('draws the rings right of what is beneath, narrowing it', async ($, on) => {
    engine(on)
    await start($)
    await settle()
    const band = await $.ui.mount({ plugin: 'status-ring', surface: 'terminal', ...BAND } as any)
    expect(await band.find({ type: 'Text', text: 'beneath at 72' })).toBeDefined()
    expect(await band.find({ type: 'Text', text: '37%' })).toBeDefined()
    expect(await band.find({ type: 'Text', text: '72%' })).toBeDefined()
    await band.unmount()
  })

  test('follows a measured change', async ($, on) => {
    engine(on)
    await start($)
    await settle()
    await $.session.measure({ context: {}, rateLimits: [{ kind: 'five_hour', percentUsed: 91 }, { kind: 'seven_day', percentUsed: 72 }], changed: ['rateLimits'] } as any)
    const band = await $.ui.mount({ plugin: 'status-ring', surface: 'terminal', ...BAND } as any)
    expect(await band.find({ type: 'Text', text: '91%' })).toBeDefined()
    await band.unmount()
  })

  test('off a subscription it draws nothing and leaves the width alone', async ($, on) => {
    engine(on, [])
    await start($)
    await settle()
    const band = await $.ui.mount({ plugin: 'status-ring', surface: 'terminal', ...BAND } as any)
    expect(await band.find({ type: 'Text', text: 'beneath at 84' })).toBeDefined()
    await band.unmount()
  })

  test('/status-ring hides and shows it, and remembers the choice', async ($, on) => {
    const store = engine(on)
    await start($)
    await settle()
    expect((await $.command.run({ command: 'status-ring', args: '' } as any)).text).toMatch(/hidden/)
    expect(store.isHidden).toBe(true)
    let band = await $.ui.mount({ plugin: 'status-ring', surface: 'terminal', ...BAND } as any)
    expect(await band.find({ type: 'Text', text: 'beneath at 84' })).toBeDefined()
    await band.unmount()
    expect((await $.command.run({ command: 'status-ring', args: '' } as any)).text).toBe('Status ring on')
    band = await $.ui.mount({ plugin: 'status-ring', surface: 'terminal', ...BAND } as any)
    expect(await band.find({ type: 'Text', text: 'beneath at 72' })).toBeDefined()
    await band.unmount()
  })

  test('/status-ring takes on, off and status, and says so when it does not understand', async ($, on) => {
    const store = engine(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
    await settle()
    const run = async (args: string) => ($ as any).command.run({ command: 'status-ring', args }).then((r: any) => r.text)
    expect(await run('off')).toMatch(/hidden/)
    expect(await run('off')).toMatch(/hidden/) // `off` twice stays off; it does not flip
    expect(store.isHidden).toBe(true)
    expect(await run('status')).toMatch(/hidden/)
    expect(await run('on')).toBe('Status ring on')
    expect(await run('on')).toBe('Status ring on')
    expect(store.isHidden).toBe(false)
    expect(await run('status')).toBe('Status ring on')
    expect(await run('sideways')).toMatch(/^Use \/status-ring/)
    expect(store.isHidden).toBe(false)
  })
})
