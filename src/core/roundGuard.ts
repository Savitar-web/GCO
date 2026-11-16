/** Synchronous guard: events in the same render can settle a round only once. */
export class RoundGuard {
  private settled = false
  reset() { this.settled = false }
  finish() { if (this.settled) return false; this.settled = true; return true }
}

export function advanceSequence<T>(sequence: readonly T[], input: readonly T[], value: T) {
  if (!sequence.length || input.length >= sequence.length) return { input: [...input], result: 'closed' as const }
  const next = [...input, value]
  return { input: next, result: value !== sequence[input.length] ? 'fail' as const : next.length === sequence.length ? 'success' as const : 'input' as const }
}
