// Dock: one command to show or hide the pixel pet, the context bar and the status ring together or one at a time.
//   /dock               all three off if any is showing, otherwise all three on
//   /dock on | off      all three on, or all three off
//   /dock pet|bar|ring  just that one, flipped (or `on`, `off`: /dock ring off); several may be named
//   /dock status        which are showing
// Each part is its own plugin with its own command; this runs them, and skips any that is not installed.
import type { EngineInterface, Register } from 'claude-code'

const PARTS = { pet: 'pixel-pet', bar: 'context-bar', ring: 'status-ring' } as const
type Part = keyof typeof PARTS
type State = 'on' | 'off' | 'status' | undefined

const USAGE = 'Use /dock, /dock on, /dock off, /dock status, or name one or more of pet, bar and ring: /dock ring off'

// "ring off" -> { parts: ['ring'], state: 'off' }; no part named means all of them. Undefined if a word is not understood.
export function parse(args: string): { parts: Part[]; state: State } | undefined {
  const all = Object.keys(PARTS) as Part[]
  const parts: Part[] = []
  let state: State
  for (const word of args.toLowerCase().split(/\s+/).filter(Boolean)) {
    const part = all.find(p => word === p || word === PARTS[p])
    if (part) parts.push(part)
    else if ((word === 'on' || word === 'off' || word === 'status') && !state) state = word
    else return undefined
  }
  return { parts: parts.length ? parts : all, state }
}

// With no state asked for, everything named goes the same way, so the parts cannot end up out of step.
export const target = (state: State, shown: boolean[]): 'on' | 'off' => (state === 'on' || state === 'off' ? state : shown.some(Boolean) ? 'off' : 'on')

type Asked = NonNullable<ReturnType<typeof parse>>

// Runs the parts' own commands, which print their own lines; `status` is told in a toast.
async function drive($: EngineInterface, asked: Asked) {
  const installed = new Set((await $.command.list()).map(c => c.name))
  const parts = asked.parts.filter(p => installed.has(PARTS[p]))
  if (parts.length === 0) return $.ui.toast('The pixel pet, context bar and status ring are not installed')
  const shown: boolean[] = []
  for (const p of parts) shown.push(!/hidden/i.test((await $.command.run({ command: PARTS[p], args: 'status' })).text ?? '')) // each part says "hidden" when it is off
  if (asked.state === 'status') return $.ui.toast(parts.map((p, i) => `${PARTS[p]} ${shown[i] ? 'on' : 'off'}`).join(', '))
  const state = target(asked.state, shown)
  for (const p of parts) await $.command.run({ command: PARTS[p], args: state })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({ name: 'dock', description: 'Show or hide the pixel pet, context bar and status ring', argumentHint: '[pet|bar|ring] [on|off|status]' }).catch(() => {})
    return r
  })

  on('command.run', { command: 'dock' }, async ($, e) => {
    const asked = parse(e.args)
    if (!asked) return { text: USAGE }
    // A command may not run another from inside its own hook (the turn would wait on itself), so this answers now and runs them a moment later.
    $.clock.after(1, () => void drive($, asked).catch(() => {}))
    return {}
  })
}
