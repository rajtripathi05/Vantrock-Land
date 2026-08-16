/**
 * Internal rate of return — bisection solver.
 *
 * Newton's method can diverge or oscillate on the irregular cash-flow shapes
 * a development pro forma produces (one large negative at t=0, small
 * annual positives, one large positive at exit). Bisection is slower but
 * unconditionally converges for any cash-flow series with exactly one sign
 * change, which every scenario this engine builds has by construction.
 *
 * PURE MODULE: no I/O, no framework, no storage.
 */

function npv(rate: number, cashFlows: readonly number[]): number {
  let total = 0;
  for (let t = 0; t < cashFlows.length; t += 1) {
    total += cashFlows[t]! / (1 + rate) ** t;
  }
  return total;
}

/**
 * Solve for the annual rate at which NPV(cashFlows) = 0.
 *
 * Returns null when no root exists in [-0.99, 10] (e.g. all cash flows have
 * the same sign) rather than throwing — a financial engine that cannot solve
 * IRR for a given scenario must say so, not crash the analysis.
 */
export function irr(cashFlows: readonly number[]): number | null {
  if (cashFlows.length < 2) return null;

  const hasPositive = cashFlows.some((cf) => cf > 0);
  const hasNegative = cashFlows.some((cf) => cf < 0);
  if (!hasPositive || !hasNegative) return null;

  let low = -0.99;
  let high = 10;
  let npvLow = npv(low, cashFlows);
  const npvHigh = npv(high, cashFlows);

  if (Number.isNaN(npvLow) || Number.isNaN(npvHigh)) return null;
  // No sign change across the bracket — bisection cannot proceed.
  if (npvLow * npvHigh > 0) return null;

  for (let iteration = 0; iteration < 200; iteration += 1) {
    const mid = (low + high) / 2;
    const npvMid = npv(mid, cashFlows);
    if (Math.abs(npvMid) < 1e-7) return mid;
    if (npvLow * npvMid < 0) {
      high = mid;
    } else {
      low = mid;
      npvLow = npvMid;
    }
  }

  return (low + high) / 2;
}
