# context-bar

Your context window as a stacked bar above the prompt: a colour per category (system prompt, tools, memory files, skills, messages and so on), free space left blank, token counts, and the point where the conversation compacts.

`/context-bar` flips it; `/context-bar on`, `off` and `status` set or report it. The choice is remembered across sessions.

## Where it comes from

This is a modified copy of `context-bar` from [hamzafer/claude-code-mods](https://github.com/hamzafer/claude-code-mods) by Hamza Zafar, used under its MIT licence (see [LICENSE](LICENSE), which is his, unchanged). What differs from his 0.1.1:

- Free space is drawn blank instead of as a line.
- The legend never wraps free space or the compaction buffer onto a second line (the header already gives what is used and where compaction starts), so the bar stays one height beside the status ring.
- The command takes `on`, `off` and `status`.
- Manifest details (version, repository link).

Part of [mini-dock](../..).
