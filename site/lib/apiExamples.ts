// The example answers shown on /docs/api, kept here so a script can check them against the live site.
// Real responses, shortened. Amounts are whole numbers in the smallest unit, sent as text.
export const EX = {
  stats: `{
  "wxmrSupply": "3209487611904223",
  "xmrUsd": 524.79,
  "solUsd": 109.69,
  "solver": {
    "exits": 2,
    "xmrPico": "62680603749",
    "refunds": 0,
    "reservePico": "4248146712348",
    "enabled": true,
    "lastPaidAt": 1791597875
  },
  "node": {
    "height": 3790812,
    "targetHeight": 3790812,
    "synchronized": true,
    "topBlockHash": "aa39ebf55a4b1ec35bd2a64be2f273362882eddf664f32b4cd2580d66a81e585",
    "walletHeight": 3790812,
    "at": 1792813309
  }
}`,
  info: `{
  "version": "3f1c2a9d0b7e",
  "enabled": true,
  "deposit": "5GDP6viv4mK1XE2RBtdLoz3ct65YFjq6yfFoqXBi7bbk",
  "boxPub": "l0meX+p6q/5U+TC5qoqbTZLttsYxSrqy8EPjXZGyhTA=",
  "spreadBps": 60,
  "quoteTtl": 60,
  "minPico": "10000000000",
  "maxPico": "500000000000",
  "availablePico": "500000000000",
  "addrFeeBps": 90,
  "addrTtl": 900
}`,
  estimate: `{
  "lamports": "1000000000",
  "xmrOut": "206393255024",
  "feeBps": 90,
  "ttl": 900
}`,
  node: `{
  "ours": {
    "height": 3790812,
    "targetHeight": 3790812,
    "synchronized": true,
    "topBlockHash": "aa39ebf55a4b1ec35bd2a64be2f273362882eddf664f32b4cd2580d66a81e585",
    "walletHeight": 3790812,
    "at": 1792813309
  },
  "reference": {
    "node": "node.sethforprivacy.com",
    "height": 3790812,
    "hashAtOurTop": "aa39ebf55a4b1ec35bd2a64be2f273362882eddf664f32b4cd2580d66a81e585",
    "match": true
  }
}`,
  tokens: `[
  {
    "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "symbol": "USDC",
    "name": "USD Coin",
    "decimals": 6,
    "icon": "https://…/logo.png",
    "verified": true
  }
]`,
}

// Each address the page documents, with the example it shows (null: described in words only).
// scripts/api-drift.mts asks the live site for each one and compares the field names.
export const DOCUMENTED: { path: string; kind: 'json' | 'csv'; example: string | null }[] = [
  { path: '/api/stats', kind: 'json', example: EX.stats },
  { path: '/api/v2/info', kind: 'json', example: EX.info },
  { path: '/api/v2/estimate?amount=1000000000', kind: 'json', example: EX.estimate },
  { path: '/api/v2/stats', kind: 'json', example: null },
  { path: '/api/node', kind: 'json', example: EX.node },
  { path: '/api/tokens?q=USDC', kind: 'json', example: EX.tokens },
]
