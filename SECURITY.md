# Security

Nero's solver holds real XMR and real SOL. If you find something that could put funds or users' privacy at risk, please tell us privately first.

## How to report

Use GitHub's private vulnerability reporting on this repository: **Security → Report a vulnerability**. Include what you found, how to reproduce it, and what an attacker could do with it. Please do not open a public issue or post about it until we have answered and fixed it.

## What we care about most

- Anything that makes the solver pay twice, pay the wrong address, pay without a finalized deposit, or refund without proof.
- Anything that lets a third party read a sealed Monero address, or link a Solana deposit to a Monero payout from public data.
- Anything that makes the site seal to a key, or build a transaction to an address, other than the ones pinned in `site/lib/v2.ts`.
- A signed promise that the solver did not honor.

## What we will never do

We will never message you first, and we will never ask for a seed, a private key or a wallet signature outside the swap page. Anyone who does is not us.
