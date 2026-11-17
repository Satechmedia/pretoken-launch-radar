// Farm plans: for each protocol, the concrete steps to become an early, real user of it, each with an
// estimated cost in USD and the time it takes. Nothing here is keyed on a protocol's name: the steps come
// from its category (what you can do there) and its chains (what a transaction costs there).
// A plan describes participation and its costs. It does not promise a token, points or an airdrop.

import type { Protocol } from './snapshot.ts';

/** Estimated USD cost of one ordinary transaction, by chain as the snapshot names it. Estimates, not quotes. */
const GAS_USD: Record<string, number> = {
  Ethereum: 3, Bitcoin: 1.5, Tron: 1, Litecoin: 0.05, Doge: 0.1, Cardano: 0.1, Binance: 0.1, Polkadot: 0.05,
  Arbitrum: 0.05, Base: 0.03, Optimism: 0.03, Linea: 0.05, Scroll: 0.05, Unichain: 0.03, Mantle: 0.03, Ink: 0.03,
  'zkSync Era': 0.05, Katana: 0.03, Starknet: 0.05, Polygon: 0.02, Avalanche: 0.05, Fantom: 0.02, Sonic: 0.02,
  Monad: 0.02, Berachain: 0.02, Plasma: 0.02, 'Hyperliquid L1': 0.02, Solana: 0.01, Sui: 0.01, Aptos: 0.01,
  Near: 0.01, Stellar: 0.01, Algorand: 0.01, Ripple: 0.01, TON: 0.05, Sei: 0.02, Flare: 0.02,
};
/** A chain the table does not know is priced like a typical low-fee network. */
const GAS_DEFAULT_USD = 0.1;
/** Flat estimate for getting funds onto the chain: an exchange withdrawal or one bridge transfer. */
const FUNDING_FEE_USD = 1.5;
/** Annual rate used to price capital that sits in the position: roughly what idle dollars earn elsewhere. */
const CAPITAL_RATE = 0.045;
/** Share of implied value used by the what-if yardstick; an assumption for scale, never a forecast. */
export const YARDSTICK_SHARE = 0.05;

export const gasUsd = (chain: string): number => GAS_USD[chain] ?? GAS_DEFAULT_USD;

export type Family = 'vault' | 'lending' | 'cdp' | 'dex' | 'perps' | 'rwa' | 'stake' | 'network';

const FAMILY_OF: Record<string, Family> = {
  'Risk Curators': 'vault', 'Onchain Capital Allocator': 'vault', Yield: 'vault', 'Yield Aggregator': 'vault',
  'Liquidity Manager': 'vault', 'Basis Trading': 'vault', CeDeFi: 'vault', 'Stablecoin Wrapper': 'vault',
  'Options Vault': 'vault', 'Leveraged Farming': 'vault', Farm: 'vault', Indexes: 'vault',
  Lending: 'lending', 'Uncollateralized Lending': 'lending', 'Collateral Markets': 'lending', 'CDP Manager': 'lending',
  CDP: 'cdp', 'Dual-Token Stablecoin': 'cdp', 'Algo-Stables': 'cdp', 'Stablecoin Issuer': 'cdp', 'Anchor BTC': 'cdp', 'Decentralized BTC': 'cdp',
  Dexs: 'dex', 'OTC Marketplace': 'dex', 'NFT Marketplace': 'dex', Launchpad: 'dex',
  Derivatives: 'perps', Options: 'perps', 'Prediction Market': 'perps', 'Interest Rate Derivatives': 'perps', Synthetics: 'perps',
  RWA: 'rwa',
  'Staking Pool': 'stake', Restaking: 'stake', 'Governance Incentives': 'stake', Insurance: 'stake',
};
export const familyOf = (category: string | null): Family => (category === null ? 'network' : (FAMILY_OF[category] ?? 'network'));

interface Playbook {
  label: string;
  /** Position size the plan is costed for, in USD. */
  ticket: number;
  /** Days the position is held before review. */
  days: number;
  risk: string;
}
const PLAYBOOK: Record<Family, Playbook> = {
  vault: { label: 'Vault deposit', ticket: 1000, days: 90, risk: 'Vault risk: the curator or strategy can lose principal, and withdrawals can queue when liquidity is lent out. Size it as money you can leave for the whole period.' },
  lending: { label: 'Supply and borrow', ticket: 1000, days: 90, risk: 'Liquidation risk on the borrow leg and smart-contract risk on the pool. Keep the loan small against the collateral and check the health factor weekly.' },
  cdp: { label: 'Mint and hold', ticket: 1000, days: 90, risk: 'The minted stablecoin can trade below its peg and the collateral can be liquidated in a sharp drop. Keep the collateral ratio well above the minimum.' },
  dex: { label: 'Trade and provide liquidity', ticket: 500, days: 60, risk: 'Impermanent loss on the liquidity position and price impact in thin pools. Use the deepest pair and quote every swap before signing.' },
  perps: { label: 'Margin and small trades', ticket: 500, days: 60, risk: 'Leverage can liquidate the margin, and funding payments add up. Trade at 2x or less and close positions you are not watching.' },
  rwa: { label: 'Subscribe and hold', ticket: 1000, days: 90, risk: 'Issuer and custody risk: the asset lives off-chain, access may need identity checks, and redemptions run on the issuer\u2019s schedule, not yours.' },
  stake: { label: 'Stake or delegate', ticket: 1000, days: 90, risk: 'Staked funds can be locked through an unbonding period and may be slashed. Read the exit terms before depositing, not after.' },
  network: { label: 'Use the network', ticket: 300, days: 60, risk: 'A young network or app can halt, and its bridge is the main risk to funds. Keep only working capital there.' },
};

