import { describe, expect, mock, test } from 'claude-code/testing'

import { parse, target } from '../hooks/command'

const DAY = 24 * 60 * 60 * 1000
const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 84 } }
const band = (bodyColumns: number) => ({ plugin: 'dock', surface: 'terminal', ...BAND, props: { ...BAND.props, bodyColumns } }) as any

const LIMITS = [
  { kind: 'five_hour', percentUsed: 37 },
  { kind: 'seven_day', percentUsed: 72 },
]
// /context's breakdown for a 1M window.
const BREAKDOWN = {
  categories: [
    { name: 'System prompt', tokens: 3_400, color: 'promptBorder', kind: 'used', isDeferred: false },
    { name: 'System tools', tokens: 12_000, color: 'inactive', kind: 'used', isDeferred: false },
    { name: 'MCP tools', tokens: 2_600, color: 'cyan_FOR_SUBAGENTS_ONLY', kind: 'used', isDeferred: false },
    { name: 'MCP tools (deferred)', tokens: 40_000, color: 'inactive', kind: 'deferred', isDeferred: true },
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

// Stands for the engine beneath the dock: a clock that moves only when told, a store, the commands the dock registers,
// the usage figures, and a band beneath that says it is there.
function engine(on: any, { rateLimits = LIMITS as unknown[], store = {} as Record<string, unknown>, now = 1 * DAY } = {}) {
  const clock = mock.clock(on, { now })
  const names: string[] = []
  on('session.start', (_$: any, e: any) => ({ sessionId: 's', cwd: e.cwd }))
  on('command.register', (_$: any, e: any) => (names.push(e.name), { value: undefined }))
  on('command.list', () => ({ value: names.map(name => ({ name, description: '', source: 'plugin' })) }))
  on('store.get', (_$: any, e: any) => ({ value: store[e.key] }))
  on('store.set', (_$: any, e: any) => ((store[e.key] = e.value), { value: undefined }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 204_000, window: 1_000_000, percent: 20, breakdown: BREAKDOWN }, rateLimits, cost: { usd: 0 } } }))
  on('session.measure', (_$: any, e: any) => ({ changed: e.changed }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', ($: any, e: any) => $.ui.resolve(e).Text({ children: 'band below' }))
  return { clock, names, store }
}

const settle = () => new Promise(done => (globalThis as any).setTimeout(done, 20)) // the first readings load in the background
const start = async ($: any) => (await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any), await settle())
const run = async ($: any, command: string, args = '') => (await $.command.run({ command, args } as any)).text as string
const dock = ($: any, args: string) => run($, 'dock', args)
// The one row of the dock: its children, in order.
const rowOf = async (b: any) => (await b.findAll({ type: 'Box' })).filter((x: any) => x.props.flexDirection === 'row' && x.props.alignItems === 'center')
const has = async (b: any, query: any) => (await b.find(query)) !== undefined

describe('dock: what /dock asks', () => {
  test('reads what was asked', () => {
    expect(parse('')).toEqual({ parts: ['pet', 'bar', 'ring'], state: undefined })
    expect(parse('ring off')).toEqual({ parts: ['ring'], state: 'off' })
    expect(parse('Pixel-Pet on')).toEqual({ parts: ['pet'], state: 'on' })
    expect(parse('bar ring')).toEqual({ parts: ['bar', 'ring'], state: undefined })
    expect(parse('on off')).toBeUndefined()
    expect(parse('nonsense')).toBeUndefined()
  })

  test('with nothing asked, everything goes the same way', () => {
    expect(target(undefined, [true, false, true])).toBe('off')
    expect(target(undefined, [false, false, false])).toBe('on')
    expect(target('on', [true, true, true])).toBe('on')
  })
})

