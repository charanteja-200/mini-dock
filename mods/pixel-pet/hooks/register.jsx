import { crop, createMind } from "./mind.js";

const frameMs = 66;
const gap = 1; // between the pet and the context bar
const minRest = 30; // narrower than this beside the pet, the pet is not drawn

export const register = (on) => {
  const mind = createMind();
  let site = null;
  let misses = 0;
  let hidden = false;
  let slow = null;
  let fast = null;

  on("session.start", async ($, e, next) => {
    mind.reset(await $.clock.now(), e.cwd);
    try {
      hidden = (await $.store.get("hidden")) === true;
      await $.command.register({ name: "pixel-pet", description: "Show or hide the pixel pet above the prompt", argumentHint: "[on|off|status]" });
    } catch {}
    slow?.cancel();
    slow = $.clock.every(400, () => {
      void (async () => {
        if (mind.tick(await $.clock.now())) $.ui.invalidate("ui.render");
        if (!site || hidden || fast) return;
        fast = $.clock.every(frameMs, () => {
          void (async () => {
            if (!site) return;
            const result = await $.ui.blit({ requestId: site, key: "critter", cells: mind.cells(await $.clock.now()) });
            misses = result.deny ? misses + 1 : 0;
            if (misses > 30) {
              site = null;
              fast?.cancel();
              fast = null;
            }
          })();
        });
      })();
    });
    return next(e);
  });

  on("prompt.submit", async ($, e, next) => {
    if (!e.isMeta && !e.command) {
      const at = await $.clock.now();
      mind.started(at);
      if (mind.feed({ hook_event_name: "UserPromptSubmit" }, "", at)) $.ui.invalidate("ui.render");
    }
    return next(e);
  }).catch(($, e, next) => next(e));

  on("tool.call", async ($, e, next) => {
    const tool = String(e.tool);
    if (mind.feed({ hook_event_name: "PreToolUse", tool_name: tool }, mind.label(tool, e), await $.clock.now())) $.ui.invalidate("ui.render");
    const result = await next(e);
    const failed = Boolean(result && (result.deny || result.isError));
    if (mind.feed({ hook_event_name: "PostToolUse", tool_name: tool, failed }, failed ? `${tool} did not go through` : undefined, await $.clock.now())) $.ui.invalidate("ui.render");
    return result;
  }).catch(($, e, next) => next(e));

  on("classic.PermissionRequest", async ($, e, next) => {
    const tool = String(e.tool_name ?? "Tool");
    if (mind.ask(tool, mind.label(tool, e.tool_input ?? {}), await $.clock.now())) $.ui.invalidate("ui.render");
    return next(e);
  }).catch(($, e, next) => next(e));

  on("classic.Notification", async ($, e, next) => {
    if (e.notification_type === "idle_prompt" && mind.feed({ hook_event_name: "Notification", notification_type: "idle_prompt" }, "", await $.clock.now())) $.ui.invalidate("ui.render");
    return next(e);
  }).catch(($, e, next) => next(e));

  on("session.compact", async ($, e, next) => {
    if (mind.feed({ hook_event_name: "PreCompact" }, "", await $.clock.now())) $.ui.invalidate("ui.render");
    const result = await next(e);
    if (mind.feed({ hook_event_name: "PostCompact" }, "", await $.clock.now())) $.ui.invalidate("ui.render");
    return result;
  }).catch(($, e, next) => next(e));

  on("turn.complete", async ($, e, next) => {
    const result = await next(e);
    if (!e.agentId && mind.finish(await $.clock.now(), e.reason)) $.ui.invalidate("ui.render");
    return result;
  });

  // /pixel-pet flips it; `on`, `off` set it; `status` only reports (the dock command reads that).
  on("command.run", { command: "pixel-pet" }, async ($, e) => {
    const arg = e.args.trim().toLowerCase();
    if (!["", "on", "off", "status"].includes(arg)) return { text: "Use /pixel-pet, /pixel-pet on, /pixel-pet off or /pixel-pet status" };
    if (arg !== "status") {
      hidden = arg === "on" ? false : arg === "off" ? true : !hidden;
      await $.store.set("hidden", hidden);
      $.ui.invalidate("ui.render");
    }
    return { text: hidden ? "Pixel pet hidden. /pixel-pet shows it again" : "Pixel pet on" };
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const room = e.props.bodyColumns - crop.columns - gap;
    if (e.surface !== "terminal" || e.props.hasSurvey || hidden || room < minRest) return next(e);
    // Everything beneath (the context bar and the rings) is laid out in what the pet leaves,
    // and centred against it, so the pet overhangs it by the same amount above and below.
    const rest = await next({ ...e, props: { ...e.props, bodyColumns: room } });
    const at = await $.clock.now();
    mind.resume(at);
    site = e.requestId;
    misses = 0;
    const { Box, Raster } = $.ui.resolve(e);
    return (
      <Box flexDirection="row" alignItems="center">
        <Box width={crop.columns} height={crop.rows} marginRight={gap} flexShrink={0}>
          <Raster key="critter" columns={crop.columns} rows={crop.rows} cells={mind.cells(at)} />
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          {rest}
        </Box>
      </Box>
    );
  });
};
