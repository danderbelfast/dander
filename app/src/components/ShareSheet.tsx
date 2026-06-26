/**
 * ShareSheet (native) — per-platform share with attribution, the RN port of
 * frontend-user's web ShareSheet. RN has no navigator.share/window.open, so:
 *   - web-intent platforms (FB/WhatsApp/X/Telegram) → Linking.openURL(<tagged URL>)
 *   - Instagram/TikTok (no web intent) → expo-clipboard copy of the tagged link
 *   - "More…" → RN Share.share() native sheet (platform-blind → social_other)
 *   - "Copy link" → clean canonical (untagged) — the honesty rule
 * Links point at the public web /o/:id (OG preview + recipient web flow).
 */
import React from 'react';
import { Alert, Linking, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { colors } from '../constants/colors';
import { env } from '../env';
import { trackShare } from '../api/offers';

const shareUrl = (offerId: number, platform: string) =>
  `${env.PUBLIC_APP_URL}/o/${offerId}?src=social_${platform}`;
const canonicalUrl = (offerId: number) => `${env.PUBLIC_APP_URL}/o/${offerId}`;

interface Platform {
  key: string;
  label: string;
  kind: 'intent' | 'copy';
  intent?: (u: string, t: string) => string;
}

const PLATFORMS: Platform[] = [
  { key: 'facebook',  label: 'Facebook',  kind: 'intent', intent: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  { key: 'whatsapp',  label: 'WhatsApp',  kind: 'intent', intent: (u, t) => `https://wa.me/?text=${encodeURIComponent(`${t} ${u}`)}` },
  { key: 'instagram', label: 'Instagram', kind: 'copy' },
  { key: 'x',         label: 'X',         kind: 'intent', intent: (u, t) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}` },
  { key: 'telegram',  label: 'Telegram',  kind: 'intent', intent: (u, t) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { key: 'tiktok',    label: 'TikTok',    kind: 'copy' },
];

interface Props {
  offerId: number;
  title: string;
  text: string;
  visible: boolean;
  onClose: () => void;
}

export function ShareSheet({ offerId, title, text, visible, onClose }: Props) {
  const shareText = text || title || 'Check out this deal';

  async function copy(url: string, message: string) {
    try {
      await Clipboard.setStringAsync(url);
      Alert.alert('Link copied', message);
    } catch {
      Alert.alert('Copy failed', 'Could not copy the link.');
    }
  }

  async function onPlatform(p: Platform) {
    trackShare(offerId);
    if (p.kind === 'intent' && p.intent) {
      const url = p.intent(shareUrl(offerId, p.key), shareText);
      try {
        const ok = await Linking.canOpenURL(url);
        if (ok) await Linking.openURL(url);
        else await copy(shareUrl(offerId, p.key), `Couldn't open ${p.label} — link copied instead.`);
      } catch {
        await copy(shareUrl(offerId, p.key), `Couldn't open ${p.label} — link copied instead.`);
      }
    } else {
      await copy(shareUrl(offerId, p.key), `Link copied — paste it into your ${p.label} story or bio.`);
    }
    onClose();
  }

  async function onCopyGeneric() {
    trackShare(offerId);
    await copy(canonicalUrl(offerId), 'Share link copied to clipboard.');
    onClose();
  }

  async function onMore() {
    trackShare(offerId);
    const url = shareUrl(offerId, 'other');
    try {
      await Share.share({ title: title || 'TapProve', message: `${shareText} ${url}`, url });
    } catch {
      /* user dismissed */
    }
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Share this deal</Text>
          <View style={styles.grid}>
            {PLATFORMS.map((p) => (
              <Pressable key={p.key} onPress={() => onPlatform(p)} style={styles.btn}>
                <Text style={styles.btnTxt}>{p.label}</Text>
              </Pressable>
            ))}
            <Pressable onPress={onCopyGeneric} style={styles.btn}>
              <Text style={styles.btnTxt}>Copy link</Text>
            </Pressable>
            <Pressable onPress={onMore} style={styles.btn}>
              <Text style={styles.btnTxt}>More…</Text>
            </Pressable>
          </View>
          <Pressable onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelTxt}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    paddingBottom: 32,
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  btn: {
    flexGrow: 1,
    flexBasis: '47%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnTxt: { fontSize: 15, fontWeight: '600', color: colors.text },
  cancel: { marginTop: 14, paddingVertical: 12, alignItems: 'center' },
  cancelTxt: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
});