describe('dock: the row', () => {
  test('the pet, the bar and the rings are one row, drawn by one plugin', async ($, on) => {
    engine(on)
    await start($)
    const b = await $.ui.mount(band(120))
    const rows = await rowOf(b)
    expect(rows.length).toBe(1) // not three stacked rows
    expect(rows[0].children.length).toBe(3) // the pet, the bar's column, the rings, left to right
    expect(await has(b, { type: 'Raster', key: 'critter' })).toBe(true)
    expect(await has(b, { type: 'Text', text: /204k of 1M · compacts at 950k/ })).toBe(true)
    expect(await has(b, { type: 'Text', text: '37%' })).toBe(true) // the 5-hour ring's number, shown on hover
    expect(await has(b, { type: 'Text', text: '72%' })).toBe(true)
    expect(await has(b, { type: 'Text', text: 'band below' })).toBe(true) // what is drawn here by others stays
    await b.unmount()
  })

  test('the pet and the rings are fixed boxes and the bar takes what is left', async ($, on) => {
    engine(on)
    await start($)
    const b = await $.ui.mount(band(120))
    const [row] = await rowOf(b)
    const [pet, middle, rings] = row.children as any[]
    expect(pet.props).toMatchObject({ width: 16, flexShrink: 0 })
    expect(middle.props).toMatchObject({ flexGrow: 1 })
    expect(rings.props).toMatchObject({ width: 11, height: 5, flexShrink: 0 })
    await b.unmount()
  })

  test('narrow bands drop the rings first, then the pet, then draw nothing', async ($, on) => {
    engine(on)
    await start($)
    const shown = async (columns: number) => {
      const b = await $.ui.mount(band(columns))
      const out = {
        pet: await has(b, { type: 'Raster', key: 'critter' }),
        bar: await has(b, { type: 'Text', text: /of 1M/ }),
        rings: await has(b, { type: 'Text', text: '37%' }),
      }
      await b.unmount()
      return out
    }
    expect(await shown(84)).toEqual({ pet: true, bar: true, rings: true })
    expect(await shown(55)).toEqual({ pet: true, bar: true, rings: false }) // 55 - 17 - 12 is under 30
    expect(await shown(45)).toEqual({ pet: false, bar: true, rings: false })
    expect(await shown(20)).toEqual({ pet: false, bar: false, rings: false })
  })

  test('the bar lays itself out: its segments grow by share of the window, whatever the width', async ($, on) => {
    engine(on)
    await start($)
    const segments = async (columns: number) => {
      const b = await $.ui.mount(band(columns))
      const boxes = (await b.findAll({ type: 'Box' })).filter((x: any) => x.props.width === 0)
      const out = { grow: boxes.map((x: any) => x.props.flexGrow), min: boxes.map((x: any) => x.props.minWidth) }
      await b.unmount()
      return out
    }
    const narrow = await segments(70)
    expect(narrow.grow).toEqual([34, 120, 26, 1_860, 7_460, 500]) // each row's share of the window in 10,000ths, then free space, then the buffer
    expect(narrow.min).toEqual([1, 1, 1, 1, 0, 0]) // a small used row still shows one cell
    expect(await segments(200)).toEqual(narrow)
  })

  test('the legend lists the used rows only', async ($, on) => {
    engine(on)
    await start($)
    const b = await $.ui.mount(band(120))
    expect(await has(b, { type: 'Text', text: /^messages $/ })).toBe(true)
    expect(await has(b, { type: 'Text', text: /^186k$/ })).toBe(true)
    expect(await has(b, { type: 'Text', text: /free space|autocompact buffer|deferred/ })).toBe(false)
    await b.unmount()
  })

  test('the weekly ring is coloured by pace, the 5-hour ring by fill', async ($, on) => {
    engine(on, { rateLimits: [{ kind: 'five_hour', percentUsed: 10 }, { kind: 'seven_day', percentUsed: 30, resetsAt: new Date(7 * DAY).toISOString() }] })
    await start($)
    const b = await $.ui.mount(band(120))
    expect((await b.find({ type: 'Text', text: '30%' }))?.props.color).toBe('#fb7185') // 30% a day into the week is far ahead of pace
    expect((await b.find({ type: 'Text', text: '10%' }))?.props.color).toBe('#4ade80')
    await b.unmount()
  })

  test('a new reading of the limits moves the rings', async ($, on) => {
    engine(on)
    await start($)
    await $.session.measure({ context: {}, rateLimits: [{ kind: 'five_hour', percentUsed: 91 }, { kind: 'seven_day', percentUsed: 72 }], changed: ['rateLimits'] } as any)
    const b = await $.ui.mount(band(120))
    expect(await has(b, { type: 'Text', text: '91%' })).toBe(true)
    await b.unmount()
  })

  test('off a subscription there are no rings, and the pet and the bar still draw', async ($, on) => {
    engine(on, { rateLimits: [] })
    await start($)
    const b = await $.ui.mount(band(120))
    expect((await rowOf(b))[0].children.length).toBe(2)
    expect(await has(b, { type: 'Text', text: /of 1M/ })).toBe(true)
    await b.unmount()
  })

  test('a survey holds the band, so the dock yields', async ($, on) => {
    engine(on)
    await start($)
    const b = await $.ui.mount({ ...band(120), props: { ...BAND.props, bodyColumns: 120, hasSurvey: true } })
    expect(await rowOf(b)).toEqual([])
    expect(await has(b, { type: 'Text', text: 'band below' })).toBe(true)
    await b.unmount()
  })
})

