# context-bar

Your context window as a stacked bar above the prompt: a colour per category (system prompt, tools, memory files, skills, messages and so on), free space left blank, token counts, and the point where the conversation compacts.

`/context-bar` flips it; `/context-bar on`, `off` and `status` set or report it. The choice is remembered across sessions.

## Where it comes from

This is a modified copy of `context-bar` from [hamzafer/claude-code-mods](https://github.com/hamzafer/claude-code-mods) by Hamza Zafar, used under its MIT licence (see [LICENSE](LICENSE), which is his, unchanged). What differs from his 0.1.1:

- Free space is drawn blank instead of as a line.
- The bar and the legend lay themselves out by flex in whatever width they are given, instead of being sized from `bodyColumns`. Claude Code 2.1.323 no longer lets a plugin narrow `bodyColumns` for the plugins beneath it, which is how the pet and the ring used to leave themselves room.
- The legend lists only the used categories. Free space and the compaction buffer are not listed (the header already gives what is used and where compaction starts).
- The command takes `on`, `off` and `status`.
- Manifest details (version, repository link).

Part of [mini-dock](../..).
