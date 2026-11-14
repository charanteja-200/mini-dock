import { describe, expect, test } from 'claude-code/testing'

import { carryOver, fillColor, label, paceColor, resetLabel, rings } from '../hooks/rings'

describe('rings', () => {
  test('a new session starts from the last reading, with a reset window counted as empty', () => {
    const last = { fiveHour: 32, fiveHourResetsAt: 5000, weekly: 40, weeklyResetsAt: 90_000 }
    expect(carryOver(last, 1000)).toEqual(last) // both windows still open: as they were
    expect(carryOver(last, 6000)).toEqual({ fiveHour: 0, weekly: 40, weeklyResetsAt: 90_000 }) // the 5-hour window has reset since
    expect(carryOver(last, 95_000)).toEqual({ fiveHour: 0, weekly: 0 }) // and the weekly one
    expect(carryOver({ fiveHour: 32, weekly: 40 }, 1000)).toBeNull() // no reset times: no telling how old it is
    expect(carryOver({ fiveHour: 32, fiveHourResetsAt: 5000, weekly: 40 }, 1000)).toBeNull()
    expect(carryOver(null, 1000)).toBeNull()
    expect(carryOver(undefined, 1000)).toBeNull()
  })

  test('when a window resets, in local time', () => {
    const at = (day: number, hour: number, minute: number) => new Date(2026, 10, day, hour, minute).getTime() // 13 November 2026 is a Friday, in whatever zone this runs
    const now = at(13, 12, 0)
    expect(resetLabel(at(13, 14, 30), now)).toBe('2:30 PM') // the 5-hour window: the time alone
    expect(resetLabel(at(13, 16, 0), now)).toBe('4 PM') // on the hour, no minutes
    expect(resetLabel(at(14, 2, 0), now)).toBe('2 AM') // past midnight, still no day
    expect(resetLabel(at(14, 0, 5), now)).toBe('12:05 AM')
    expect(resetLabel(at(13, 12, 0), now)).toBeUndefined() // reached or past: the figures are about to change
    expect(resetLabel(at(13, 9, 0), now)).toBeUndefined()
    expect(resetLabel(at(16, 2, 30), now, true)).toBe('Mon 2:30 AM') // the weekly window: with the weekday
    expect(resetLabel(at(13, 16, 0), now, true)).toBe('Fri 4 PM')
  })

  test('rings', () => {
    expect([fillColor(10), fillColor(50), fillColor(80)]).toEqual(['#4ade80', '#fbbf24', '#fb7185'])
    const rows = rings(37, 72)
    expect(rows.length).toBe(5)
    for (const row of rows) expect(row.reduce((n, r) => n + r.text.length, 0)).toBe(11)
    expect(rows[2]!.map(r => r.text).join('').slice(4, 7)).toBe('   ') // room for the 3-cell number in the middle cell's row
    const runs = rows.flat()
    expect(runs.some(r => r.ring === 'outer' && r.color === '#4ade80')).toBe(true)
    expect(runs.some(r => r.ring === 'inner' && r.color === '#fbbf24')).toBe(true)
  })

  test('the number is always 3 cells, so it centres on the middle cell', () => {
    expect([0, 4.6, 9, 42, 99.4, 99.6, 100].map(label)).toEqual(['00%', '05%', '09%', '42%', '99%', '100', '100'])
  })

  test('an empty ring is all track and a full one has none', () => {
    const dots = (outer: number, inner: number) => rings(outer, inner).flat().filter(r => r.ring)
    expect(dots(0, 0).every(r => r.color === '#4a4a4a')).toBe(true)
    expect(dots(100, 100).some(r => r.color === '#4a4a4a')).toBe(false)
    for (const ring of ['outer', 'inner'] as const)
      for (const p of [90, 96, 97]) expect(dots(p, p).some(r => r.ring === ring && r.color === '#4a4a4a')).toBe(true) // a gap you can see, in each ring
  })

  test('the arc starts in the top middle cell, at twelve oclock', () => {
    const top = (p: number) => rings(p, p)[0]!.flatMap(r => Array.from(r.text, () => r.color))
    expect(top(10)[5]).toBe('#4ade80') // the middle cell is filled
    expect(top(10)[4]).toBe('#4a4a4a') // the cell to its left is not
    const chars = (p: number) => Array.from(rings(p, p)[0]!.map(r => r.text).join(''))
    expect(chars(10)[5]!.charCodeAt(0) & 0x47).toBe(0) // twelve oclock is between its two dot columns: the left one stays blank
    expect(chars(10)[5]!.charCodeAt(0) & 0xb8).not.toBe(0)
    expect(top(96)[4]).toBe('#4a4a4a') // and at 96% it is the one left empty, so the gap shows
  })

  test('a ring is complete from a number of 98 up', () => {
    expect(rings(97.6, 99)).toEqual(rings(100, 100))
    expect(rings(97.4, 97.4)).not.toEqual(rings(100, 100))
  })

  test('weekly pace', () => {
    const DAY = 24 * 60 * 60 * 1000
    const reset = 7 * DAY // the week runs from 0 to 7 days
    const [green, amber, rose] = ['#4ade80', '#fbbf24', '#fb7185']
    expect(paceColor(30, reset, 1 * DAY)).toBe(rose) // 30% on day one: pace is 14%, over by more than 10 points
    expect(paceColor(20, reset, 1 * DAY)).toBe(amber) // ahead of pace, within 10 points
    expect(paceColor(10, reset, 1 * DAY)).toBe(green)
    expect(paceColor(50, reset, 4 * DAY)).toBe(green) // pace at day four is 56%
    expect(paceColor(90, reset, reset - 1)).toBe(green) // end of the week, under 98
    expect(paceColor(98, reset, reset - 1)).toBe(rose) // at the 98% mark
    expect(paceColor(1, reset, 0)).toBe(green) // the week's first moments: within the grace
    expect(paceColor(5, reset, -DAY)).toBe(amber) // a reset more than a week away counts as a fresh week
    const inner = rings(10, 72, rose).flat().filter(r => r.ring === 'inner' && r.color !== '#4a4a4a')
    expect(inner.length > 0 && inner.every(r => r.color === rose)).toBe(true)
  })
})