describe('dock: the commands', () => {
  test('the four commands are registered', async ($, on) => {
    const { names } = engine(on)
    await start($)
    expect(names.sort()).toEqual(['context-bar', 'dock', 'pixel-pet', 'status-ring'])
  })

  test('each part flips, takes on, off and status, and the choice is kept', async ($, on) => {
    const { store } = engine(on)
    await start($)
    const parts = [
      ['pixel-pet', 'petHidden', 'Pixel pet'],
      ['context-bar', 'barHidden', 'Context bar'],
      ['status-ring', 'ringHidden', 'Status ring'],
    ] as const
    for (const [command, key, name] of parts) {
      expect(await run($, command, 'status')).toBe(`${name} on`)
      expect(await run($, command, 'off')).toMatch(/hidden/)
      expect(store[key]).toBe(true)
      expect(await run($, command, '')).toBe(`${name} on`) // flips back
      expect(store[key]).toBe(false)
      expect(await run($, command, 'sideways')).toMatch(new RegExp(`^Use /${command}`))
    }
  })

  test('hiding a part takes it out of the row', async ($, on) => {
    engine(on)
    await start($)
    await run($, 'pixel-pet', 'off')
    let b = await $.ui.mount(band(120))
    expect(await has(b, { type: 'Raster', key: 'critter' })).toBe(false)
    expect((await rowOf(b))[0].children.length).toBe(2)
    await b.unmount()
    await run($, 'status-ring', 'off')
    b = await $.ui.mount(band(120))
    expect((await rowOf(b))[0].children.length).toBe(1)
    await run($, 'context-bar', 'off')
    await b.unmount()
    b = await $.ui.mount(band(120))
    expect(await rowOf(b)).toEqual([]) // everything off: nothing but what others draw
    expect(await has(b, { type: 'Text', text: 'band below' })).toBe(true)
    await b.unmount()
  })

  test('/dock turns all off when any shows, then all on, and says how the three stand', async ($, on) => {
    engine(on)
    await start($)
    await run($, 'status-ring', 'off')
    expect(await dock($, '')).toBe('Dock: pixel-pet off, context-bar off, status-ring off')
    expect(await dock($, '')).toBe('Dock: pixel-pet on, context-bar on, status-ring on')
  })

  test('/dock can name one part or several, and nonsense gets the usage', async ($, on) => {
    engine(on)
    await start($)
    expect(await dock($, 'ring off')).toBe('Dock: pixel-pet on, context-bar on, status-ring off')
    expect(await dock($, 'pet bar off')).toBe('Dock: pixel-pet off, context-bar off, status-ring off')
    expect(await dock($, 'ring')).toBe('Dock: pixel-pet off, context-bar off, status-ring on') // flipped
    expect(await dock($, 'on')).toBe('Dock: pixel-pet on, context-bar on, status-ring on')
    expect(await dock($, 'status')).toBe('Dock: pixel-pet on, context-bar on, status-ring on')
    expect(await dock($, 'sideways')).toMatch(/^Use \/dock/)
  })

  test('/dock takes parts in and out of the row', async ($, on) => {
    engine(on)
    await start($)
    await dock($, 'pet ring off')
    const b = await $.ui.mount(band(120))
    expect((await rowOf(b))[0].children.length).toBe(1)
    expect(await has(b, { type: 'Raster', key: 'critter' })).toBe(false)
    await b.unmount()
  })

  test('a session that hid the parts starts with them hidden', async ($, on) => {
    engine(on, { store: { petHidden: true, ringHidden: true } })
    await start($)
    const b = await $.ui.mount(band(120))
    expect((await rowOf(b))[0].children.length).toBe(1) // only the bar
    await b.unmount()
  })
})
