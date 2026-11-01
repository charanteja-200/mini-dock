export type Limits = {
  fiveHour: number // percent of the 5-hour window used, 0 to 100
  weekly: number // percent of the weekly window used, 0 to 100
  weeklyResetsAt?: number // when the weekly window resets, in ms; absent, the inner ring colours by fill
}

declare module 'claude-code' {
  interface PluginState {
    'status-ring': { limits: Limits | null; isHidden: boolean }
  }
}
