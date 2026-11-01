// Context Bar: what is filling my context window?
//   Above the prompt, the window as one stacked bar, a color per category as /context
//   draws them (system prompt, tools, MCP tools, memory files, skills, messages, free),
//   with a legend of tokens and shares and where auto-compaction runs. It refreshes after
//   each turn. /context-bar shows or hides it, and the choice is kept across sessions.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Reading, Slice } from '../types'

const MIN_WIDTH = 20 // narrower than this, the bar is not drawn
const SPLIT = '   '
// /context's theme gives several rows the same grey, so each used row gets its own color, in order.
const PALETTE = ['#7aa2f7', '#7dcfff', '#bb9af7', '#9ece6a', '#e0af68', '#f7768e', '#73daca', '#ff9e64', '#c0caf5']
const MESSAGES = '#d97757' // the row that grows, in the accent color
const FREE = '#808080' // a mid grey thin line reads as empty on dark and light themes alike
const BUFFER = '#808080'
const GLYPH = { used: '█', free: ' ', buffer: '░' } as const // free space is left blank: no empty-state line

// Held by the host, so the bar survives a hot reload of this file.
const reading = atom({ plugin: 'context-bar', key: 'reading' } as const, null as Reading | null)
const isHidden = atom({ plugin: 'context-bar', key: 'isHidden' } as const, false)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({ name: 'context-bar', description: 'Show or hide the context window bar above the prompt', argumentHint: '[on|off|status]' }).catch(() => {}) // a name Claude Code already has is refused: start anyway
    const hidden = (await $.store.get('isHidden').catch(() => undefined)) === true
    await update($, isHidden, () => hidden)
    void refresh($).catch(() => {})
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId) await refresh($).catch(() => {}) // a subagent's turn fills its own window, not this one
    return r
  })

  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId && 'messages' in r) void refresh($).catch(() => {}) // a /compact empties the window without a turn ending
    return r
  })

  // /context-bar flips it; `on`, `off` set it; `status` only reports (the dock command reads that).
  on('command.run', { command: 'context-bar' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (!['', 'on', 'off', 'status'].includes(arg)) return { text: 'Use /context-bar, /context-bar on, /context-bar off or /context-bar status' }
    const hidden = arg === 'status' ? await read($, isHidden) : await update($, isHidden, h => (arg === 'on' ? false : arg === 'off' ? true : !h))
    if (arg !== 'status') {
      await $.store.set('isHidden', hidden).catch(() => {})
      if (!hidden) await refresh($).catch(() => {})
    }
    return { text: hidden ? 'Context bar hidden. /context-bar shows it again' : 'Context bar on' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e) // what other mods and Claude Code draw here stays
    const r = await read($, reading)
    if (e.props.hasSurvey || (await read($, isHidden)) || !r) return rest
    const { Box, Text } = $.ui.resolve(e)
    const inner = e.props.bodyColumns - 4 // the border and padding take 4 cells
    if (inner < MIN_WIDTH) return rest

    const head = `${tokens(r.total)} of ${tokens(r.window)}${r.compactsAt ? ` · compacts at ${tokens(r.compactsAt)}` : ''}`
    const pct = ` ${r.percent}% `
    const level = r.compactsAt ? r.total / r.compactsAt : r.total / r.window
    return (
      <Box flexDirection="column">
        <Box flexDirection="column" borderStyle="round" borderColor="inactive" paddingX={1}>
          <Box flexDirection="row" justifyContent="space-between">
            <Text wrap="truncate-end">
              <Text color="#d97757">{'◆ '}</Text>
              <Text bold>context</Text>
            </Text>
            <Text wrap="truncate-start">
              <Text dimColor>{`${head} `}</Text>
              <Text bold color="black" backgroundColor={level >= 0.9 ? 'red' : level >= 0.7 ? 'yellow' : 'green'}>{pct}</Text>
            </Text>
          </Box>
          <Text>
            {cells(r, inner).map(c => (
              <Text color={c.color}>{c.text}</Text>
            ))}
          </Text>
          {lines(r, inner).map(line => (
            <Text wrap="truncate-end">
              {line.map((s, i) => (
                <Text>
                  {i > 0 && <Text>{SPLIT}</Text>}
                  <Text color={s.color}>{s.kind === 'used' ? '■ ' : `${GLYPH[s.kind]} `}</Text>
                  <Text dimColor={s.kind !== 'used'}>{`${s.name} `}</Text>
                  <Text bold={s.kind === 'used'}>{tokens(s.tokens)}</Text>
                  {s.kind === 'used' && <Text dimColor>{` ${share(s.tokens, r.window)}`}</Text>}
                </Text>
              ))}
            </Text>
          ))}
        </Box>
        {rest}
      </Box>
    )
  })
}

