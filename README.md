# mini-dock

A small dock above the Claude Code prompt, in one row: a pixel pet, your context window as a stacked bar, and your usage limits as two rings.

![The dock above the prompt: the pixel pet on the left, the context bar in the middle, the two usage rings on the right](docs/dock.svg)

The pet and the rings are drawn by the plugins' own code; the numbers in the context bar are sample values.

Each part is its own plugin, so you can take one, two or all three. `/dock` shows or hides them together or one at a time.

## What is in it

| Plugin | What it does | Command |
| --- | --- | --- |
| [`dock`](mods/dock) | Installs all three and adds one command to show or hide them | `/dock` |
| [`pixel-pet`](mods/pixel-pet) | A tiny critter that reacts to what the session is doing | `/pixel-pet` |
| [`context-bar`](mods/context-bar) | The context window as a stacked bar, a colour per category, with the compaction point | `/context-bar` |
| [`status-ring`](mods/status-ring) | The 5-hour (outer) and weekly (inner) usage limits as two rings; hover a ring for its percentage | `/status-ring` |

## Install

Everything, in one line:

```bash
claude plugin install dock@mini-dock --marketplace charanteja-200/mini-dock
```

Or just the parts you want:

```bash
claude plugin install pixel-pet@mini-dock --marketplace charanteja-200/mini-dock
claude plugin install context-bar@mini-dock --marketplace charanteja-200/mini-dock
claude plugin install status-ring@mini-dock --marketplace charanteja-200/mini-dock
```

On a Claude Code without `--marketplace`, add the marketplace first:

```bash
claude plugin marketplace add charanteja-200/mini-dock
claude plugin install dock@mini-dock
```

Start a new `claude` session in a terminal, or run `/reload-plugins` in one that is open.

`pixel-pet` depends on `status-ring`, which depends on `context-bar`, so installing the pet installs all three. The dependencies are also what puts the pet outermost in the row, which the layout relies on.

## Commands

Each command flips its part when run alone, and takes `on`, `off` or `status`.

| Command | Does |
| --- | --- |
| `/dock` | Hides all three if any is showing, otherwise shows all three |
| `/dock on`, `/dock off` | Shows or hides all three |
| `/dock status` | Says which are showing |
| `/dock pet`, `/dock bar`, `/dock ring` | Flips just that one; `/dock ring off` sets it; several may be named |
| `/pixel-pet`, `/context-bar`, `/status-ring` | The same for one part, without the dock |

The choice is remembered across sessions. A part that is not installed is skipped.

## How the row fits together

The pet lays the other two out in the width it leaves and centres them against itself. The ring sits beside the bar, centred against it. The bar's legend drops free space and the compaction buffer when they would wrap onto a second line, so the bar stays the same height as the ring.

## Requirements and limits

- A Claude Code recent enough to run plugin mods; tested on 2.1.316.
- It draws only in the terminal (not the desktop app, and not the chat panel of an editor extension; use the editor's integrated terminal). The terminal needs true color.
- The rings need an account that reports usage limits; without one they draw nothing.
- While a permission dialog is open Claude Code hides the whole band.

## Uninstall

```bash
claude plugin uninstall dock@mini-dock
claude plugin uninstall pixel-pet@mini-dock
claude plugin uninstall status-ring@mini-dock
claude plugin uninstall context-bar@mini-dock
claude plugin marketplace remove mini-dock
```

## Development

Each plugin has tests: `claude plugin test mods/<name>`. The pictures in `docs/` are rendered from the plugins' code with `bun scripts/render-docs.ts`.

## Credits and licences

Everything here is MIT. Two of the plugins are modified copies of other people's work and keep their own licence files and credit.

| Part | Author | Notes |
| --- | --- | --- |
| `status-ring`, `dock`, this documentation | Charan Teja | [LICENSE](LICENSE) |
| `pixel-pet` | Damir, [heydamir/termling](https://github.com/heydamir/termling) | Modified copy of the plugin part; see [its README](mods/pixel-pet/README.md). [LICENSE](mods/pixel-pet/LICENSE) |
| `context-bar` | Hamza Zafar, [hamzafer/claude-code-mods](https://github.com/hamzafer/claude-code-mods) | Modified copy; see [its README](mods/context-bar/README.md). [LICENSE](mods/context-bar/LICENSE) |

An unofficial project, not affiliated with or endorsed by Anthropic.
