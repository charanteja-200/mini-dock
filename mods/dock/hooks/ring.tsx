// Status ring: how much of my plan limits have I used?
//   Two rings: the 5-hour window outside, coloured green, amber then rose as it fills; the weekly window
//   inside, coloured by pace (on track to end the week at or under 98%). Hovering a ring shows its
//   percentage in the centre. /status-ring shows or hides it, kept across sessions.
//   register.tsx draws it in the dock row and calls these; this keeps the readings and answers the command.
import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, SessionRateLimit } from 'claude-code'

import type { Limits } from '../types'
import { COLUMNS, ROWS, fillColor, label, paceColor, rings } from './rings'

type Ui = Elements['terminal']

const GAP = 1 // between the context bar and the rings
const SCOPE = { outer: 'status-ring-outer', inner: 'status-ring-inner' } as const

const limits = atom({ plugin: 'dock', key: 'ringLimits' } as const, null as Limits | null)
const isHidden = atom({ plugin: 'dock', key: 'ringHidden' } as const, false)

export const RING_WIDTH = COLUMNS + GAP // the columns the rings take, their gap included

export async function ringStart($: EngineInterface) {
  const hidden = (await $.store.get('ringHidden').catch(() => undefined)) === true
  await update($, isHidden, () => hidden)
  void $.session.usage().then(u => ringSave($, u.rateLimits)).catch(() => {})
}

// /status-ring flips it; `on`, `off` set it; `status` only reports (the dock command reads that).
export async function ringCommand($: EngineInterface, args: string) {
  const arg = args.trim().toLowerCase()
  if (!['', 'on', 'off', 'status'].includes(arg)) return { text: 'Use /status-ring, /status-ring on, /status-ring off or /status-ring status' }
  const hidden = arg === 'status' ? await read($, isHidden) : await update($, isHidden, h => (arg === 'on' ? false : arg === 'off' ? true : !h))
  if (arg !== 'status') await $.store.set('ringHidden', hidden).catch(() => {})
  return { text: hidden ? 'Status ring hidden. /status-ring shows it again' : 'Status ring on' }
}

// What to draw, or null while the rings are hidden or have no reading yet (off a subscription).
export async function ringReady($: EngineInterface) {
  return (await read($, isHidden)) ? null : await read($, limits)
}

// The rings in a box of a fixed size, so whatever sits beside it is laid out in what is left.
export async function ringView($: EngineInterface, { Box, Text }: Ui, l: Limits) {
  const weeklyColor = l.weeklyResetsAt === undefined ? fillColor(l.weekly) : paceColor(l.weekly, l.weeklyResetsAt, await $.clock.now())
  const centre = (ring: 'outer' | 'inner', percent: number, color: string) => (
    <Box position="absolute" top={2} left={4} width={3} display="none" hover={{ scope: SCOPE[ring], display: 'flex' }}>
      <Text bold color={color}>{label(percent)}</Text>
    </Box>
  )
  return (
    <Box flexDirection="column" width={COLUMNS} height={ROWS} marginLeft={GAP} flexShrink={0}>
      {rings(l.fiveHour, l.weekly, weeklyColor).map(row => (
        <Box flexDirection="row">
          {row.map(run => (run.ring ? <Text color={run.color} hover={{ scope: SCOPE[run.ring] }}>{run.text}</Text> : <Text>{run.text}</Text>))}
        </Box>
      ))}
      {centre('outer', l.fiveHour, fillColor(l.fiveHour))}
      {centre('inner', l.weekly, weeklyColor)}
    </Box>
  )
}

export async function ringSave($: EngineInterface, windows: SessionRateLimit[]) {
  const fiveHour = windows.find(w => w.kind === 'five_hour')?.percentUsed
  const week = windows.find(w => w.kind === 'seven_day')
  const weekly = week?.percentUsed
  if (fiveHour === undefined && weekly === undefined) return // off a subscription, or no reading yet
  const resetsAt = week?.resetsAt ? Date.parse(week.resetsAt) : NaN
  await update($, limits, () => ({
    fiveHour: Math.min(fiveHour ?? 0, 100),
    weekly: Math.min(weekly ?? 0, 100),
    ...(Number.isFinite(resetsAt) && { weeklyResetsAt: resetsAt }),
  }))
}
