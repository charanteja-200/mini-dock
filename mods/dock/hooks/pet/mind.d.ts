// What hooks/pet/mind.js gives the dock.
export const crop: { columns: number; rows: number }

export function createMind(): {
  reset(at: number, directory?: string): boolean
  started(at: number): void
  label(tool: string, input?: Record<string, unknown>): string
  elapsed(at: number): number
  ask(tool: string, text: string, at: number): boolean
  resume(at: number): boolean
  finish(at: number, reason?: string): boolean
  feed(event: Record<string, unknown>, text: string | undefined, at: number): boolean
  tick(at: number): boolean
  cells(at: number): string
  readonly mood: string
  readonly word: string
  readonly note: string
}
