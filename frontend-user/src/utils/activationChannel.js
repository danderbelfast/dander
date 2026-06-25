// Returns { channel, source }. source = the fine attribution tag (e.g.
// 'sticker_window') sanitised to [a-z0-9_]; channel = the coarse bucket the
// dashboard rolls up by. Window stickers carry ?src=sticker_<location>; bare
// ?src=sticker still works; anything else is web. (Native app sets source itself.)
export function resolveActivationChannel(searchParams) {
  const raw = searchParams?.get?.('src');
  const source = typeof raw === 'string'
    ? (raw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32) || 'web')
    : 'web';
  const channel = source.startsWith('sticker') ? 'sticker'
    : source.startsWith('social') ? 'social'
    : source === 'app' ? 'app'
    : 'web';
  return { channel, source };
}
