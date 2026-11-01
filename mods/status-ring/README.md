# status-ring

Your plan limits as two rings beside the context bar: the 5-hour window outside, the weekly window inside. Hover a ring and its percentage shows in the middle.

`/status-ring` flips it; `/status-ring on`, `off` and `status` set or report it. The choice is remembered across sessions.

## Colours

The **outer** ring (5-hour) goes by how full it is:

| Used | Colour |
| --- | --- |
| under 50% | green |
| 50% to under 80% | amber |
| 80% and over | rose |

The **inner** ring (weekly) goes by pace, not by the raw percentage. The week is a budget that climbs evenly from 0% at the start of the week to 98% at the reset, so `pace = 98% x the fraction of the week gone`:

| Where you are | Colour |
| --- | --- |
| within 2 points of pace, or below it | green |
| more than 2 points over pace | amber |
| more than 10 points over pace, or at 98% or more | rose |

The 2-point grace keeps the first hours of a week green. If the reset time is not known the inner ring falls back to the outer ring's rule. The number in the middle takes its ring's colour.

## Drawing

Each ring is drawn in braille dots, 11 columns by 5 rows. The arc starts at 12 o'clock, between the two dot columns of the top cell, and runs clockwise. A cell has one colour, so the end of the arc is accurate to a cell. A ring that reads 98 or more is drawn closed; below that it always shows a gap. The number is always three cells wide (`05%`, `42%`, `100`) so it centres on the middle cell.

## Limits

- It needs an account that reports usage limits; without one, and before the first reading, it draws nothing.
- It is not drawn when the space beside the bar is under 30 columns.

Depends on `context-bar` (it sits beside it). Part of [mini-dock](../..). MIT, see [LICENSE](LICENSE).
