// Dock: one row above the prompt with a pixel pet, the context bar and the usage rings, drawn by one plugin.
//   Claude Code stacks each plugin's tree as its own row and no longer lets one plugin lay out another's, so
//   three plugins could not share a row. This one holds all three parts and draws them side by side:
//   the pet and the rings are fixed-size boxes, and the bar takes whatever width is left between them.
//   /dock, /pixel-pet, /context-bar and /status-ring show or hide the whole dock or one part.
//   Claude Code reads a plugin's one hooks module statically, so every on(...) call is here; what each part
//   knows and draws lives in bar.tsx, ring.tsx, command.ts and pet/.
import type { EngineInterface, Register } from 'claude-code'

import { MIN_WIDTH, barCommand, barReady, barRefresh, barStart, barView } from './bar'
import { USAGE, dockRun, parse } from './command'
import { crop, createMind } from './pet/mind.js'
import { RING_WIDTH, ringCommand, ringReady, ringSave, ringStart, ringView } from './ring'

const frameMs = 66 // the pet's animation
const gap = 1 // between the pet and the context bar
const minRest = 30 // narrower than this beside the pet and the rings, they are dropped, the rings first

let hidden = false // the pet is off; read from the store at the start of each session

// /pixel-pet flips it; `on`, `off` set it; `status` only reports (the dock command reads that).
async function petCommand($: EngineInterface, args: string) {
  const arg = args.trim().toLowerCase()
  if (!['', 'on', 'off', 'status'].includes(arg)) return { text: 'Use /pixel-pet, /pixel-pet on, /pixel-pet off or /pixel-pet status' }
  if (arg !== 'status') {
    hidden = arg === 'on' ? false : arg === 'off' ? true : !hidden
    await $.store.set('petHidden', hidden)
    $.ui.invalidate('ui.render')
  }
  return { text: hidden ? 'Pixel pet hidden. /pixel-pet shows it again' : 'Pixel pet on' }
}