export interface FarmStep {
  /** What to do. */
  action: string;
  /** Estimated cost of the step in USD (fees plus the cost of capital, as stated). */
  cost_usd: number;
  /** Time the step takes, in minutes of your attention. */
  minutes: number;
}

export interface FarmPlan {
  family: Family;
  label: string;
  entry_chain: string;
  ticket_usd: number;
  hold_days: number;
  steps: FarmStep[];
  total_cost_usd: number;
  total_minutes: number;
  risk: string;
  /** This ticket's share of YARDSTICK_SHARE of the implied value, pro rata to TVL: a scale check against cost. */
  yardstick_usd: number;
}

const cents = (x: number): number => Math.round(x * 100) / 100;

/** How many of the protocol's leading chains are considered for entry: its first-listed chains are where it mainly lives. */
const ENTRY_CANDIDATES = 3;

/** The chain to enter on: the cheapest per transaction among the protocol's first chains, the earlier one on a tie. */
export function entryChain(chains: string[]): string {
  let best = chains[0] ?? 'its home chain';
  for (const c of chains.slice(0, ENTRY_CANDIDATES)) if (gasUsd(c) < gasUsd(best)) best = c;
  return best;
}

/** The two category-specific steps that put the ticket to work on `chain`. */
function coreSteps(family: Family, p: Protocol, chain: string, gas: number, ticket: number, days: number): FarmStep[] {
  const t = `$${ticket.toLocaleString('en-US')}`;
  const half = `$${(ticket / 2).toLocaleString('en-US')}`;
  const weeks = Math.round(days / 7);
  switch (family) {
    case 'vault':
      return [
        { action: `Deposit ${half} into ${p.name}\u2019s largest stablecoin vault on ${chain}: one token approval and one deposit (2 transactions).`, cost_usd: cents(2 * gas), minutes: 10 },
        { action: `Put the other ${half} into a second ${p.name} vault with a different strategy or asset, so the wallet shows use of more than one product (2 transactions).`, cost_usd: cents(2 * gas), minutes: 10 },
      ];
    case 'lending':
      return [
        { action: `Supply ${t} of a major asset to ${p.name} on ${chain} and enable it as collateral (approval, supply and enable: 3 transactions).`, cost_usd: cents(3 * gas), minutes: 12 },
        { action: `Borrow about $${Math.round(ticket * 0.25)} of a stablecoin against it (25% loan-to-value, far from liquidation) and supply that back, so the wallet is both lender and borrower. Borrow interest is estimated at 6% a year over ${days} days (3 transactions).`, cost_usd: cents(3 * gas + ticket * 0.25 * 0.06 * (days / 365)), minutes: 12 },
      ];
    case 'cdp':
      return [
        { action: `Open a position on ${p.name} on ${chain} with ${t} of collateral and mint its stablecoin at 200% collateral or more (approval, deposit, mint: 3 transactions).`, cost_usd: cents(3 * gas), minutes: 15 },
        { action: `Place the minted stablecoin in ${p.name}\u2019s own savings or stability module instead of selling it, so the position supports the peg (2 transactions; mint fee estimated at 0.5% of the amount minted).`, cost_usd: cents(2 * gas + ticket * 0.5 * 0.005), minutes: 10 },
      ];
    case 'dex':
      return [
        { action: `Make one swap of about $${Math.round(ticket / 5)} a week on ${p.name} on ${chain} for ${weeks} weeks, in its deepest pair (${weeks} swaps; trading fee estimated at 0.3% of volume).`, cost_usd: cents(weeks * gas + weeks * (ticket / 5) * 0.003), minutes: weeks * 4 },
        { action: `Add ${half} of two-sided liquidity to that same pair and leave it for the period (2 approvals and 1 deposit).`, cost_usd: cents(3 * gas), minutes: 15 },
      ];
    case 'perps':
      return [
        { action: `Deposit ${t} of margin to ${p.name} on ${chain} (approval and deposit: 2 transactions).`, cost_usd: cents(2 * gas), minutes: 10 },
        { action: `Open and close one position of about ${t} notional (2x or less) each week for ${weeks} weeks, in the most liquid market (taker fee estimated at 0.05% a side).`, cost_usd: cents(weeks * 2 * gas + weeks * 2 * ticket * 0.0005), minutes: weeks * 8 },
      ];
    case 'rwa':
      return [
        { action: `Complete ${p.name}\u2019s onboarding: read the offering terms, the minimum ticket and who may hold it; identity checks are common for real-world assets and can take a few days to clear.`, cost_usd: 0, minutes: 45 },
        { action: `Subscribe ${t} on ${chain}, or the stated minimum if it is higher (approval and subscription: 2 transactions; entry fee estimated at 0.1%).`, cost_usd: cents(2 * gas + ticket * 0.001), minutes: 15 },
      ];
    case 'stake':
      return [
        { action: `Stake or delegate ${t} through ${p.name} on ${chain} (approval and stake: 2 transactions). Note the unbonding period before you sign.`, cost_usd: cents(2 * gas), minutes: 12 },
        { action: `Claim and restake the rewards once a month for ${Math.round(days / 30)} months, which keeps the wallet active rather than a single deposit (2 transactions each time).`, cost_usd: cents(Math.round(days / 30) * 2 * gas), minutes: Math.round(days / 30) * 6 },
      ];
    case 'network':
      return [
        { action: `Use ${p.name} on ${chain} for what it is for, with about $${ticket}: make 2 transactions a week for ${weeks} weeks (${weeks * 2} transactions), at different hours and of different sizes.`, cost_usd: cents(weeks * 2 * gas), minutes: weeks * 6 },
        { action: `Try each of its main functions at least once (send, receive, and any native app or staking it offers), about 6 further transactions.`, cost_usd: cents(6 * gas), minutes: 25 },
      ];
  }
}

