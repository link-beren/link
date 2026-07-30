import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { getAuth, signOut } from 'firebase/auth';
import { colors, radius, font } from '../theme';

export default function MentorPendingScreen({ mentorStatus, homeroomName }) {
  const rejected = mentorStatus === 'rejected';

  function handleSignOut() {
    Alert.alert('התנתקות', 'האם אתה בטוח?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'התנתק', style: 'destructive', onPress: () => signOut(getAuth()) },
    ]);
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.content}>
        <Text style={s.emoji}>{rejected ? '❌' : '⏳'}</Text>
        <Text style={s.title}>{rejected ? 'הבקשה נדחתה' : 'ממתין לאישור'}</Text>
        <Text style={s.desc}>
          {rejected
            ? `הבקשה שלך להצטרף לכיתה${homeroomName ? ` "${homeroomName}"` : ''} כמתנדב/ת נדחתה על ידי המורה. אפשר לפנות אליו/ה לבירור.`
            : `הבקשה שלך להצטרף לכיתה${homeroomName ? ` "${homeroomName}"` : ''} כמתנדב/ת ממתינה לאישור המורה. ברגע שתאושר תוכל/י להתחיל לפעול כמתנדב/ת.`}
        </Text>
        <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
          <Text style={s.signOutTxt}>התנתקות</Text>
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