export const register: Register = on => {
  const mind = createMind()
  let site: string | null = null // the row the pet's Raster is in, for blitting its frames
  let misses = 0
  let slow: { cancel(): void } | null = null
  let fast: { cancel(): void } | null = null

  on('session.start', async ($, e, next) => {
    mind.reset(await $.clock.now(), e.cwd)
    await $.command.register({ name: 'dock', description: 'Show or hide the pixel pet, context bar and status ring', argumentHint: '[pet|bar|ring] [on|off|status]' }).catch(() => {})
    await $.command.register({ name: 'pixel-pet', description: 'Show or hide the pixel pet above the prompt', argumentHint: '[on|off|status]' }).catch(() => {})
    await $.command.register({ name: 'context-bar', description: 'Show or hide the context window bar above the prompt', argumentHint: '[on|off|status]' }).catch(() => {})
    await $.command.register({ name: 'status-ring', description: 'Show or hide the 5-hour and weekly usage rings', argumentHint: '[on|off|status]' }).catch(() => {})
    hidden = (await $.store.get('petHidden').catch(() => undefined)) === true
    slow?.cancel()
    slow = $.clock.every(400, () => {
      void (async () => {
        if (mind.tick(await $.clock.now())) $.ui.invalidate('ui.render')
        if (!site || hidden || fast) return
        fast = $.clock.every(frameMs, () => {
          void (async () => {
            if (!site) return
            const result = await $.ui.blit({ requestId: site, key: 'critter', cells: mind.cells(await $.clock.now()) })
            misses = result.deny ? misses + 1 : 0
            if (misses > 30) {
              site = null
              fast?.cancel()
              fast = null
            }
          })()
        })
      })()
    })
    await barStart($)
    await ringStart($)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const r = await next(e)
    if (r.changed.includes('rateLimits')) await ringSave($, e.rateLimits).catch(() => {})
    return r
  })

  on('prompt.submit', async ($, e, next) => {
    if (!e.isMeta && !e.command) {
      const at = await $.clock.now()
      mind.started(at)
      if (mind.feed({ hook_event_name: 'UserPromptSubmit' }, '', at)) $.ui.invalidate('ui.render')
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    if (mind.feed({ hook_event_name: 'PreToolUse', tool_name: tool }, mind.label(tool, e as unknown as Record<string, unknown>), await $.clock.now())) $.ui.invalidate('ui.render')
    const result = await next(e)
    const failed = Boolean(result && ('deny' in result || ('isError' in result && result.isError)))
    if (mind.feed({ hook_event_name: 'PostToolUse', tool_name: tool, failed }, failed ? `${tool} did not go through` : undefined, await $.clock.now())) $.ui.invalidate('ui.render')
    return result
  }).catch(($, e, next) => next(e))

  on('classic.PermissionRequest', async ($, e, next) => {
    const tool = String(e.tool_name ?? 'Tool')
    if (mind.ask(tool, mind.label(tool, (e.tool_input ?? {}) as Record<string, unknown>), await $.clock.now())) $.ui.invalidate('ui.render')
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.Notification', async ($, e, next) => {
    if (e.notification_type === 'idle_prompt' && mind.feed({ hook_event_name: 'Notification', notification_type: 'idle_prompt' }, '', await $.clock.now())) $.ui.invalidate('ui.render')
    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.compact', async ($, e, next) => {
    if (mind.feed({ hook_event_name: 'PreCompact' }, '', await $.clock.now())) $.ui.invalidate('ui.render')
    const result = await next(e)
    if (mind.feed({ hook_event_name: 'PostCompact' }, '', await $.clock.now())) $.ui.invalidate('ui.render')
    if (!e.agentId && 'messages' in result) void barRefresh($) // a /compact empties the window without a turn ending
    return result
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) {
      if (mind.finish(await $.clock.now(), e.reason)) $.ui.invalidate('ui.render')
      await barRefresh($) // a subagent's turn fills its own window, not this one
    }
    return result
  })

  on('command.run', { command: 'pixel-pet' }, async ($, e) => petCommand($, e.args))

  on('command.run', { command: 'context-bar' }, async ($, e) => barCommand($, e.args))

  on('command.run', { command: 'status-ring' }, async ($, e) => ringCommand($, e.args))

  // The parts are this plugin's own, so /dock asks them directly: a plugin's calls on $ run beneath its own hooks.
  on('command.run', { command: 'dock' }, async ($, e) => {
    const asked = parse(e.args)
    if (!asked) return { text: USAGE }
    return { text: await dockRun(asked, { pet: a => petCommand($, a), bar: a => barCommand($, a), ring: a => ringCommand($, a) }) }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e) // what Claude Code draws here stays below the row
    if (e.surface !== 'terminal' || e.props.hasSurvey) return rest
    const reading = await barReady($)
    const limits = await ringReady($)
    let withPet = !hidden
    let withRing = limits !== null
    const middle = () => e.props.bodyColumns - (withPet ? crop.columns + gap : 0) - (withRing ? RING_WIDTH : 0)
    if (middle() < minRest) withRing = false
    if (middle() < minRest) withPet = false
    const withBar = reading !== null && middle() >= MIN_WIDTH
    if (!withPet && !withRing && !withBar) return rest

    const ui = $.ui.resolve(e)
    const { Box, Raster } = ui
    let critter = null
    if (withPet) {
      const at = await $.clock.now()
      mind.resume(at)
      site = e.requestId
      misses = 0
      critter = (
        <Box width={crop.columns} height={crop.rows} marginRight={gap} flexShrink={0}>
          <Raster key="critter" columns={crop.columns} rows={crop.rows} cells={mind.cells(at)} />
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" alignItems="center">
          {critter}
          <Box flexDirection="column" flexGrow={1}>
            {withBar && barView(ui, reading, middle())}
          </Box>
          {withRing && limits && (await ringView($, ui, limits))}
        </Box>
        {rest}
      </Box>
    )
  })
}
