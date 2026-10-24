// Simulation only: build the exit for a big public SOL wallet and an XMR address seen on-chain. Nothing is signed or sent.
import { buildExit, exitQuote } from '../lib/server/exit'
const wallet = process.argv[2] || '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9'
const xmr = '82wez4jsocbZf9DAYmM5HsbKre6pnE5LuSCnbAwVJDTKKYEfuvKeacaTgRddrJvVSBB6PwisuYtNvZes37G2PVJ3EKWgJYX'
console.log(await exitQuote({ inputMint: 'So11111111111111111111111111111111111111112', amount: '1000000000' }))
for (const [mint, amt] of [['So11111111111111111111111111111111111111112', '1000000000'], ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', '80000000']]) {
  try {
    const r = await buildExit({ wallet, inputMint: mint, amount: amt, xmrAddress: xmr })
    console.log('OK', mint.slice(0, 4), { bytes: r.bytes, units: r.units, withdrawal: r.withdrawal, xmrOutMin: r.quote.xmrOutMin, route: r.quote.route })
  } catch (e: any) { console.log('ERR', mint.slice(0, 4), e.message, JSON.stringify(e.detail)?.slice(0, 900)) }
}
