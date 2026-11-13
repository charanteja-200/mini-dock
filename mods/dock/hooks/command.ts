// Dock: one command to show or hide the pixel pet, the context bar and the status ring together or one at a time.
//   /dock               all three off if any is showing, otherwise all three on
//   /dock on | off      all three on, or all three off
//   /dock pet|bar|ring  just that one, flipped (or `on`, `off`: /dock ring off); several may be named
//   /dock status        which are showing
// Each part answers its own command (/pixel-pet, /context-bar, /status-ring); this asks them the same way.

const PARTS = { pet: 'pixel-pet', bar: 'context-bar', ring: 'status-ring' } as const
export type Part = keyof typeof PARTS
type State = 'on' | 'off' | 'status' | undefined

export const USAGE = 'Use /dock, /dock on, /dock off, /dock status, or name one or more of pet, bar and ring: /dock ring off'

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

export type Commands = Record<Part, (args: string) => Promise<{ text: string }>>

// Applies what was asked through the parts' own commands and says how all three stand. Each part says "hidden" when it is off.
export async function dockRun(asked: NonNullable<ReturnType<typeof parse>>, commands: Commands) {
  const isShown = async (p: Part) => !/hidden/i.test((await commands[p]('status')).text)
  if (asked.state !== 'status') {
    const state = target(asked.state, await Promise.all(asked.parts.map(isShown)))
    for (const p of asked.parts) await commands[p](state)
  }
  const all = Object.keys(PARTS) as Part[]
  return `Dock: ${(await Promise.all(all.map(async p => `${PARTS[p]} ${(await isShown(p)) ? 'on' : 'off'}`))).join(', ')}`
}
