import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { getAuth, signOut } from 'firebase/auth';
import { colors, radius, font } from '../theme';

export default function MentorPendingScreen({ mentorStatus, homeroomName }) {
  const rejected = mentorStatus === 'rejected';

  function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut(getAuth()) },
    ]);
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.content}>
        <Text style={s.emoji}>{rejected ? '❌' : '⏳'}</Text>
        <Text style={s.title}>{rejected ? 'Application declined' : 'Waiting for approval'}</Text>
        <Text style={s.desc}>
          {rejected
            ? `Your request to join the homeroom${homeroomName ? ` "${homeroomName}"` : ''} as a peer mentor was declined by your teacher. You can reach out to them to find out more.`
            : `Your request to join the homeroom${homeroomName ? ` "${homeroomName}"` : ''} as a peer mentor is waiting for your teacher's approval. As soon as it is approved you can start mentoring.`}
        </Text>
        <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
          <Text style={s.signOutTxt}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emoji: { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: font.black, color: colors.text, marginBottom: 10, textAlign: 'center' },
  desc: { fontSize: 14, color: colors.text2, textAlign: 'center', lineHeight: 21, marginBottom: 28 },
  signOutBtn: { backgroundColor: colors.red, borderRadius: radius.full, paddingHorizontal: 24, paddingVertical: 12 },
  signOutTxt: { fontSize: 14, fontWeight: font.black, color: 'white' },
});
