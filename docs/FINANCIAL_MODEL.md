# Financial Model

Every formula below is implemented in `lib/financial/engine.ts` and unit-tested in
`tests/financial/`. This document exists so a developer (or analyst) can reproduce any
number by hand.

## Design rule: UNKNOWN never gets silently filled

If the analyst has not entered a land price for a site, every output that depends on land
cost (`TDC`, `yield_on_cost`, `equity`, `IRR`, `equity_multiple`) is `null`, not zero and
not a guessed number. `NOI`, `GDV`, and `RLV` do not depend on land price and still compute
— see `tests/financial/engine.test.ts` → "propagates UNKNOWN land price to null...".

## Inputs and their classifications

| Input | Classification | Default (base case) | Source |
|---|---|---|---|
| Land area | `DERIVED` | — | Site's stored geodesic measurement (`lib/geo/measure.ts`) |
| Land price (₹/acre) | `USER_INPUT` or `UNKNOWN` | none | Analyst enters on the site detail panel |
| Target GFA (sq ft) | `USER_INPUT` | — | Project mandate |
| Ground coverage ratio | `CURATED` | 0.45 | Typical single-storey Grade-A warehouse footprint-to-site ratio |
| Achieved rent (₹/sqft/month) | `CURATED` | 24 | Indicative Pune/Chakan/Talegaon Grade-A logistics rent |
| Rent growth (%/yr) | `CURATED` | 5% | Applied only in the multi-year IRR cash flow, not the single-period NOI/GDV |
| Stabilized occupancy (%) | `CURATED` | 92% | Typical stabilized occupancy for a single-tenant Grade-A shed |
| Opex ratio (% of gross potential rent) | `CURATED` | 8% | Typical opex ratio |
| Construction cost (₹/sqft) | `CURATED` | 1,800 | Grade-A shell + interior |
| Soft cost (% of construction cost) | `CURATED` | 12% | Design, approvals, project management |
| Loan to cost (%) | `CURATED` | 60% | Typical institutional industrial development gearing |
| Debt interest rate (%/yr) | `CURATED` | 11% | Indicative Indian CRE debt rate, interest-only |
| Development period (months) | `CURATED` | 18 | Design-to-handover for a build-to-suit shed |
| Hold period (years) | `CURATED` | 5 | Assumed hold from stabilization to exit |
| Exit cap rate (%) | `CURATED` | 8.25% | Indicative Grade-A industrial exit cap rate |

All defaults live in `BASE_ASSUMPTIONS` in `lib/financial/engine.ts`. None of these are
verified market quotes — every one carries a `CURATED` badge in the UI.

### Interactive overrides (Phase 8, 2026-08-16)

The Financials tab (`components/analysis/FinancialsTab.tsx`) exposes editable inputs for
six of the above — **Rent, Stabilized occupancy, Construction cost, Soft cost, Exit cap
rate, Development period** — via `FinancialOverrides` (`lib/financial/types.ts`). Land
price is edited on the site detail panel (Map & Sites tab), not duplicated here, since the
site record is its single source of truth. An overridden assumption is relabeled
`USER_INPUT` (not `CURATED`) everywhere it's displayed. Scenario multipliers/deltas
(the table two sections below) still apply on top of an override, exactly as they do on
top of the CURATED default — overriding rent to ₹30/sqft/month still produces a lower
downside and higher upside around that ₹30 figure, not three identical numbers.

**Development period does not drive any output formula in this MVP** (see "Simplifications"
under IRR below — all development cost is drawn at `t=0`, so there is no phased-draw
calculation for a development period to feed into). The override is still exposed because
the blueprint calls for it, but both the UI and this doc say so explicitly rather than
implying a false effect.

## Formulas

```
achievable_gfa_sqft   = land_area_acres × 43,560 × ground_coverage_ratio
gross_potential_rent  = achievable_gfa_sqft × rent_per_sqft_per_month × 12
NOI                   = gross_potential_rent × occupancy × (1 − opex_ratio)
construction_cost     = achievable_gfa_sqft × construction_cost_per_sqft
soft_cost             = construction_cost × soft_cost_pct
land_cost             = land_area_acres × land_price_per_acre        (null if land price unknown)
TDC                   = land_cost + construction_cost + soft_cost     (null if land_cost is null)
GDV                   = NOI / exit_cap_rate
yield_on_cost         = NOI / TDC                                     (null if TDC is null or ≤ 0)
RLV                   = GDV − construction_cost − soft_cost           (can be negative)
debt                  = TDC × loan_to_cost                            (null if TDC is null)
equity                = TDC − debt
```

## Scenarios

Three scenarios — downside, base, upside — apply multiplicative/additive adjustments to
four inputs (`lib/financial/engine.ts` → `SCENARIO_ADJUSTMENTS`):

| | Rent | Occupancy | Construction cost | Exit cap rate |
|---|---|---|---|---|
| Downside | ×0.90 | −5 pp | ×1.10 | +75 bps |
| Base | ×1.00 | ±0 | ×1.00 | ±0 |
| Upside | ×1.10 | +3 pp | ×0.95 | −50 bps |

Occupancy is clamped to `[0, 1]` after the adjustment.

## IRR and equity multiple

Built from an annual equity cash-flow series (`buildAnnualEquityCashFlows`):

```
t = 0:            cash flow = −equity
t = 1..N−1:       cash flow = NOI_t − annual_interest         (NOI grows at rent_growth_pct from year 2 on)
t = N (exit yr):  cash flow = NOI_N − annual_interest + (exit_value − debt)
                  exit_value = NOI_(N+1) / exit_cap_rate       (forward-NOI appraisal convention)
```

Where `annual_interest = debt × debt_interest_rate` (interest-only for the whole hold
period; principal is repaid from sale proceeds at exit).

**Simplifications, stated explicitly:**
- All development cost is drawn at `t=0` — no phased construction draw.
- Debt is interest-only for the entire hold; no amortization schedule.
- Opex ratio is embedded in year-0 NOI and assumed to scale proportionally with rent growth
  — not separately escalated.

`IRR` is solved by bisection (`lib/financial/irr.ts`) over cash flows with exactly one sign
change — this is unconditionally convergent for the cash-flow shapes this engine produces
(large negative at t=0, small positives, one large positive at exit), unlike Newton's
method which can diverge on this shape.

```
equity_multiple = Σ(max(0, cash_flow_t) for t = 1..N) / equity
```

## Rounding and units

- All monetary values are rupees (₹), formatted with Indian digit grouping and
  lakh/crore shorthand at the UI edge (`lib/geo/units.ts` → `formatInr`). No component
  performs arithmetic on a formatted value.
- Percentages are stored as fractions (0.0825, not 8.25) and formatted at the UI edge.
- No intermediate rounding inside the engine — only final display values are rounded.

## Limitations

- Rent, construction cost, cap rate, and financing terms are Vantrock's own analytical
  judgement for the corridor, not verified market quotes — always shown with a `CURATED`
  badge.
- The model does not account for phased construction draws, amortizing debt, or
  tenant-improvement/leasing-commission cash outflows.
- No sensitivity/Monte Carlo analysis — three discrete scenarios only.
