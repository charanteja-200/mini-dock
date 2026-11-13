// Context bar: what is filling my context window?
//   The window as one stacked bar, a color per category as /context draws them (system prompt, tools,
//   MCP tools, memory files, skills, messages, free), with a legend of tokens and shares and where
//   auto-compaction runs. It refreshes after each turn. /context-bar shows or hides it, kept across sessions.
//   register.tsx draws it in the dock row and calls these; this keeps the reading and answers the command.
import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface } from 'claude-code'

import type { Reading, Slice } from '../types'

type Ui = Elements['terminal']

// /context's theme gives several rows the same grey, so each used row gets its own color, in order.
const PALETTE = ['#7aa2f7', '#7dcfff', '#bb9af7', '#9ece6a', '#e0af68', '#f7768e', '#73daca', '#ff9e64', '#c0caf5']
const MESSAGES = '#d97757' // the row that grows, in the accent color
const FREE = '#808080'
const BUFFER = '#808080'
const GLYPH = { used: '█', buffer: '░' } as const // free space is left blank: no empty-state line

// Held by the host, so the bar survives a hot reload of this file.
const reading = atom({ plugin: 'dock', key: 'barReading' } as const, null as Reading | null)
const isHidden = atom({ plugin: 'dock', key: 'barHidden' } as const, false)

export const MIN_WIDTH = 24 // narrower than this, the bar is not drawn

export async function barStart($: EngineInterface) {
  const hidden = (await $.store.get('barHidden').catch(() => undefined)) === true
  await update($, isHidden, () => hidden)
  void refresh($).catch(() => {})
}

// After a turn or a compaction the window has changed.
export async function barRefresh($: EngineInterface) {
  await refresh($).catch(() => {})
}

// /context-bar flips it; `on`, `off` set it; `status` only reports (the dock command reads that).
export async function barCommand($: EngineInterface, args: string) {
  const arg = args.trim().toLowerCase()
  if (!['', 'on', 'off', 'status'].includes(arg)) return { text: 'Use /context-bar, /context-bar on, /context-bar off or /context-bar status' }
  const hidden = arg === 'status' ? await read($, isHidden) : await update($, isHidden, h => (arg === 'on' ? false : arg === 'off' ? true : !h))
  if (arg !== 'status') {
    await $.store.set('barHidden', hidden).catch(() => {})
    if (!hidden) await refresh($).catch(() => {})
  }
  return { text: hidden ? 'Context bar hidden. /context-bar shows it again' : 'Context bar on' }
}

// What to draw, or null while the bar is hidden or has no reading yet.
export async function barReady($: EngineInterface) {
  return (await read($, isHidden)) ? null : await read($, reading)
}

// The bar in a box as wide as it is given: a flex row of segments and a wrapping legend, so it fills
// whatever room the pet and the rings leave. `columns` only bounds the glyph runs the segments clip.
export function barView({ Box, Text }: Ui, r: Reading, columns: number) {
  const head = `${tokens(r.total)} of ${tokens(r.window)}${r.compactsAt ? ` · compacts at ${tokens(r.compactsAt)}` : ''}`
  const pct = ` ${r.percent}% `
  const level = r.compactsAt ? r.total / r.compactsAt : r.total / r.window
  return (
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
      <Box height={1}>
        {r.slices.map(s => (
          <Box width={0} flexGrow={Math.round((s.tokens / r.window) * 10_000)} minWidth={s.kind === 'used' ? 1 : 0} overflow="hidden">
            {s.kind !== 'free' && (
              <Box width={columns} flexShrink={0}>
                <Text color={s.color}>{GLYPH[s.kind].repeat(columns)}</Text>
              </Box>
            )}
          </Box>
        ))}
      </Box>
      <Box flexWrap="wrap" columnGap={3}>
        {r.slices
          .filter(s => s.kind === 'used')
          .map(s => (
            <Box flexShrink={0}>
              <Text>
                <Text color={s.color}>{'■ '}</Text>
                <Text>{`${s.name} `}</Text>
                <Text bold>{tokens(s.tokens)}</Text>
                <Text dimColor>{` ${share(s.tokens, r.window)}`}</Text>
              </Text>
            </Box>
          ))}
      </Box>
    </Box>
  )
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
