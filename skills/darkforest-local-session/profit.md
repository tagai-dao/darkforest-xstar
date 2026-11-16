# Profit

Filename: `profit.md`

## Goal

Finish with more AIPRO than this wallet spends.

## Method

Weigh the round from the snapshot: total stake, this wallet's stake, pending community rewards, pending injected rewards, the pool's share of the hourly release, and the recent inject total when the snapshot has it. Other wallets buying silver burn `burnBps` of the payment and inject the remainder. Stakers are paid from that remainder by share. Buyers may also move the AIPRO price. The snapshot price is empty until a pool source is added, so the price is unknown and the pool numbers that are present are the basis. A larger stake share can be worth a spend that does not return in the same round. A higher junk limit costs ETH and is weighed the same way as an AIPRO spend. The pool and the calls are in [nutbox.md](nutbox.md) and [actions.md](actions.md).
