// Renders docs/dock.svg and docs/moods.svg from the plugins' own code, so the pictures in the READMEs
// cannot drift from what the plugins draw: the pet's pixels come from pixel-pet's sprite.js and the rings
// from status-ring's rings.ts. The context bar is a mock-up with sample numbers.
//   bun scripts/render-docs.ts
import { mkdirSync, writeFileSync } from 'node:fs'

import { colorOf, draw } from '../mods/pixel-pet/hooks/sprite.js'
import { moods, words } from '../mods/pixel-pet/src/moods.js'
import { rings } from '../mods/status-ring/hooks/rings.ts'

const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
const BG = '#141414'
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

// The pet's cells (half blocks: a glyph, a foreground, a background) back to a 16 by 8 grid of pixels.
function pixels(mood: string): (string | null)[][] {
  const bytes = Buffer.from(draw(mood, 1500, 100000, colorOf(mood)), 'base64')
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const hex = (c: number) => (c & 0x01000000 ? null : `#${(c & 0xffffff).toString(16).padStart(6, '0')}`)
  const grid: (string | null)[][] = Array.from({ length: 8 }, () => Array(16).fill(null))
  for (let row = 0; row < 4; row++) {
    for (let x = 0; x < 16; x++) {
      const at = (row * 16 + x) * 12
      const glyph = v.getUint32(at, true)
      const fg = hex(v.getUint32(at + 4, true))
      const bg = hex(v.getUint32(at + 8, true))
      if (glyph === 0x2580) [grid[row * 2]![x], grid[row * 2 + 1]![x]] = [fg, bg]
      else if (glyph === 0x2584) grid[row * 2 + 1]![x] = fg
    }
  }
  return grid
}

function pet(mood: string, x: number, y: number, scale: number) {
  return pixels(mood)
    .flatMap((row, py) => row.map((c, px) => (c ? `<rect x="${x + px * scale}" y="${y + py * scale}" width="${scale}" height="${scale}" fill="${c}"/>` : '')))
    .join('')
}

// The rings, dot by dot, from the same cells the plugin sends to the terminal.
function ringDots(outer: number, inner: number, x: number, y: number, pitch: number) {
  const BITS = [[0x01, 0x02, 0x04, 0x40], [0x08, 0x10, 0x20, 0x80]]
  const out: string[] = []
  rings(outer, inner).forEach((row, cy) => {
    let cx = 0
    for (const run of row) {
      for (const ch of run.text) {
        const bits = ch === ' ' ? 0 : ch.charCodeAt(0) - 0x2800
        for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) if (bits & BITS[i]![j]!) out.push(`<circle cx="${(x + (cx * 2 + i + 0.5) * pitch).toFixed(1)}" cy="${(y + (cy * 4 + j + 0.5) * pitch).toFixed(1)}" r="${(pitch * 0.38).toFixed(2)}" fill="${run.color}"/>`)
        cx++
      }
    }
  })
  return out.join('')
}

function dock() {
  const W = 900
  const H = 190
  const barX = 150
  const barW = 580
  const inner = barW - 32
  // sample context: name, tokens, share of a 1M window
  const used = [
    ['system prompt', '4.2k', 0.4, '#7aa2f7'], ['system tools', '32k', 3.2, '#7dcfff'], ['mcp server instructions', '4.2k', 0.4, '#bb9af7'],
    ['memory files', '16k', 1.6, '#e0af68'], ['skills', '10k', 1, '#f7768e'], ['messages', '151k', 15, '#d97757'],
  ] as const
  let bx = barX + 16
  const segs = used.map(([, , pct, color]) => {
    const w = Math.max(3, (pct / 100) * inner)
    const r = `<rect x="${bx.toFixed(1)}" y="68" width="${w.toFixed(1)}" height="14" fill="${color}"/>`
    bx += w
    return r
  })
  const buffer = `<rect x="${barX + 16 + inner - 0.033 * inner}" y="68" width="${0.033 * inner}" height="14" fill="#808080" opacity="0.5"/>`
  const legend = used.map(([name, tokens, pct, color]) => `<tspan fill="${color}">■ </tspan><tspan fill="#e8e8e8">${esc(name)} </tspan><tspan fill="#e8e8e8" font-weight="bold">${tokens}</tspan><tspan fill="#8a8a8a"> ${pct < 0.1 ? '&lt;0.1' : pct}%</tspan>`)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="The dock above the prompt: a pixel pet, the context window bar and two usage rings">
<rect width="${W}" height="${H}" rx="10" fill="${BG}"/>
${pet('idle', 28, 51, 7)}
<rect x="${barX}" y="22" width="${barW}" height="114" rx="7" fill="none" stroke="#5c5c5c" stroke-width="1.5"/>
<g font-family="${FONT}" font-size="13">
<text x="${barX + 16}" y="46"><tspan fill="#d97757">◆ </tspan><tspan fill="#f2f2f2" font-weight="bold">context</tspan></text>
<text x="${barX + barW - 78}" y="46" text-anchor="end" fill="#8a8a8a">217k of 1M · compacts at 967k</text>
<rect x="${barX + barW - 68}" y="33" width="52" height="19" rx="2" fill="#4ade80"/><text x="${barX + barW - 42}" y="47" text-anchor="middle" fill="#0b0b0b" font-weight="bold">22%</text>
</g>
${segs.join('')}${buffer}
<g font-family="${FONT}" font-size="10.4" xml:space="preserve"><text x="${barX + 16}" y="104">${legend.slice(0, 3).join('   ')}</text><text x="${barX + 16}" y="122">${legend.slice(3).join('   ')}</text></g>
${ringDots(37, 72, 756, 33, 4.6)}
<line x1="14" y1="156" x2="${W - 14}" y2="156" stroke="#3d3d3d"/>
<text x="20" y="177" font-family="${FONT}" font-size="14" fill="#e8e8e8">❯ <tspan fill="#8a8a8a">your prompt</tspan></text>
</svg>
`
}

function moodSheet() {
  const cols = 4
  const cw = 200
  const ch = 118
  const rows = Math.ceil(moods.length / cols)
  const cells = moods.map((m: string, i: number) => {
    const x = (i % cols) * cw
    const y = Math.floor(i / cols) * ch
    return `${pet(m, x + (cw - 16 * 8) / 2, y + 16, 8)}<text x="${x + cw / 2}" y="${y + 104}" text-anchor="middle" font-family="${FONT}" font-size="13" fill="#c9c9c9">${esc(words[m as keyof typeof words])}</text>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cw}" height="${rows * ch}" viewBox="0 0 ${cols * cw} ${rows * ch}" role="img" aria-label="The twelve moods of the pixel pet">
<rect width="${cols * cw}" height="${rows * ch}" rx="10" fill="${BG}"/>
${cells.join('\n')}
</svg>
`
}

mkdirSync(new URL('../docs/', import.meta.url), { recursive: true })
writeFileSync(new URL('../docs/dock.svg', import.meta.url), dock())
writeFileSync(new URL('../docs/moods.svg', import.meta.url), moodSheet())
console.log('wrote docs/dock.svg and docs/moods.svg')
