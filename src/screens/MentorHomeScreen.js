import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, TextInput, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { getAuth, signOut } from 'firebase/auth';
import {
  collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDocs,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../firebase';
import { colors, radius, font } from '../theme';
import useRoleGuard from '../hooks/useRoleGuard';
import { getActiveSessionStart } from '../utils/sessionTracker';

function timeAgo(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return 'עכשיו';
  if (diff < 3600) return `${Math.floor(diff / 60)} דק׳`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ש׳`;
  return `${Math.floor(diff / 86400)} ימים`;
}

function formatDate(ts) {
  if (!ts?.toDate) return '';
  return ts.toDate().toLocaleDateString('he-IL');
}

export default function MentorHomeScreen({ navigation }) {
  const { authorized, profile } = useRoleGuard('mentor');
  const [page, setPage] = useState('home');
  const [students, setStudents] = useState(null);
  const [hours, setHours] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [homeroomName, setHomeroomName] = useState(null);
  const [todayMins, setTodayMins] = useState(0);
  const auth = getAuth();
  const user = auth.currentUser;
  const tickRef = useRef(null);

  // כל ה-hooks מעל לכל early return
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), d => setHomeroomName(d.data()?.homeroomName || null), () => {});
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid),
      where('type', '==', 'mentoring'),
      orderBy('lastMessageAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => setStudents([]));
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'mentoringHours'),
      where('mentorUid', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => setHours(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => setHours([]));
    return unsub;
  }, [user]);

  // מונה "זמן היום" — מחבר סשנים שהסתיימו + הסשן הפעיל
  useEffect(() => {
    if (!user) return;
    const today = new Date().toISOString().slice(0, 10);

    async function refreshToday() {
      try {
        const snap = await getDocs(query(
          collection(db, 'mentorSessions'),
          where('uid', '==', user.uid),
          where('date', '==', today),
        ));
        let completed = 0;
        snap.forEach(d => { completed += d.data().minutes || 0; });
        const activeStart = getActiveSessionStart();
        const live = activeStart ? Math.floor((Date.now() - activeStart) / 60000) : 0;
        setTodayMins(completed + live);
      } catch {}
    }

    refreshToday();
    tickRef.current = setInterval(refreshToday, 60000);
    return () => clearInterval(tickRef.current);
  }, [user]);

  // early returns — אחרי כל ה-hooks
  if (authorized === null) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }
  if (!authorized) return null;

  // מחלץ את שם התלמיד מ-participantNames (סכימה החדשה)
  function studentName(chat) {
    return chat.participantNames?.[user.uid] || 'תלמיד/ה';
  }

  // מחלץ את UID התלמיד מרשימת המשתתפים
  function getPartnerUid(chat) {
    return (chat.participants || []).find(uid => uid !== user.uid) || null;
  }

  function handleSignOut() {
    Alert.alert('התנתקות', 'האם אתה בטוח?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'התנתק', style: 'destructive', onPress: () => signOut(auth) },
    ]);
  }

  function openChat(chat) {
    navigation.navigate('Chat', {
      name: studentName(chat),
      color: colors.primary,
      bg: colors.primarySoft,
      isGroup: false,
      partnerUid: getPartnerUid(chat),
      // מזהה מסמך השיחה עצמו — שיחות ליווי הן mentoring_<uid>_<uid>
      chatId: chat.id,
    });
  }

  function startLogHours(chat) {
    setSelectedStudent(chat ? { uid: getPartnerUid(chat), name: studentName(chat) } : null);
    setMinutes('');
    setNote('');
    setPage('log');
  }

  async function submitHours() {
    const mins = parseInt(minutes, 10);
    if (!selectedStudent) { Alert.alert('שגיאה', 'בחר/י תלמיד/ה'); return; }
    if (!mins || mins <= 0) { Alert.alert('שגיאה', 'הכנס/י מספר דקות תקין'); return; }
    // בלי schoolId החוקים דוחים את היצירה, והצוות לא היה מוצא את הדיווח
    if (!profile?.schoolId) {
      Alert.alert('שגיאה', 'החשבון שלך אינו משויך לבית ספר. פנה/י לרכזת.');
      return;
    }
    setSubmitting(true);
    try {
      const mentorNickname = await AsyncStorage.getItem('user_nickname');
      await addDoc(collection(db, 'mentoringHours'), {
        mentorUid: user.uid,
        mentorName: mentorNickname || user.email?.split('@')[0] || 'מתנדב/ת',
        schoolId: profile.schoolId,
        homeroomId: profile.homeroomId || null,
        homeroomName: profile.homeroomName || null,
        studentUid: selectedStudent.uid,
        studentName: selectedStudent.name,
        minutes: mins,
        note: note.trim(),
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      Alert.alert('✓', 'השעות נשלחו לאישור הרכזת');
      setPage('hours');
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לשמור את השעות כרגע');
    } finally {
      setSubmitting(false);
    }
  }

  const approvedMinutes = (hours || []).filter(h => h.status === 'approved').reduce((sum, h) => sum + (h.minutes || 0), 0);
  const pendingMinutes = (hours || []).filter(h => h.status === 'pending').reduce((sum, h) => sum + (h.minutes || 0), 0);

  const Header = () => (
    <View style={s.header}>
      <Text style={s.logo}>לינק</Text>
      <Text style={s.headerTitle}>
        {page === 'home' ? 'בית' : page === 'hours' ? 'שעות' : 'רישום שעות'}
      </Text>
      <TouchableOpacity style={s.profileBtn} onPress={() => navigation.navigate('Profile')}>
        <Text style={{ fontSize: 15 }}>👤</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
        <Text style={s.signOutTxt}>התנתקות</Text>
      </TouchableOpacity>
    </View>
  );

  const BackToHome = () => (
    <TouchableOpacity style={s.backBtn} onPress={() => setPage('home')}>
      <Text style={s.backBtnTxt}>← חזרה לבית</Text>
    </TouchableOpacity>
  );

  const loading = students === null || hours === null;

  // ── HOME ──
  if (page === 'home') return (
    <SafeAreaView style={s.safe}>
      <Header />
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
          {!!homeroomName && <Text style={s.classPill}>🏫 כיתה: {homeroomName}</Text>}
          <View style={s.statsGrid}>
            <View style={[s.statCard, { borderTopColor: colors.primary }]}>
              <Text style={s.statIcon}>⏱</Text>
              <Text style={[s.statValue, { color: colors.primary }]}>{(approvedMinutes / 60).toFixed(1)}</Text>
              <Text style={s.statLabel}>שעות מאושרות</Text>
            </View>
            <View style={[s.statCard, { borderTopColor: colors.amber }]}>
              <Text style={s.statIcon}>⌛</Text>
              <Text style={[s.statValue, { color: colors.amber }]}>{(pendingMinutes / 60).toFixed(1)}</Text>
              <Text style={s.statLabel}>שעות ממתינות</Text>
            </View>
            <View style={[s.statCard, { borderTopColor: colors.green }]}>
              <Text style={s.statIcon}>📱</Text>
              <Text style={[s.statValue, { color: colors.green }]}>{todayMins}</Text>
              <Text style={s.statLabel}>דקות היום</Text>
            </View>
            <View style={[s.statCard, { borderTopColor: colors.purple }]}>
              <Text style={s.statIcon}>👥</Text>
              <Text style={[s.statValue, { color: colors.purple }]}>{students.length}</Text>
              <Text style={s.statLabel}>תלמידים פעילים</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            <TouchableOpacity style={[s.logBtn, { flex: 1, marginBottom: 0 }]} onPress={() => startLogHours(students[0] || null)}>
              <Text style={s.logBtnTxt}>+ רשום שעה</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.logBtn, { flex: 1, marginBottom: 0, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.primary }]} onPress={() => setPage('hours')}>
              <Text style={[s.logBtnTxt, { color: colors.primary }]}>⏱ שעות</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.sectionTitle}>התלמידים שלי</Text>
          {students.length === 0 && <Text style={s.hint}>עדיין אין לך שיחות מעורבות חברתית פעילות</Text>}
          {students.map(chat => (
            <TouchableOpacity key={chat.id} style={s.studentRow} onPress={() => openChat(chat)}>
              <View style={s.studentAv}><Text style={s.studentAvTxt}>{studentName(chat)[0]}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.studentName}>{studentName(chat)}</Text>
                <Text style={s.studentSub} numberOfLines={1}>{chat.lastMessage || 'אין הודעות עדיין'}</Text>
              </View>
              <Text style={s.timeAgo}>{timeAgo(chat.lastMessageAt)}</Text>
            </TouchableOpacity>
          ))}
          <View style={{ height: 20 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );

  // ── HOURS ──
  if (page === 'hours') return (
    <SafeAreaView style={s.safe}>
      <Header />
      <ScrollView style={s.scroll}>
        <BackToHome />
        <View style={s.hoursRing}>
          <Text style={s.hoursValue}>{(approvedMinutes / 60).toFixed(1)}</Text>
          <Text style={s.hoursLabel}>שעות מאושרות · {(pendingMinutes / 60).toFixed(1)} ממתינות</Text>
        </View>
        <TouchableOpacity style={s.logBtn} onPress={() => startLogHours(students?.[0] || null)}>
          <Text style={s.logBtnTxt}>+ רשום שעה חדשה</Text>
        </TouchableOpacity>
        <Text style={s.sectionTitle}>היסטוריית דיווחים</Text>
        {(hours || []).length === 0 && <Text style={s.hint}>עדיין לא דיווחת שעות</Text>}
        {(hours || []).map(h => (
          <View key={h.id} style={s.histRow}>
            <Text style={{ fontSize: 20 }}>{h.type === 'auto' ? '📱' : '📅'}</Text>
            <View style={{ flex: 1 }}>
              {h.type === 'auto'
                ? <Text style={{ fontSize: 13, fontWeight: font.bold, color: colors.text }}>זמן אפליקציה — {h.date || formatDate(h.createdAt)}</Text>
                : <Text style={{ fontSize: 13, fontWeight: font.bold, color: colors.text }}>{h.studentName}</Text>
              }
              <Text style={{ fontSize: 11, color: colors.text3 }}>{formatDate(h.createdAt)} • {h.minutes} דקות</Text>
              {!!h.note && <Text style={{ fontSize: 11, color: colors.text2, marginTop: 3 }}>{h.note}</Text>}
            </View>
            <View style={[s.statusBadge, h.status === 'approved' ? s.statusApproved : h.status === 'rejected' ? s.statusRejected : s.statusPending]}>
              <Text style={[s.statusTxt, h.status === 'approved' ? { color: colors.green } : h.status === 'rejected' ? { color: colors.red } : { color: colors.amber }]}>
                {h.status === 'approved' ? 'אושר' : h.status === 'rejected' ? 'נדחה' : 'ממתין'}
              </Text>
            </View>
          </View>
        ))}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );

  // ── LOG HOURS ──
  return (
    <SafeAreaView style={s.safe}>
      <Header />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
        <ScrollView style={s.scroll} contentContainerStyle={{ gap: 14, paddingBottom: 30 }}>
          <BackToHome />
          <Text style={s.sectionTitle}>תלמיד/ה</Text>
          <View style={{ gap: 8 }}>
            {(students || []).map(chat => {
              const isSelected = selectedStudent?.uid === getPartnerUid(chat);
              return (
                <TouchableOpacity
                  key={chat.id}
                  style={[s.pickRow, isSelected && s.pickRowActive]}
                  onPress={() => setSelectedStudent({ uid: chat.partnerUid, name: studentName(chat) })}
                >
                  <Text style={[s.pickTxt, isSelected && { color: 'white' }]}>{studentName(chat)}</Text>
                </TouchableOpacity>
              );
            })}
            {(students || []).length === 0 && <Text style={s.hint}>אין עדיין תלמיד/ה לשייך את השעה אליו/ה</Text>}
          </View>

          <Text style={s.sectionTitle}>משך השיחה (בדקות)</Text>
          <TextInput style={s.input} value={minutes} onChangeText={setMinutes} keyboardType="number-pad" placeholder="לדוגמה: 40" placeholderTextColor={colors.text3} textAlign="left" />

          <Text style={s.sectionTitle}>רפלקציה (לא חובה)</Text>
          <TextInput style={s.textarea} value={note} onChangeText={setNote} multiline placeholder="איך הייתה השיחה? מה עבד טוב?" placeholderTextColor={colors.text3} textAlign="left" />

          <TouchableOpacity style={s.submitBtn} onPress={submitHours} disabled={submitting}>
            {submitting ? <ActivityIndicator color="white" /> : <Text style={s.submitBtnTxt}>שלח לאישור הרכזת</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, padding: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, height: 56, backgroundColor: colors.card, borderBottomWidth: 2, borderBottomColor: colors.primary },
  logo: { fontSize: 18, fontWeight: font.black, color: colors.primary },
  headerTitle: { fontSize: 13, fontWeight: font.bold, color: colors.text, flex: 1 },
  profileBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, marginLeft: 8 },
  signOutBtn: { backgroundColor: colors.red, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 },
  signOutTxt: { fontSize: 11, fontWeight: font.black, color: 'white' },

  classPill: { fontSize: 12, fontWeight: font.bold, color: colors.text2, marginBottom: 12, textAlign: 'left' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  statCard: { width: '47.5%', backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, borderTopWidth: 3, borderWidth: 1, borderColor: colors.border },
  statIcon: { fontSize: 22, marginBottom: 6 },
  statValue: { fontSize: 24, fontWeight: font.black, marginBottom: 2 },
  statLabel: { fontSize: 11, color: colors.text3, fontWeight: font.semi },

  logBtn: { backgroundColor: colors.primary, borderRadius: radius.full, padding: 14, alignItems: 'center', marginBottom: 16 },
  logBtnTxt: { color: 'white', fontSize: 14, fontWeight: font.black },

  sectionTitle: { fontSize: 10, fontWeight: font.black, color: colors.text3, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 },
  hint: { fontSize: 12, color: colors.text2, fontWeight: font.semi, textAlign: 'center', marginVertical: 10 },

  studentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  studentAv: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  studentAvTxt: { fontSize: 16, fontWeight: font.black, color: colors.primary },
  studentName: { fontSize: 14, fontWeight: font.bold, color: colors.text },
  studentSub: { fontSize: 11, color: colors.text3, marginTop: 2 },
  timeAgo: { fontSize: 10, color: colors.text3, fontWeight: font.bold },

  hoursRing: { backgroundColor: colors.card, borderRadius: radius.xl, padding: 24, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  hoursValue: { fontSize: 48, fontWeight: font.black, color: colors.primary },
  hoursLabel: { fontSize: 13, color: colors.text2, marginTop: 4 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, marginBottom: 8 },
  statusBadge: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  statusApproved: { backgroundColor: colors.greenSoft },
  statusRejected: { backgroundColor: colors.redSoft },
  statusPending: { backgroundColor: colors.amberSoft },
  statusTxt: { fontSize: 11, fontWeight: font.black },

  pickRow: { backgroundColor: colors.card, borderRadius: radius.md, padding: 14, borderWidth: 1.5, borderColor: colors.border },
  pickRowActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pickTxt: { fontSize: 14, fontWeight: font.bold, color: colors.text, textAlign: 'left' },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, fontSize: 14, color: colors.text },
  textarea: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, fontSize: 13, color: colors.text, minHeight: 90, textAlignVertical: 'top' },
  submitBtn: { backgroundColor: colors.green, borderRadius: radius.full, padding: 15, alignItems: 'center' },
  submitBtnTxt: { color: 'white', fontSize: 15, fontWeight: font.black },

  backBtn: { paddingVertical: 8, marginBottom: 8 },
  backBtnTxt: { fontSize: 13, fontWeight: font.bold, color: colors.primary },
});
