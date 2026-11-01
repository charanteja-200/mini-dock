// Status Ring: how much of my plan limits have I used?
//   Above the prompt, at the right of the context bar's row, two rings: the 5-hour window
//   outside, coloured green, amber then rose as it fills; the weekly window inside, coloured
//   by pace (on track to end the week at or under 98%). Hovering a
//   ring shows its percentage in the centre. /status-ring shows or hides it, kept across sessions.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { Limits } from '../types'
import { COLUMNS, ROWS, fillColor, label, paceColor, rings } from './rings'

const GAP = 1 // between the context bar and the rings
const MIN_REST = 30 // narrower than this beside the rings, the rings are not drawn
const SCOPE = { outer: 'status-ring-outer', inner: 'status-ring-inner' } as const

const limits = atom({ plugin: 'status-ring', key: 'limits' } as const, null as Limits | null)
const isHidden = atom({ plugin: 'status-ring', key: 'isHidden' } as const, false)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({ name: 'status-ring', description: 'Show or hide the 5-hour and weekly usage rings', argumentHint: '[on|off|status]' }).catch(() => {})
    const hidden = (await $.store.get('isHidden').catch(() => undefined)) === true
    await update($, isHidden, () => hidden)
    void $.session.usage().then(u => save($, u.rateLimits)).catch(() => {})
    return r
  })

  on('session.measure', async ($, e, next) => {
    const r = await next(e)
    if (r.changed.includes('rateLimits')) await save($, e.rateLimits).catch(() => {})
    return r
  })

  // /status-ring flips it; `on`, `off` set it; `status` only reports (the dock command reads that).
  on('command.run', { command: 'status-ring' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (!['', 'on', 'off', 'status'].includes(arg)) return { text: 'Use /status-ring, /status-ring on, /status-ring off or /status-ring status' }
    const hidden = arg === 'status' ? await read($, isHidden) : await update($, isHidden, h => (arg === 'on' ? false : arg === 'off' ? true : !h))
    if (arg !== 'status') await $.store.set('isHidden', hidden).catch(() => {})
    return { text: hidden ? 'Status ring hidden. /status-ring shows it again' : 'Status ring on' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const l = await read($, limits)
    const width = COLUMNS + GAP
    if (e.props.hasSurvey || !l || (await read($, isHidden)) || e.props.bodyColumns - width < MIN_REST) return next(e)
    // What sits beneath (the context bar among it) is laid out in what the rings leave.
    const rest = await next({ ...e, props: { ...e.props, bodyColumns: e.props.bodyColumns - width } })
    const { Box, Text } = $.ui.resolve(e)
    const weeklyColor = l.weeklyResetsAt === undefined ? fillColor(l.weekly) : paceColor(l.weekly, l.weeklyResetsAt, await $.clock.now())
    const centre = (ring: 'outer' | 'inner', percent: number, color: string) => (
      <Box position="absolute" top={2} left={4} width={3} display="none" hover={{ scope: SCOPE[ring], display: 'flex' }}>
        <Text bold color={color}>{label(percent)}</Text>
      </Box>
    )
    return (
      <Box flexDirection="row" alignItems="center">
        <Box flexDirection="column" flexGrow={1}>{rest}</Box>
        <Box flexDirection="column" width={COLUMNS} height={ROWS} marginLeft={GAP} flexShrink={0}>
          {rings(l.fiveHour, l.weekly, weeklyColor).map(row => (
            <Box flexDirection="row">
              {row.map(run => (run.ring ? <Text color={run.color} hover={{ scope: SCOPE[run.ring] }}>{run.text}</Text> : <Text>{run.text}</Text>))}
            </Box>
          ))}
          {centre('outer', l.fiveHour, fillColor(l.fiveHour))}
          {centre('inner', l.weekly, weeklyColor)}
        </Box>
      </Box>
    )
  })
}

async function save($: EngineInterface, windows: SessionRateLimit[]) {
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
