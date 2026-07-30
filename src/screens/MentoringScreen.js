import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, ActivityIndicator,
} from 'react-native';
import { collection, query, where, orderBy, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../firebase';
import { colors, radius, font } from '../theme';
import Avatar from '../components/Avatar';
import useMySchoolId from '../hooks/useMySchoolId';

// מזהה שיחת ליווי — חייב להיות זהה לזה שהווב בונה (VolunteersPage), אחרת
// אותה זוגיות תלמיד-מתנדב מקבלת שני מסמכי שיחה שונים בכל פלטפורמה.
function buildMentoringChatId(uidA, uidB) {
  return `mentoring_${[uidA, uidB].sort().join('_')}`;
}

function timeAgo(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return 'עכשיו';
  if (diff < 3600) return `${Math.floor(diff / 60)} דק׳`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ש׳`;
  return `${Math.floor(diff / 86400)} ימים`;
}

export default function MentoringScreen({ navigation }) {
  const [tab, setTab] = useState('select');
  const [mentors, setMentors] = useState(null);
  const [history, setHistory] = useState(null);
  const auth = getAuth();
  const user = auth.currentUser;
  const schoolId = useMySchoolId();

  // Peer mentors are students at the same school, so the list is school-scoped.
  // Without the schoolId filter the rules reject the whole query and the tab
  // renders empty rather than over-broad.
  useEffect(() => {
    if (schoolId === undefined) return;
    if (!schoolId) {
      setMentors([]);
      return;
    }
    const q = query(
      collection(db, 'users'),
      where('schoolId', '==', schoolId),
      where('role', '==', 'mentor'),
      where('mentorStatus', '==', 'approved')
    );
    const unsub = onSnapshot(q, snap => setMentors(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => setMentors([]));
    return unsub;
  }, [schoolId]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid),
      where('type', '==', 'mentoring'),
      orderBy('lastMessageAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => setHistory([]));
    return unsub;
  }, [user]);

  function getChatName(chat) {
    const names = chat.participantNames || {};
    return names[user.uid] || 'מתנדב/ת';
  }

  function getPartnerUid(chat) {
    const others = (chat.participants || []).filter(uid => uid !== user.uid);
    return others[0] || null;
  }

  function openChat({ name, partnerUid, chatId }) {
    navigation.navigate('Chat', {
      name,
      color: colors.green,
      bg: colors.greenSoft,
      isGroup: false,
      partnerUid,
      chatId,
    });
  }

  // פתיחת ליווי חדש מתוך רשימת המתנדבים — יוצרת את מסמך השיחה עם הסיווג
  // והמטא-דאטה (studentUid/mentorUid), בדיוק כמו VolunteersPage בווב.
  async function openMentoring(mentor) {
    if (!user) return;
    const mentorName = mentor.nickname || mentor.email || 'מתנדב/ת';
    const chatId = buildMentoringChatId(user.uid, mentor.id);
    const myNickname = (await AsyncStorage.getItem('user_nickname')) || user.email?.split('@')[0] || 'תלמיד/ה';
    const names = { [user.uid]: mentorName, [mentor.id]: myNickname };

    try {
      await setDoc(doc(db, 'chats', chatId), {
        participants: [user.uid, mentor.id],
        studentUid: user.uid,
        mentorUid: mentor.id,
        type: 'mentoring',
        isGroup: false,
        participantNames: names,
        chatNames: names,
        lastMessage: 'שיחת ליווי נפתחה',
        lastSender: 'Link',
        lastMessageAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      }, { merge: true });
    } catch {}

    openChat({ name: mentorName, partnerUid: mentor.id, chatId });
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.logo}>לינק</Text>
        <Text style={s.title}>🤝 מעורבות חברתית</Text>
      </View>

      <View style={s.tabs}>
        <TouchableOpacity style={[s.tab, tab === 'select' && s.tabActive]} onPress={() => setTab('select')}>
          <Text style={[s.tabTxt, tab === 'select' && s.tabTxtActive]}>מתנדבים</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, tab === 'history' && s.tabActive]} onPress={() => setTab('history')}>
          <Text style={[s.tabTxt, tab === 'history' && s.tabTxtActive]}>השיחות שלי</Text>
        </TouchableOpacity>
      </View>

      {/* SELECT */}
      {tab === 'select' && (
        <ScrollView style={s.scroll} contentContainerStyle={{ gap: 10, paddingBottom: 20 }}>
          <Text style={s.hint}>בחר/י מתנדב/ת לשיחה</Text>
          {mentors === null && <ActivityIndicator color={colors.green} style={{ marginTop: 20 }} />}
          {mentors !== null && mentors.length === 0 && (
            <Text style={s.hint}>אין כרגע מתנדבים זמינים</Text>
          )}
          {(mentors || []).map(m => {
            const name = m.nickname || m.email;
            return (
              <TouchableOpacity key={m.id} style={s.volCard} onPress={() => void openMentoring(m)}>
                <Avatar uri={m.avatarUrl} name={name} color={colors.green} bg={colors.greenSoft} size={46} />
                <View style={s.volInfo}>
                  <Text style={s.volName}>{name}</Text>
                  <Text style={s.volGrade}>🤝 מתנדב/ת</Text>
                </View>
                <Text style={{ fontSize: 20, color: colors.green }}>💬</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* HISTORY */}
      {tab === 'history' && (
        <ScrollView style={s.scroll} contentContainerStyle={{ gap: 10, paddingBottom: 20 }}>
          {history === null && <ActivityIndicator color={colors.green} style={{ marginTop: 20 }} />}
          {history !== null && history.length === 0 && (
            <Text style={s.hint}>עדיין אין שיחות מעורבות חברתית</Text>
          )}
          {(history || []).map(chat => {
            const name = getChatName(chat);
            return (
              <TouchableOpacity key={chat.id} style={s.histCard} onPress={() => openChat({ name, partnerUid: getPartnerUid(chat), chatId: chat.id })}>
                <View style={s.histTop}>
                  <View style={[s.histAv, { backgroundColor: colors.greenSoft }]}>
                    <Text style={[s.volAvTxt, { color: colors.green }]}>{(name || '?')[0]}</Text>
                  </View>
                  <View style={s.histInfo}>
                    <Text style={s.volName}>{name}</Text>
                    <Text style={s.volGrade}>{timeAgo(chat.lastMessageAt)}</Text>
                  </View>
                </View>
                <Text style={s.preview} numberOfLines={1}>{chat.lastSender}: {chat.lastMessage}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, height: 56, backgroundColor: colors.card, borderBottomWidth: 2, borderBottomColor: colors.primary },
  logo: { fontSize: 20, fontWeight: font.black, color: colors.primary },
  title: { fontSize: 14, fontWeight: font.bold, color: colors.text },
  tabs: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.green },
  tabTxt: { fontSize: 12, fontWeight: font.bold, color: colors.text3 },
  tabTxtActive: { color: colors.green },
  scroll: { flex: 1, padding: 12 },
  hint: { fontSize: 12, color: colors.text2, fontWeight: font.semi, marginBottom: 4, textAlign: 'center', marginTop: 10 },
  volCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, borderWidth: 1.5, borderColor: colors.border },
  volAvTxt: { fontSize: 18, fontWeight: font.black },
  volInfo: { flex: 1 },
  volName: { fontSize: 14, fontWeight: font.bold, color: colors.text },
  volGrade: { fontSize: 11, color: colors.text3, marginTop: 2 },
  histCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 8 },
  histTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  histAv: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  histInfo: { flex: 1 },
  preview: { fontSize: 12, color: colors.text2, paddingRight: 10, borderRightWidth: 3, borderRightColor: colors.border },
});
