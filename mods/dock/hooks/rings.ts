// The two rings as braille cells: 5 rows is 20 dots, the circle's diameter. 11 columns, not 10: an odd
// width has a middle cell, so the 3 characters of the number sit centred on the circle.
export const COLUMNS = 11
export const ROWS = 5

// The number in the middle, always 3 cells wide: "05%", "42%", "100".
export const label = (percent: number) => {
  const n = Math.round(percent)
  return n >= 100 ? '100' : `${String(n).padStart(2, '0')}%`
}

export type Ring = 'outer' | 'inner'
export type Run = { text: string; color?: string; ring?: Ring }

export const TRACK = '#4a4a4a'

// Green, amber, rose as the window fills.
export function fillColor(percent: number) {
  return percent >= 80 ? '#fb7185' : percent >= 50 ? '#fbbf24' : '#4ade80'
}

// When a window resets, in the viewer's time: "2:30 PM", or "4 PM" on the hour; with `withDay`, "Mon 2:30 AM".
// Undefined once it has passed, when the figures are about to change.
export function resetLabel(resetsAt: number, now: number, withDay = false) {
  if (!(resetsAt > now)) return undefined
  const at = new Date(resetsAt)
  const time = at
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .replace(/ /g, ' ') // newer engines put a narrow space before AM and PM
    .replace(':00', '')
  return withDay ? `${at.toLocaleDateString('en-US', { weekday: 'short' })} ${time}` : time
}

const WEEK = 7 * 24 * 60 * 60 * 1000
export const WEEKLY_TARGET = 98 // the week should end at or under this percent
const GRACE = 2 // points over pace still green, so the first hours of a week stay calm
const SLACK = 10 // points over pace before amber turns rose

// Green, amber, rose by pace: against a budget that climbs evenly from 0 at the week's start to 98% at its reset.
export function paceColor(used: number, resetsAt: number, now: number) {
  const elapsed = Math.min(Math.max(1 - (resetsAt - now) / WEEK, 0), 1)
  const pace = WEEKLY_TARGET * elapsed
  return used >= WEEKLY_TARGET || used > pace + SLACK ? '#fb7185' : used > pace + GRACE ? '#fbbf24' : '#4ade80'
}

const CX = COLUMNS // the centre in dots: the middle of the middle cell
const CY = ROWS * 2
// Radii in dots: two bands 2 dots thick with a 2 dot gap, and a hole (r < 4) that leaves the middle row's three
// centre cells empty for the number. The radii sit on the cells' edges (a row is 4 dots, so its edges are at
// r = 2, 6 and 10 on the vertical axis), which keeps the two rings out of one cell, and a cell has one colour.
const BANDS: Record<Ring, [number, number]> = { outer: [8, 10], inner: [4, 6] }
const SUB = 4 // a dot is on when at least half of its SUB by SUB sample points lie in a band
const BITS = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
]

// Which band a dot belongs to, by how much of it lies in the band, so the edges are anti-aliased, not thresholded at the centre.
function ringAt(dx: number, dy: number): Ring | undefined {
  const hits = { outer: 0, inner: 0 }
  for (let a = 0; a < SUB; a++) {
    for (let b = 0; b < SUB; b++) {
      const r = Math.hypot(dx - 0.5 + (a + 0.5) / SUB, dy - 0.5 + (b + 0.5) / SUB)
      for (const k of ['outer', 'inner'] as const) if (r >= BANDS[k][0] && r <= BANDS[k][1]) hits[k]++
    }
  }
  const half = (SUB * SUB) / 2
  return hits.outer >= half ? 'outer' : hits.inner >= half ? 'inner' : undefined
}

const RIGHT = BITS[1]!.reduce((a, b) => a | b) // the right-hand column of dots in a cell

// One row per terminal row, each a list of runs of one color and one ring (empty cells have neither).
export function rings(outer: number, inner: number, innerColor = fillColor(inner)): Run[][] {
  const colors = { outer: fillColor(outer), inner: innerColor }
  const closed = (p: number) => (Math.round(p) >= 98 ? 100 : p) // from a number of 98 up the ring is complete: the last 2% is under a dot
  const percent = { outer: closed(outer), inner: closed(inner) }
  type Cell = { ring: Ring; mask: number; turn: number; filled: boolean }
  const grid: (Cell | undefined)[][] = []
  for (let cy = 0; cy < ROWS; cy++) {
    const line: (Cell | undefined)[] = []
    for (let cx = 0; cx < COLUMNS; cx++) {
      const dots = { outer: { mask: 0, n: 0, turns: 0 }, inner: { mask: 0, n: 0, turns: 0 } }
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 4; j++) {
          const dx = cx * 2 + i + 0.5 - CX
          const dy = cy * 4 + j + 0.5 - CY
          const ring = ringAt(dx, dy)
          if (!ring) continue
          let turn = Math.atan2(dx, -dy) / (2 * Math.PI) // 0 at twelve o'clock, clockwise, negative to its left
          // Twelve o'clock falls inside the middle cell of the top rows, so that whole cell is the start of the arc.
          if (turn < 0) turn = cx === (COLUMNS - 1) / 2 && cy < ROWS / 2 ? 0 : turn + 1
          const d = dots[ring]
          d.n++
          d.mask |= BITS[i]![j]!
          d.turns += turn
        }
      }
      // A cell holding dots of both rings belongs to the one with more of them.
      const ring: Ring | undefined = dots.outer.n === 0 && dots.inner.n === 0 ? undefined : dots.outer.n >= dots.inner.n ? 'outer' : 'inner'
      const d = ring && dots[ring]
      // A cell has one colour, so each is filled or not as a whole, by where its dots sit on the circle.
      // Twelve o'clock runs between the two dot columns of the top middle cell: that cell draws only the right column, where the arc starts.
      const start = ring !== undefined && cx === (COLUMNS - 1) / 2 && cy < ROWS / 2 && percent[ring] > 0 && percent[ring] < 100
      line.push(d ? { ring, mask: start ? d.mask & RIGHT : d.mask, turn: d.turns / d.n, filled: percent[ring] > 0 && d.turns / d.n <= percent[ring] / 100 } : undefined)
    }
    grid.push(line)
  }
  // The last 4% of a ring is under a cell wide, so a ring short of 100% always leaves its last cell empty.
  for (const ring of ['outer', 'inner'] as const) {
    const cells = grid.flat().filter((c): c is Cell => c?.ring === ring)
    if (percent[ring] < 100 && cells.every(c => c.filled)) cells.reduce((a, b) => (b.turn > a.turn ? b : a)).filled = false
  }
  return grid.map(line => {
    const row: Run[] = []
    for (const c of line) {
      const cell: Run = c ? { text: String.fromCharCode(0x2800 + c.mask), color: c.filled ? colors[c.ring] : TRACK, ring: c.ring } : { text: ' ' }
      const last = row.at(-1)
      if (last && last.color === cell.color && last.ring === cell.ring) last.text += cell.text
      else row.push(cell)
    }
    return row
  })
}