// Asks the engine for /context's breakdown, estimated locally (no token-count calls).
async function refresh($: EngineInterface) {
  if (await read($, isHidden)) return
  const usage = await $.session.usage({ breakdown: 'summary' })
  const b = usage.context.breakdown
  if (!b || !(b.rawMaxTokens > 0)) return // no window to measure against
  await update($, reading, () => toReading(b))
}

export function toReading(b: {
  categories: { name: string; tokens: number; color: string; kind: string }[]
  totalTokens: number
  rawMaxTokens: number
  percentage: number
  autoCompactThreshold?: number
  isAutoCompactEnabled: boolean
}): Reading {
  const slices: Slice[] = b.categories
    .filter(c => c.kind !== 'deferred' && c.tokens > 0)
    .map(c => ({ name: c.name.toLowerCase(), tokens: c.tokens, color: c.color, kind: c.kind as Slice['kind'] }))
  const order = { used: 0, free: 1, buffer: 2 }
  slices.sort((x, y) => order[x.kind] - order[y.kind]) // stable: used rows keep /context's order
  let next = 0
  for (const s of slices) {
    s.color = s.kind === 'free' ? FREE : s.kind === 'buffer' ? BUFFER : s.name === 'messages' ? MESSAGES : PALETTE[next++ % PALETTE.length]!
  }
  return {
    slices,
    total: b.totalTokens,
    window: b.rawMaxTokens,
    percent: b.percentage,
    compactsAt: b.isAutoCompactEnabled ? b.autoCompactThreshold : undefined,
  }
}

// The bar as runs of cells: each slice gets its share of `width`, a used one at least one cell.
export function cells(r: Reading, width: number) {
  const sizes = r.slices.map(s => Math.max(s.kind === 'used' ? 1 : 0, Math.round((s.tokens / r.window) * width)))
  // Rounding leaves the sum a few cells off: free space takes the difference first, then the largest slices.
  let diff = width - sizes.reduce((a, n) => a + n, 0)
  const isUsed = (i: number) => r.slices[i]!.kind === 'used'
  const order = r.slices.map((_, i) => i).sort((a, b) => Number(isUsed(a)) - Number(isUsed(b)) || sizes[b]! - sizes[a]!)
  for (const i of order) {
    if (diff === 0) break
    const size = Math.max(isUsed(i) ? 1 : 0, sizes[i]! + diff)
    diff -= size - sizes[i]!
    sizes[i] = size
  }
  return r.slices.map((s, i) => ({ color: s.color, kind: s.kind, text: GLYPH[s.kind].repeat(sizes[i]!) })).filter(c => c.text !== '')
}

// The legend as shown: free space and the buffer never wrap onto a second line (the header already
// says what is used and where compaction starts), so the bar keeps one height beside the rings.
export function lines(r: Reading, width: number) {
  return legend(r, width)
    .map((line, i) => (i === 0 ? line : line.filter(s => s.kind === 'used')))
    .filter(line => line.length > 0)
}

// The legend, packed into lines no wider than `width`.
export function legend(r: Reading, width: number) {
  const lines: Slice[][] = [[]]
  let used = 0
  for (const s of r.slices) {
    const size = 2 + s.name.length + 1 + tokens(s.tokens).length + (s.kind === 'used' ? 1 + share(s.tokens, r.window).length : 0)
    const line = lines.at(-1)!
    if (line.length > 0 && used + SPLIT.length + size > width) {
      lines.push([s])
      used = size
    } else {
      used += (line.length > 0 ? SPLIT.length : 0) + size
      line.push(s)
    }
  }
  return lines.filter(l => l.length > 0)
}

export function tokens(n: number) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${+(n / 1000).toFixed(1)}k`
  return String(n)
}

export function share(n: number, window: number) {
  const p = (n / window) * 100
  if (p > 0 && p < 0.1) return '<0.1%'
  return `${p >= 10 ? Math.round(p) : +p.toFixed(1)}%`
}