/** Build the costed plan for one protocol. `impliedValue` only feeds the yardstick. */
export function farmPlan(p: Protocol, months: number | null, impliedValue: number, asOf: string): FarmPlan {
  const family = familyOf(p.category);
  const book = PLAYBOOK[family];
  const chain = entryChain(p.chains);
  const gas = gasUsd(chain);
  const { ticket, days } = book;
  const weeks = Math.round(days / 7);
  const age = months === null ? 'with no listing day on record' : `listed ${months < 1 ? 'under a month' : `${Math.round(months)} months`} ago`;

  const steps: FarmStep[] = [
    { action: `Verify before funding: open ${p.name}\u2019s own site and docs and confirm it has no token yet (DefiLlama records none as of ${asOf}; it was ${age}). Note whether it publishes a points or rewards programme and its rules.`, cost_usd: 0, minutes: 20 },
    { action: `Fund a wallet on ${chain} with $${ticket.toLocaleString('en-US')} plus a little of the chain\u2019s gas token, by exchange withdrawal or one bridge transfer. A transaction on ${chain} is estimated at $${gas.toFixed(2)}.`, cost_usd: cents(FUNDING_FEE_USD + gas), minutes: 15 },
    ...coreSteps(family, p, chain, gas, ticket, days),
  ];

  const second = p.chains.find((c) => c !== chain);
  if (second !== undefined) {
    const g2 = gasUsd(second);
    steps.push({
      action: `Repeat a small deposit (about $${Math.round(ticket / 10)}) on ${second}, the ${p.chains.length === 2 ? 'other chain' : `next of the ${p.chains.length} chains`} ${p.name} runs on: one bridge transfer and 2 transactions there at an estimated $${g2.toFixed(2)} each.`,
      cost_usd: cents(FUNDING_FEE_USD + 2 * g2),
      minutes: 20,
    });
  }
  steps.push({
    action: `Hold for ${days} days and check in weekly (${weeks} visits of 5 minutes): position health, any programme announcement, and the dates of any snapshot it publishes. The cost is the capital\u2019s time: $${ticket.toLocaleString('en-US')} at ${(CAPITAL_RATE * 100).toFixed(1)}% a year, before whatever the position itself earns.`,
    cost_usd: cents(ticket * CAPITAL_RATE * (days / 365)),
    minutes: weeks * 5,
  });
  steps.push({
    action: `Keep a record (wallet address, dates, transaction hashes) and decide at day ${days}: stay, or withdraw to the wallet (2 transactions). ${book.risk}`,
    cost_usd: cents(2 * gas),
    minutes: 15,
  });

  return {
    family,
    label: book.label,
    entry_chain: chain,
    ticket_usd: ticket,
    hold_days: days,
    steps,
    total_cost_usd: cents(steps.reduce((a, s) => a + s.cost_usd, 0)),
    total_minutes: steps.reduce((a, s) => a + s.minutes, 0),
    risk: book.risk,
    yardstick_usd: cents(impliedValue * YARDSTICK_SHARE * (ticket / p.tvl_usd)),
  };
}

/** Minutes as a short phrase: "20 min", "1 h 15 min". */
export function timeText(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** One step as the line board.json carries: the action, then its cost and time. */
export function stepText(step: FarmStep): string {
  const cost = step.cost_usd === 0 ? 'no fee' : `about $${step.cost_usd.toFixed(2)}`;
  return `${step.action} Cost: ${cost}. Time: ${timeText(step.minutes)}.`;
}
