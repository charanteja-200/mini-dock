# dock

One command, `/dock`, to show or hide the pixel pet, the context bar and the status ring together or one at a time. Installing it installs all three (`pixel-pet` depends on `status-ring`, which depends on `context-bar`).

| Command | Does |
| --- | --- |
| `/dock` | Hides all three if any is showing, otherwise shows all three |
| `/dock on`, `/dock off` | Shows or hides all three |
| `/dock status` | Says which are showing |
| `/dock pet`, `/dock bar`, `/dock ring` | Flips just that one |
| `/dock ring off`, `/dock pet bar on` | Sets one or several; the words `pixel-pet`, `context-bar` and `status-ring` work too |

It does no drawing and keeps no state of its own. It runs each part's own command (`/pixel-pet`, `/context-bar`, `/status-ring` with `on`, `off` or `status`), skips any that is not installed, and sends everything the same way so the parts cannot end up out of step. A command may not run another from inside its own handler, so `/dock` answers at once and runs the parts a moment later; each part prints its own line, and `/dock status` answers in a toast.

Part of [mini-dock](../..). MIT, see [LICENSE](LICENSE).
