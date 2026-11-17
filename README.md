# pretoken-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Satechmedia/pretoken-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Satechmedia/pretoken-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it ranks the protocols in a sealed DefiLlama snapshot that record no token by what a token would be worth at today's record, using mcap/TVL multiples measured from the tokens in the same snapshot that already trade. Every ranked protocol gets a low/mid/high value band and a farm plan whose steps each carry an estimated cost and time, shown in a sortable, filterable dashboard with a detail view per protocol.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
```

Node 22.18 or later, standard library only, no network. The run writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`; open `out/dashboard/index.html` to read the board. Two runs write the same bytes.

## Method

```
implied value = TVL x size multiple x category tilt x growth x maturity x breadth
```

- **Ranked**: every protocol on the watchlist, plus every other protocol that records no token and is not a custody product (bridge, liquid staking, exchange), a version of an existing protocol, or a wrapped or staked product. On the kit's snapshot that is 198 rows: 40 on the watchlist, 20 more above the floor, 138 below it.
- **Comparables**: tokens that trade, one per ticker, as market cap over the summed TVL of every protocol recording that ticker (93 on the kit's snapshot). They are never ranked; the dashboard lists them under "Already trading" with what the model would have said for each.
- **Size multiple**: a Theil-Sen line through the comparables, ln(mcap/TVL) against ln(TVL). The market pays less per dollar of TVL as TVL grows, so a flat median would overvalue large protocols.
- **Category tilt**: the median of a category's residuals from that line, shrunk toward no tilt by n/(n+5) and capped at 4x either way, because most categories have only a few comparables.
- **Growth, maturity, breadth**: half of the 7-day TVL change (clamped to +/-30%); 0.75 at listing rising to 1 after 12 months with no token; +2% per doubling of the chain count, capped at 1.10. These are small and bounded on purpose: on the comparables they explain little of what size and category leave over.
- **Band**: low and high are the 25th and 75th percentile of the model's error on the comparables, widened for each missing input.
- **Farm plans**: steps come from the protocol's category (vault, lending, CDP, DEX, derivatives, real-world assets, staking, network) and are costed from its chains with a per-transaction gas table, a position size and a holding period. Costs are estimates. No plan promises a token, points or an airdrop.

No protocol name is hard-coded: exchange names used by the set-aside rule are read from the snapshot's own CEX category.

## Layout

| Path | What it holds |
| --- | --- |
| `main.ts` | Entrypoint: reads the snapshot, writes the outputs and the dossier |
| `lib/snapshot.ts` | Snapshot types and reader |
| `lib/stats.ts` | Quantiles and the Theil-Sen fit |
| `lib/multiples.ts` | Comparables, size curve, category tilts, band |
| `lib/value.ts` | The valuation of one protocol |
| `lib/farm.ts` | Costed farm plans by category and chain |
| `lib/board.ts` | Selection, ranking, gate checks, dashboard data |
| `dashboard/` | The page: plain HTML, CSS and JavaScript |
| `tools/explore.ts` | The snapshot exploration the model was designed from |
| `tools/validate.ts` | An independent check of `out/` against every gate rule |

Implied values are this model's estimates from one snapshot, not forecasts and not financial advice.

---

<sub>Entered on [make.fun](https://make.fun/?ref=y3d8gmga&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
