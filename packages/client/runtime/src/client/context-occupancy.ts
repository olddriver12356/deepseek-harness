/** Context occupancy percentage shared by session-aware UI surfaces. */
export interface ContextPressureValue {
  readonly pressureTokens?: number
  readonly projectedTokens?: number
  readonly contextWindow?: number
}

/**
 * Calculate the displayed context occupancy from the native projection.
 * @param pressure - native context-pressure projection value.
 * @returns clamped percentage, or undefined until numerator and window exist.
 */
export function contextOccupancyPercent(
  pressure: ContextPressureValue | undefined,
): number | undefined {
  const usedTokens = pressure?.projectedTokens ?? pressure?.pressureTokens
  if (usedTokens === undefined || pressure?.contextWindow === undefined) return undefined
  return Math.min(100, Math.round(usedTokens / pressure.contextWindow * 100))
}
