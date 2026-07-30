import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, TextInput, FlatList, Alert, ActivityIndicator,
} from 'react-native';
import {
  collection, query, where, orderBy, onSnapshot, doc, updateDoc, addDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { getAuth, signOut } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../firebase';
import { colors, radius, font } from '../theme';
import Avatar from '../components/Avatar';
import useRoleGuard from '../hooks/useRoleGuard';

function formatTime(ts) {
  if (!ts?.toDate) return '';
  return ts.toDate().toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function StaffPortalScreen({ navigation }) {
  const { authorized, profile } = useRoleGuard('staff');
  const [page, setPage] = useState('home');
  const [mentors, setMentors] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [hours, setHours] = useState(null);
  const [classes, setClasses] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [newClassName, setNewClassName] = useState('');
  const [creatingClass, setCreatingClass] = useState(false);
  const user = getAuth().currentUser;
  const schoolId = profile?.schoolId || '';

  // כל השאילתות מוגבלות לבית הספר של איש הצוות. המסננים אינם קוסמטיים:
  // Firestore דוחה שאילתה שלמה אם ולו מסמך אחד בתוצאה חורג מהחוקים, ולכן
  // בלי ה-where המתאים ההאזנה נופלת ב-permission-denied ומחזירה רשימה ריקה.
  // אין יותר רשימת תלמידים — תלמיד אינו משויך לבית ספר.
  useEffect(() => {
    if (!schoolId) return;
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'mentor'),
      where('schoolId', '==', schoolId)
    );
    const unsub = onSnapshot(q, snap => setMentors(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => setMentors([]));
    return unsub;
  }, [schoolId]);

  // Alerts belong to the student's own school. The server re-reads schoolId
  // from the student's user document, so this value is not client-supplied.
  useEffect(() => {
    if (!schoolId) return;
    const q = query(
      collection(db, 'distressAlerts'),
      where('schoolId', '==', schoolId),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => setAlerts(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => setAlerts([]));
    return unsub;
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId) return;
    const q = query(
      collection(db, 'mentoringHours'),
      where('schoolId', '==', schoolId),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => setHours(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => setHours([]));
    return unsub;
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId) return;
    const q = query(collection(db, 'classes'), where('schoolId', '==', schoolId), orderBy('name'));
    const unsub = onSnapshot(q, snap => setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => setClasses([]));
    return unsub;
  }, [schoolId]);

  // כל ה-hooks מעל — early returns רק מכאן והלאה
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

  if (!schoolId) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <Text style={s.logo}>לינק</Text>
          <Text style={s.headerTitle}>פורטל בית-ספר</Text>
          <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
            <Text style={s.signOutTxt}>התנתקות</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={s.emptyTxt}>
            החשבון שלך אינו משויך לבית ספר. פנה/י למנהל המערכת, או התחבר/י מחדש אם השיוך בוצע כרגע.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const openAlerts = (alerts || []).filter(a => a.status === 'open');
  // ההיקף נקבע ע"י בית הספר, לא ע"י בעלות על כיתה: איש צוות אחראי לכל
  // בית ספרו. myClassIds נשאר רק כדי לסמן "שלי" בממשק.
  const myClassIds = new Set((classes || []).filter(c => c.teacherUid === user?.uid).map(c => c.id));
  const pendingHours = (hours || []).filter(h => h.status === 'pending');
  const pendingMentors = (mentors || []).filter(m => m.mentorStatus === 'pending');
  const approvedMentors = (mentors || []).filter(m => m.mentorStatus === 'approved');

  function handleSignOut() {
    Alert.alert('התנתקות', 'האם אתה בטוח?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'התנתק', style: 'destructive', onPress: () => signOut(getAuth()) },
    ]);
  }

  async function resolveAlert(alertId) {
    try {
      await updateDoc(doc(db, 'distressAlerts', alertId), { status: 'resolved' });
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לעדכן את ההתראה כרגע');
    }
  }

  async function reviewHours(hoursId, status) {
    try {
      await updateDoc(doc(db, 'mentoringHours', hoursId), { status });
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לעדכן את הדיווח כרגע');
    }
  }

  async function createClass() {
    const name = newClassName.trim();
    if (!name) { Alert.alert('שגיאה', 'אנא הזן שם כיתה'); return; }
    setCreatingClass(true);
    try {
      await addDoc(collection(db, 'classes'), {
        name,
        // כיתה שייכת לבית ספר; בלי השדה הזה החוקים ידחו את היצירה
        schoolId,
        teacherUid: user?.uid,
        teacherName: user?.email?.split('@')[0] || 'צוות',
        createdAt: serverTimestamp(),
      });
      setNewClassName('');
    } catch {
      Alert.alert('שגיאה', 'לא ניתן ליצור כיתה כרגע');
    } finally {
      setCreatingClass(false);
    }
  }

  async function reviewMentor(mentorId, status) {
    try {
      await updateDoc(doc(db, 'users', mentorId), { mentorStatus: status });
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לעדכן את הבקשה כרגע');
    }
  }

  async function openChatWith(alert) {
    const studentUid = alert.uid || alert.studentUid || alert.userId;
    if (!studentUid) {
      Alert.alert('שגיאה', 'לא ניתן לזהות את התלמיד/ה עבור התראה זו');
      return;
    }
    const me = getAuth().currentUser;
    if (!me) return;

    // אותו מזהה שהפורטל בווב בונה (staff_<uid>_<uid>), אחרת אותה שיחה
    // מתפצלת לשני מסמכים — אחד במובייל ואחד בווב
    const chatId = `staff_${[me.uid, studentUid].sort().join('_')}`;
    const studentName = alert.nickname || 'תלמיד/ה';
    const myName = (await AsyncStorage.getItem('user_nickname')) || me.email?.split('@')[0] || 'צוות';
    const names = { [me.uid]: studentName, [studentUid]: myName };

    try {
      await setDoc(doc(db, 'chats', chatId), {
        participants: [me.uid, studentUid],
        staffUid: me.uid,
        studentUid,
        type: 'staff',
        isGroup: false,
        participantNames: names,
        chatNames: names,
        lastMessage: 'שיחת צוות נפתחה',
        lastSender: 'Link',
        lastMessageAt: serverTimestamp(),
      }, { merge: true });
    } catch {}

    navigation.navigate('Chat', {
      name: studentName,
      color: colors.purple,
      bg: colors.purpleSoft,
      isGroup: false,
      partnerUid: studentUid,
      chatId,
    });
  }

  const filteredMentors = (mentors || []).filter(m => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (m.nickname || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q);
  });

  const Header = () => (
    <View style={s.header}>
      <Text style={s.logo}>לינק</Text>
      <Text style={s.headerTitle}>
        {page === 'home' ? (profile?.schoolName || 'פורטל בית-ספר') : page === 'mentors' ? 'ניהול מתנדבים' : page === 'hours' ? 'אישור שעות' : page === 'classes' ? 'ניהול כיתות' : 'התראות מצוקה'}
      </Text>
      <TouchableOpacity style={s.profileBtn} onPress={() => navigation.navigate('Profile')}>
        <Text style={{ fontSize: 15 }}>👤</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
        <Text style={s.signOutTxt}>התנתקות</Text>
      </TouchableOpacity>
    </View>
  );

  const BottomNav = () => (
    <View style={s.bottomNav}>
      {[
        { id: 'home', ico: '🏠', label: 'בית' },
        { id: 'mentors', ico: '🤝', label: 'מתנדבים', badge: pendingMentors.length },
        { id: 'classes', ico: '📚', label: 'כיתות' },
        { id: 'hours', ico: '⏱', label: 'שעות', badge: pendingHours.length },
        { id: 'alerts', ico: '⚠️', label: 'התראות', badge: openAlerts.length },
      ].map(item => (
        <TouchableOpacity key={item.id} style={s.navItem} onPress={() => { setPage(item.id); if (item.id !== 'classes') setSelectedClassId(null); }}>
          <View>
            <Text style={s.navIco}>{item.ico}</Text>
            {!!item.badge && (
              <View style={s.navBadge}><Text style={s.navBadgeTxt}>{item.badge}</Text></View>
            )}
          </View>
          <Text style={[s.navLabel, page === item.id && { color: colors.purple }]}>{item.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const loading = mentors === null || alerts === null || hours === null || classes === null;

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <Header />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.purple} />
        </View>
      </SafeAreaView>
    );
  }

  // ── HOME ──
  if (page === 'home') return (
    <SafeAreaView style={s.safe}>
      <Header />
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.statsGrid}>
          <View style={[s.statCard, { borderTopColor: colors.green }]}>
            <Text style={s.statIcon}>🤝</Text>
            <Text style={[s.statValue, { color: colors.green }]}>{approvedMentors.length}</Text>
            <Text style={s.statLabel}>מתנדבים מאושרים</Text>
          </View>
          <View style={[s.statCard, { borderTopColor: colors.purple }]}>
            <Text style={s.statIcon}>📝</Text>
            <Text style={[s.statValue, { color: colors.purple }]}>{pendingMentors.length}</Text>
            <Text style={s.statLabel}>בקשות מתנדבים</Text>
          </View>
          <View style={[s.statCard, { borderTopColor: colors.red }]}>
            <Text style={s.statIcon}>🆘</Text>
            <Text style={[s.statValue, { color: colors.red }]}>{openAlerts.length}</Text>
            <Text style={s.statLabel}>התראות מצוקה פתוחות</Text>
          </View>
          <View style={[s.statCard, { borderTopColor: colors.primary }]}>
            <Text style={s.statIcon}>📚</Text>
            <Text style={[s.statValue, { color: colors.primary }]}>{classes.length}</Text>
            <Text style={s.statLabel}>כיתות בבית הספר</Text>
          </View>
          <View style={[s.statCard, { borderTopColor: colors.amber }]}>
            <Text style={s.statIcon}>⏱</Text>
            <Text style={[s.statValue, { color: colors.amber }]}>{pendingHours.length}</Text>
            <Text style={s.statLabel}>שעות ממתינות לאישור</Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>התראות מצוקה אחרונות</Text>
        {openAlerts.length === 0 && (
          <View style={s.emptyCard}><Text style={s.emptyTxt}>אין התראות פתוחות כרגע ✓</Text></View>
        )}
        {openAlerts.slice(0, 3).map(a => (
          <TouchableOpacity key={a.id} style={s.alertRow} onPress={() => setPage('alerts')}>
            <Text style={{ fontSize: 20 }}>🆘</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.alertName}>{a.nickname || 'משתמש/ת לא ידוע/ה'}</Text>
              <Text style={s.alertReason} numberOfLines={1}>{a.reasonText}</Text>
            </View>
            <Text style={s.alertTime}>{formatTime(a.createdAt)}</Text>
          </TouchableOpacity>
        ))}

        <View style={{ height: 20 }} />
      </ScrollView>
      <BottomNav />
    </SafeAreaView>
  );

  // ── MENTORS ──
  // הטאב הזה החליף את "תלמידים": תלמיד אינו משויך לבית ספר, ולכן לצוות
  // אין רשימת תלמידים משמעותית. הגישה לתלמיד היא דרך התראת מצוקה מנותבת.
  if (page === 'mentors') return (
    <SafeAreaView style={s.safe}>
      <Header />
      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          placeholder="חיפוש לפי כינוי או אימייל..."
          placeholderTextColor={colors.text3}
          value={search}
          onChangeText={setSearch}
          textAlign="left"
        />
      </View>
      <FlatList
        style={s.scroll}
        data={filteredMentors}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={<Text style={s.hint}>לא נמצאו מתנדבים</Text>}
        renderItem={({ item }) => (
          <View style={s.studentRow}>
            <Avatar uri={item.avatarUrl} name={item.nickname || item.email} color={colors.green} bg={colors.greenSoft} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={s.studentName}>{item.nickname || item.email}</Text>
              <Text style={s.studentSub}>{item.email}</Text>
              {!!item.homeroomName && <Text style={s.studentClass}>{item.homeroomName}</Text>}
            </View>
            {item.mentorStatus === 'pending' ? (
              <View style={s.alertActions}>
                <TouchableOpacity style={s.resolveBtn} onPress={() => reviewMentor(item.id, 'approved')}>
                  <Text style={s.resolveBtnTxt}>אשר</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.rejectBtn} onPress={() => reviewMentor(item.id, 'rejected')}>
                  <Text style={s.resolveBtnTxt}>דחה</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[s.statusBadge, item.mentorStatus === 'approved' ? s.statusBadgeResolved : s.statusBadgeOpen]}>
                <Text style={[s.statusBadgeTxt, { color: item.mentorStatus === 'approved' ? colors.green : colors.red }]}>
                  {item.mentorStatus === 'approved' ? 'מאושר' : 'נדחה'}
                </Text>
              </View>
            )}
          </View>
        )}
      />
      <BottomNav />
    </SafeAreaView>
  );

  // ── CLASSES ──
  if (page === 'classes') {
    const selectedClass = classes.find(c => c.id === selectedClassId);

    if (selectedClass) {
      const classMentors = mentors.filter(m => m.homeroomId === selectedClass.id);
      const classPendingMentors = classMentors.filter(m => m.mentorStatus === 'pending');
      const classApprovedMentors = classMentors.filter(m => m.mentorStatus === 'approved');
      // הכיתה שייכת לבית הספר, ולכן כל איש צוות בבית הספר יכול לאשר —
      // לא רק מי שיצר אותה. isOwner נשאר רק לתיוג "שלי" בממשק.
      const isOwner = selectedClass.teacherUid === user?.uid;

      return (
        <SafeAreaView style={s.safe}>
          <Header />
          <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
            <TouchableOpacity onPress={() => setSelectedClassId(null)}>
              <Text style={s.backLink}>← כל הכיתות</Text>
            </TouchableOpacity>
            <Text style={s.classDetailTitle}>{selectedClass.name}</Text>
            <Text style={s.classOwnerTxt}>נוצרה על ידי {selectedClass.teacherName || 'צוות'}</Text>

            <Text style={s.sectionTitle}>בקשות הצטרפות ממתינות ({classPendingMentors.length})</Text>
            {classPendingMentors.length === 0 && (
              <View style={s.emptyCard}><Text style={s.emptyTxt}>אין בקשות ממתינות</Text></View>
            )}
            {classPendingMentors.map(m => (
              <View key={m.id} style={s.hoursCard}>
                <Text style={s.alertName}>{m.nickname || m.email}</Text>
                <View style={s.alertActions}>
                  <TouchableOpacity style={s.resolveBtn} onPress={() => reviewMentor(m.id, 'approved')}>
                    <Text style={s.resolveBtnTxt}>אשר</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.rejectBtn} onPress={() => reviewMentor(m.id, 'rejected')}>
                    <Text style={s.resolveBtnTxt}>דחה</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <Text style={s.sectionTitle}>מתנדבים מאושרים ({classApprovedMentors.length})</Text>
            {classApprovedMentors.length === 0 && (
              <View style={s.emptyCard}><Text style={s.emptyTxt}>אין עדיין מתנדבים מאושרים</Text></View>
            )}
            {classApprovedMentors.map(m => (
              <View key={m.id} style={s.studentRow}>
                <Avatar uri={m.avatarUrl} name={m.nickname || m.email} color={colors.purple} bg={colors.purpleSoft} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={s.studentName}>{m.nickname || m.email}</Text>
                  <Text style={s.studentSub}>{m.email}</Text>
                </View>
              </View>
            ))}

            <View style={{ height: 20 }} />
          </ScrollView>
          <BottomNav />
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={s.safe}>
        <Header />
        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
          <Text style={s.sectionTitle}>כיתה חדשה</Text>
          <View style={s.newClassRow}>
            <TextInput
              style={[s.searchInput, { flex: 1 }]}
              placeholder="שם הכיתה..."
              placeholderTextColor={colors.text3}
              value={newClassName}
              onChangeText={setNewClassName}
              textAlign="left"
            />
            <TouchableOpacity style={s.addClassBtn} onPress={createClass} disabled={creatingClass}>
              {creatingClass ? <ActivityIndicator color="white" /> : <Text style={s.addClassBtnTxt}>הוסף</Text>}
            </TouchableOpacity>
          </View>

          <Text style={s.sectionTitle}>כל הכיתות ({classes.length})</Text>
          {classes.length === 0 && (
            <View style={s.emptyCard}><Text style={s.emptyTxt}>עדיין לא נוצרו כיתות</Text></View>
          )}
          {classes.map(c => {
            const classMentorCount = mentors.filter(m => m.homeroomId === c.id).length;
            const classPendingCount = mentors.filter(m => m.homeroomId === c.id && m.mentorStatus === 'pending').length;
            const mine = myClassIds.has(c.id);
            return (
              <TouchableOpacity key={c.id} style={s.studentRow} onPress={() => setSelectedClassId(c.id)}>
                <View style={s.studentAv}><Text style={s.studentAvTxt}>📚</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.studentName}>{c.name}{mine ? ' · שלי' : ''}</Text>
                  <Text style={s.studentSub}>{classMentorCount} מתנדבים · נוצרה על ידי {c.teacherName || 'צוות'}</Text>
                </View>
                {classPendingCount > 0 && (
                  <View style={s.classBadge}><Text style={s.classBadgeTxt}>{classPendingCount}</Text></View>
                )}
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 20 }} />
        </ScrollView>
        <BottomNav />
      </SafeAreaView>
    );
  }

  // ── HOURS ──
  if (page === 'hours') {
    // ההיקף כבר מוגבל לבית הספר בשאילתה עצמה (where schoolId), ולכן אין
    // סינון נוסף כאן. קודם סוננו שעות לפי בעלות על הכיתה, מה שהסתיר
    // דיווחים של מתנדבים מכיתות של עמיתים באותו בית ספר.
    const myHours = hours || [];
    return (
    <SafeAreaView style={s.safe}>
      <Header />
      <FlatList
        style={s.scroll}
        data={myHours}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 20, paddingTop: 10 }}
        ListEmptyComponent={<Text style={s.hint}>אין דיווחי שעות בבית הספר</Text>}
        renderItem={({ item }) => (
          <View style={s.hoursCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 22 }}>{item.type === 'auto' ? '📱' : '⏱'}</Text>
              <View style={{ flex: 1 }}>
                {item.type === 'auto'
                  ? <Text style={s.alertName}>{item.mentorName} · זמן אפליקציה</Text>
                  : <Text style={s.alertName}>{item.mentorName} ← {item.studentName}</Text>
                }
                <Text style={s.alertTime}>
                  {item.minutes} דקות
                  {item.date ? ` · ${item.date}` : ` · ${formatTime(item.createdAt)}`}
                </Text>
              </View>
              <View style={[s.statusBadge, item.status === 'approved' ? s.statusBadgeResolved : item.status === 'rejected' ? s.statusBadgeOpen : s.statusBadgePending]}>
                <Text style={[s.statusBadgeTxt, item.status === 'approved' ? { color: colors.green } : item.status === 'rejected' ? { color: colors.red } : { color: colors.amber }]}>
                  {item.status === 'approved' ? 'אושר' : item.status === 'rejected' ? 'נדחה' : 'ממתין'}
                </Text>
              </View>
            </View>
            {!!item.note && <Text style={s.alertReasonFull}>{item.note}</Text>}
            {item.status === 'pending' && (
              <View style={s.alertActions}>
                <TouchableOpacity style={s.resolveBtn} onPress={() => reviewHours(item.id, 'approved')}>
                  <Text style={s.resolveBtnTxt}>אשר</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.rejectBtn} onPress={() => reviewHours(item.id, 'rejected')}>
                  <Text style={s.resolveBtnTxt}>דחה</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      />
      <BottomNav />
    </SafeAreaView>
    );
  }

  // ── ALERTS ──
  return (
    <SafeAreaView style={s.safe}>
      <Header />
      <FlatList
        style={s.scroll}
        data={alerts}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 20, paddingTop: 10 }}
        ListEmptyComponent={<Text style={s.hint}>אין התראות מצוקה</Text>}
        renderItem={({ item }) => (
          <View style={[s.alertCard, item.status === 'resolved' && s.alertCardResolved]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 22 }}>{item.status === 'resolved' ? '✅' : '🆘'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.alertName}>{item.nickname || 'משתמש/ת לא ידוע/ה'}</Text>
                <Text style={s.alertTime}>{formatTime(item.createdAt)}</Text>
              </View>
              <View style={[s.statusBadge, item.status === 'resolved' ? s.statusBadgeResolved : s.statusBadgeOpen]}>
                <Text style={[s.statusBadgeTxt, item.status === 'resolved' ? { color: colors.green } : { color: colors.red }]}>
                  {item.status === 'resolved' ? 'טופל' : 'פתוח'}
                </Text>
              </View>
            </View>
            <Text style={s.alertReasonFull}>{item.reasonText}</Text>
            <View style={s.alertActions}>
              <TouchableOpacity style={s.chatBtn} onPress={() => void openChatWith(item)}>
                <Text style={s.chatBtnTxt}>💬 פתח שיחה</Text>
              </TouchableOpacity>
              {item.status !== 'resolved' && (
                <TouchableOpacity style={s.resolveBtn} onPress={() => resolveAlert(item.id)}>
                  <Text style={s.resolveBtnTxt}>סמן כטופל</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      />
      <BottomNav />
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

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  statCard: { width: '47.5%', backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, borderTopWidth: 3, borderWidth: 1, borderColor: colors.border },
  statIcon: { fontSize: 22, marginBottom: 6 },
  statValue: { fontSize: 24, fontWeight: font.black, marginBottom: 2 },
  statLabel: { fontSize: 11, color: colors.text3, fontWeight: font.semi },

  sectionTitle: { fontSize: 10, fontWeight: font.black, color: colors.text3, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 },

  emptyCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  emptyTxt: { color: colors.text2, fontSize: 13, fontWeight: font.semi },

  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.redSoft, borderRadius: radius.lg, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' },
  alertName: { fontSize: 13, fontWeight: font.bold, color: colors.text },
  alertReason: { fontSize: 12, color: colors.text2, marginTop: 2 },
  alertTime: { fontSize: 11, color: colors.text3 },

  searchWrap: { padding: 14, paddingBottom: 0 },
  searchInput: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, fontSize: 14, color: colors.text },

  studentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  studentAv: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.purpleSoft, alignItems: 'center', justifyContent: 'center' },
  studentAvTxt: { fontSize: 16, fontWeight: font.black, color: colors.purple },
  studentName: { fontSize: 14, fontWeight: font.bold, color: colors.text },
  studentSub: { fontSize: 11, color: colors.text3, marginTop: 2 },
  studentClass: { fontSize: 10, color: colors.purple, fontWeight: font.bold, marginTop: 2 },

  backLink: { fontSize: 13, fontWeight: font.bold, color: colors.purple, marginBottom: 12 },
  classDetailTitle: { fontSize: 20, fontWeight: font.black, color: colors.text, marginBottom: 4 },
  classOwnerTxt: { fontSize: 12, color: colors.text3, fontWeight: font.semi, marginBottom: 16 },
  newClassRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  addClassBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  addClassBtnTxt: { fontSize: 13, fontWeight: font.black, color: 'white' },
  classBadge: { backgroundColor: colors.red, borderRadius: 99, minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  classBadgeTxt: { fontSize: 11, fontWeight: '900', color: 'white' },

  alertCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, marginHorizontal: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' },
  alertCardResolved: { borderColor: colors.border, opacity: 0.7 },
  alertReasonFull: { fontSize: 13, color: colors.text2, marginTop: 10, lineHeight: 19 },
  statusBadge: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeOpen: { backgroundColor: colors.redSoft },
  statusBadgeResolved: { backgroundColor: colors.greenSoft },
  statusBadgePending: { backgroundColor: colors.amberSoft },
  statusBadgeTxt: { fontSize: 11, fontWeight: font.black },
  alertActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  chatBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.full, padding: 10, alignItems: 'center' },
  chatBtnTxt: { color: 'white', fontSize: 13, fontWeight: font.black },
  resolveBtn: { flex: 1, backgroundColor: colors.green, borderRadius: radius.full, padding: 10, alignItems: 'center' },
  resolveBtnTxt: { color: 'white', fontSize: 13, fontWeight: font.black },
  rejectBtn: { flex: 1, backgroundColor: colors.red, borderRadius: radius.full, padding: 10, alignItems: 'center' },

  hoursCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, marginHorizontal: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },

  hint: { fontSize: 12, color: colors.text2, fontWeight: font.semi, textAlign: 'center', marginTop: 20 },

  bottomNav: { flexDirection: 'row', backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border, height: 60 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  navIco: { fontSize: 20 },
  navBadge: { position: 'absolute', top: -4, left: -8, backgroundColor: colors.red, borderRadius: 99, minWidth: 15, height: 15, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  navBadgeTxt: { fontSize: 9, fontWeight: '900', color: 'white' },
  navLabel: { fontSize: 10, fontWeight: font.bold, color: colors.text3 },
});
