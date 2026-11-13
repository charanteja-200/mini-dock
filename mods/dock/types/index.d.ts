export type Slice = { name: string; tokens: number; color: string; kind: 'used' | 'free' | 'buffer' }

export type Reading = {
  slices: Slice[]
  total: number // tokens in use
  window: number // the window measured against
  percent: number
  compactsAt?: number // where auto-compaction runs, when it is on
}

export type Limits = {
  fiveHour: number // percent of the 5-hour window used, 0 to 100
  weekly: number // percent of the weekly window used, 0 to 100
  weeklyResetsAt?: number // when the weekly window resets, in ms; absent, the inner ring colours by fill
}

declare module 'claude-code' {
  interface PluginState {
    dock: {
      barReading: Reading | null
      barHidden: boolean
      ringLimits: Limits | null
      ringHidden: boolean
    }
  }
}
