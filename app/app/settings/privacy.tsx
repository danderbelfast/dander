/**
 * settings/privacy.tsx — change display preference + birthday sharing.
 * Mirrors the onboarding card UI but lets the user flip back and forth.
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getDisplayPreference, setDisplayPreference, DisplayPreference } from '../../src/api/users';

export default function PrivacySettings() {
  const [pref, setPref] = useState<DisplayPreference | null>(null);
  const [birthday, setBirthday] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDisplayPreference().then((s) => {
      if (s) {
        setPref(s.display_preference);
        setBirthday(s.birthday_sharing);
      }
      setLoading(false);
    });
  }, []);

  async function choose(next: DisplayPreference) {
    setPref(next);
    await setDisplayPreference(next, birthday);
  }

  async function toggleBirthday(v: boolean) {
    setBirthday(v);
    if (pref) await setDisplayPreference(pref, v);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.center}><ActivityIndicator color="#FF6B35" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.title}>Recognition Preference</Text>

        <Row
          selected={pref === 'personalised'}
          onPress={() => choose('personalised')}
          title="Personalised"
          body="Show my name in store"
        />
        <Row
          selected={pref === 'anonymous'}
          onPress={() => choose('anonymous')}
          title="Anonymous"
          body="Check in privately"
        />

        {pref === 'personalised' && (
          <View style={styles.birthdayRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.birthdayTitle}>Birthday Recognition</Text>
              <Text style={styles.birthdayBody}>Allow birthday surprises</Text>
            </View>
            <Switch value={birthday} onValueChange={toggleBirthday} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  selected, onPress, title, body,
}: { selected: boolean; onPress: () => void; title: string; body: string }) {
  return (
    <View
      style={[
        styles.row,
        selected && { borderColor: '#FF6B35', backgroundColor: '#1A1F29' },
      ]}
      onTouchEnd={onPress}
    >
      <View style={[styles.radio, selected && styles.radioOn]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:     { flex: 1, backgroundColor: '#0F1115' },
  center:   { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title:    { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 14 },
  row: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderRadius: 10, borderWidth: 1, borderColor: '#222', marginBottom: 10,
    backgroundColor: '#11141B', gap: 12,
  },
  radio: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#666',
  },
  radioOn: { backgroundColor: '#FF6B35', borderColor: '#FF6B35' },
  rowTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  rowBody:  { color: '#9AA4B1', fontSize: 13, marginTop: 2 },
  birthdayRow: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderRadius: 10, backgroundColor: '#11141B', marginTop: 8,
  },
  birthdayTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  birthdayBody:  { color: '#9AA4B1', fontSize: 13, marginTop: 2 },
});
