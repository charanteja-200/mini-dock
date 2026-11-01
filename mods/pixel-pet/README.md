# pixel-pet

A tiny pixel critter above the prompt that reacts to what the session is doing. It sits on the left of the row that holds the context bar and the status ring. `/pixel-pet` hides it or brings it back (`on`, `off` and `status` work too), and the choice is remembered across sessions.

## Where it comes from

This is a modified copy of the plugin part of [heydamir/termling](https://github.com/heydamir/termling) 0.2.0 by Damir, used under its MIT licence (see [LICENSE](LICENSE), which is his, unchanged). Only the plugin is included, not termling's browser page, its npx helper or its React component. What differs:

- It is drawn at half size, 16 by 4 cells, with half-block characters, so it fits beside the other two. `HALF` at the top of `hooks/sprite.js` switches back to the full 32 by 7.
- It lays the other bands out in the width it leaves and centres them against itself.
- The mood word and note are not shown (there is no room in a single row).
- The command is `/pixel-pet`, takes `on`, `off` and `status`, and the plugin depends on `status-ring`.

An unofficial fan project, not affiliated with or endorsed by Anthropic.

## Moods

The critter changes colour, face and props with the state of the session.

| Mood | Colour | What it means | What triggers it |
| --- | --- | --- | --- |
| idle | orange | Nothing is happening | A session starts, a turn is stopped, or a compaction finishes. It falls asleep after 45 seconds. |
| listening | orange | It heard you | You send a prompt. It lasts about a second, then it is thinking. |
| thinking | orange, a spark above | Working between steps | The gaps between tool calls, the Task tool (subagents), and any tool it does not know. |
| reading files | orange, holding a page | Reading | `Read`, `NotebookRead`, `WebFetch` |
| searching | orange, a magnifier | Looking for something | `Grep`, `Glob`, `LS`, `WebSearch` |
| writing code | orange, at a keyboard | Changing files | `Edit`, `MultiEdit`, `Write`, `NotebookEdit`, `TodoWrite` |
| running a command | peach, a sweat drop | Running something | `Bash` and its output, and every MCP tool |
| confused | red, puffing steam | Something went wrong | A tool call failed (back to thinking after about 2.6 seconds), or the turn ended in an error (back to idle after 3 seconds). |
| waiting for you | amber, a bell | It needs your answer | A permission request is open. It returns to what it was doing once you answer. |
| compacting | green, dizzy eyes | Making room in the context | The conversation is being compacted. It lasts up to 12 seconds, then idle. |
| done | gold, confetti | The turn is finished | Claude stops its turn. It lasts about 3.4 seconds, then idle. |
| napping | lavender, drifting Zs | Quiet | The idle-prompt notification, the end of the session, or 45 seconds of idle. |

## Limits

- It draws only in the terminal, not in the desktop app or the chat panel of an editor extension, and needs a terminal with true color.
- While a permission dialog is open Claude Code hides the band, so "waiting for you" shows only as the dialog closes.
- Where an organization manages Claude Code, the permission, notification and compaction events skip personally installed plugins, so those moods do not show.
- If the space beside it is under 30 columns the pet is not drawn.

Part of [mini-dock](../..).
