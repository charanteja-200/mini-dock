import { describe, expect, test } from 'claude-code/testing'

import { parse, target } from '../hooks/register'

const toasts: string[] = []

// Stands in for the three part plugins: each command answers `status`, `on`, `off`, or flips.
function parts(on: any, shown: Record<string, boolean>, installed = Object.keys(shown)) {
  on('session.start', (_$: any, e: any) => ({ sessionId: 's', cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('ui.toast', (_$: any, e: any) => (toasts.push(e.text), { value: undefined }))
  on('clock.after', () => ({ value: undefined })) // the engine calls the timer's function once this resolves
  on('command.list', () => ({ value: installed.map(name => ({ name, description: '', source: 'plugin' })) }))
  for (const name of Object.keys(shown)) {
    on('command.run', { command: name }, (_$: any, e: any) => {
      const arg = e.args.trim()
      if (arg !== 'status') shown[name] = arg === 'on' ? true : arg === 'off' ? false : !shown[name]
      return { text: shown[name] ? `${name} on` : `${name} hidden` }
    })
  }
}

const start = ($: any) => $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
const settle = () => new Promise(done => (globalThis as any).setTimeout(done, 40))
const dock = async ($: any, args: string) => {
  const result = await $.command.run({ command: 'dock', args } as any)
  await settle() // the dock runs the parts a moment after it answers
  return result
}

describe('dock', () => {
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

  test('/dock turns all off when any shows, then all on', async ($, on) => {
    const shown = { 'pixel-pet': true, 'context-bar': false, 'status-ring': true }
    parts(on, shown)
    await start($)
    await dock($, '')
    expect(Object.values(shown)).toEqual([false, false, false])
    await dock($, '')
    expect(Object.values(shown)).toEqual([true, true, true])
  })

  test('/dock on and off set all three, and one part can be named', async ($, on) => {
    const shown = { 'pixel-pet': false, 'context-bar': false, 'status-ring': false }
    parts(on, shown)
    await start($)
    await dock($, 'on')
    expect(Object.values(shown)).toEqual([true, true, true])
    await dock($, 'ring')
    expect(shown).toEqual({ 'pixel-pet': true, 'context-bar': true, 'status-ring': false })
    await dock($, 'pet bar off')
    expect(shown).toEqual({ 'pixel-pet': false, 'context-bar': false, 'status-ring': false })
  })

  test('status reports, a part that is not installed is skipped, nonsense gets the usage', async ($, on) => {
    const shown = { 'pixel-pet': true, 'status-ring': false }
    parts(on, shown)
    await start($)
    await dock($, 'status')
    expect(toasts.at(-1)).toBe('pixel-pet on, status-ring off')
    await dock($, 'off')
    expect(shown).toEqual({ 'pixel-pet': false, 'status-ring': false })
    expect((await dock($, 'sideways')).text).toMatch(/^Use \/dock/)
  })
})
