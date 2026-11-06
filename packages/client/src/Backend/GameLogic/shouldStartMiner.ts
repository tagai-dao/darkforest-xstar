export function shouldStartMiner(input: {
  watchOnly: boolean;
  hasHome: boolean;
  playerOnChain: boolean;
}): boolean {
  return !input.watchOnly && input.hasHome && input.playerOnChain;
}
