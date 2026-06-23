// The web SPA is channel 'web', except when reached from a window sticker
// (it carries ?src=sticker). Anything else is treated as 'web'.
export function resolveActivationChannel(searchParams) {
  return searchParams?.get?.('src') === 'sticker' ? 'sticker' : 'web';
}
