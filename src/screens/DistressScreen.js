import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { collection, addDoc, serverTimestamp, getDocs, query, where, updateDoc, doc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../firebase';
import { colors, radius, font } from '../theme';

const options = [
  { id: 1, icon: '👊', text: "I'm worried a fight is about to happen" },
  { id: 2, icon: '🫥', text: "I think people are leaving me out on purpose" },
  { id: 3, icon: '📱', text: 'Someone is sending me threatening messages online' },
  { id: 4, icon: '🆘', text: "I'm in real physical danger — I need help now" },
];

export default function DistressScreen({ navigation }) {
  const [selected, setSelected] = useState(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  async function send() {
    if (!selected || sending) return;
    setSending(true);
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      const nickname = await AsyncStorage.getItem('user_nickname');
      const opt = options.find(o => o.id === selected);
      await addDoc(collection(db, 'distressAlerts'), {
        uid: user?.uid || null,
        nickname: nickname || user?.email || 'Unknown',
        reasonId: opt.id,
        reasonText: opt.text,
        status: 'open',
        createdAt: serverTimestamp(),
      });

      // Open admin access to all of this user's chats
      if (user?.uid) {
        const chatsSnap = await getDocs(
          query(collection(db, 'chats'), where('participants', 'array-contains', user.uid))
        );
        await Promise.all(
          chatsSnap.docs.map(d => updateDoc(doc(db, 'chats', d.id), {
            helpRequested: true,
            helpRequestedAt: serverTimestamp(),
            helpRequestedBy: user.uid,
          }))
        );
      }

      setSent(true);
    } catch (e) {
      Alert.alert('Something went wrong', 'We could not send your alert. Please try again, or call or text 988 (Suicide & Crisis Lifeline).');
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.sentWrap}>
          <Text style={s.sentIcon}>✅</Text>
          <Text style={s.sentTitle}>Your alert was sent!</Text>
          <Text style={s.sentMsg}>
            Your school staff got your message and will reach out to you soon.{'\n'}You are not alone.
          </Text>
          <View style={s.badges}>
            <View style={s.badge}><Text style={s.badgeTxt}>🔔 School staff notified</Text></View>
            <View style={s.badge}><Text style={s.badgeTxt}>🤝 Peer mentors available now</Text></View>
            <View style={s.badge}><Text style={s.badgeTxt}>📞 You can call or text 988</Text></View>
          </View>
          <TouchableOpacity style={s.closeBtn} onPress={() => { setSent(false); setSelected(null); navigation?.goBack?.(); }}>
            <Text style={s.closeBtnTxt}>Close</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.headerIcon}>🆘</Text>
        <View>
          <Text style={s.headerTitle}>Get help now</Text>
          <Text style={s.headerSub}>We're here for you — always</Text>
        </View>
        {navigation?.canGoBack?.() && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.xBtn}>
            <Text style={s.xTxt}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={s.body} contentContainerStyle={{ gap: 10 }}>
        <Text style={s.info}>
          Tapping this sends an immediate alert to your school staff.{'\n'}Someone will reach out to you within minutes.
        </Text>

        {options.map(opt => (
          <TouchableOpacity
            key={opt.id}
            style={[s.opt, selected === opt.id && s.optSel]}
            onPress={() => setSelected(opt.id)}
          >
            <Text style={s.optIcon}>{opt.icon}</Text>
            <Text style={[s.optTxt, selected === opt.id && s.optTxtSel]}>{opt.text}</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[s.sendBtn, (!selected || sending) && s.sendBtnDisabled]}
          onPress={send}
          disabled={!selected || sending}
        >
          {sending
            ? <ActivityIndicator color="white" />
            : <Text style={s.sendBtnTxt}>Send help request</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={s.cancelBtn} onPress={() => navigation?.goBack?.()}>
          <Text style={s.cancelTxt}>Cancel — I'm okay</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 20, backgroundColor: colors.red,
  },
  headerIcon: { fontSize: 30 },
  headerTitle: { fontSize: 18, fontWeight: font.black, color: 'white' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  xBtn: { marginLeft: 'auto', padding: 6 },
  xTxt: { fontSize: 18, color: 'rgba(255,255,255,0.7)' },

  body: { flex: 1, padding: 18 },
  info: { fontSize: 13, color: colors.text2, lineHeight: 20, marginBottom: 6 },

  opt: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, padding: 14, marginBottom: 8,
  },
  optSel: { backgroundColor: colors.redSoft, borderColor: colors.red },
  optIcon: { fontSize: 22 },
  optTxt: { flex: 1, fontSize: 13, fontWeight: font.bold, color: colors.text2, textAlign: 'left' },
  optTxtSel: { color: colors.red },

  sendBtn: {
    backgroundColor: colors.red, borderRadius: radius.full,
    padding: 14, alignItems: 'center', marginTop: 6,
  },
  sendBtnDisabled: { opacity: 0.45 },
  sendBtnTxt: { color: 'white', fontSize: 15, fontWeight: font.black, letterSpacing: 0.5 },

  cancelBtn: {
    backgroundColor: 'transparent', borderRadius: radius.full,
    padding: 13, alignItems: 'center', marginBottom: 20,
    borderWidth: 1, borderColor: colors.border,
  },
  cancelTxt: { color: colors.text3, fontSize: 13, fontWeight: font.semi },

  // Sent state
  sentWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  sentIcon: { fontSize: 56, marginBottom: 14 },
  sentTitle: { fontSize: 20, fontWeight: font.black, color: colors.red, marginBottom: 10 },
  sentMsg: { fontSize: 14, color: colors.text2, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  badges: { width: '100%', gap: 8, marginBottom: 24 },
  badge: {
    backgroundColor: colors.greenSoft, borderRadius: radius.md,
    padding: 12, alignItems: 'center',
  },
  badgeTxt: { fontSize: 13, fontWeight: font.bold, color: colors.green },
  closeBtn: {
    backgroundColor: colors.primary, borderRadius: 99,
    paddingHorizontal: 40, paddingVertical: 13, width: '100%', alignItems: 'center',
  },
  closeBtnTxt: { color: 'white', fontSize: 15, fontWeight: font.black },
});