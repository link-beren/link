import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  SafeAreaView, Alert, TextInput, ActivityIndicator,
} from 'react-native';
import { getAuth, signOut } from 'firebase/auth';
import {
  collection, query, where, getDocs, onSnapshot,
  orderBy, doc, setDoc, serverTimestamp, documentId,
} from 'firebase/firestore';
import { db } from '../firebase';
import { colors, radius, font } from '../theme';
import Avatar from '../components/Avatar';
import useMySchoolId from '../hooks/useMySchoolId';

// ─── helpers ────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return 'עכשיו';
  if (diff < 3600) return `${Math.floor(diff / 60)} דק׳`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ש׳`;
  return `${Math.floor(diff / 86400)} ימ׳`;
}

// מחזיר את שם הצד השני מתוך participantNames
function getPartnerName(chat, myUid) {
  const names = chat.participantNames || {};
  return names[myUid] || '?';
}

// מחזיר את ה-UID של הצד השני
function getPartnerUid(chat, myUid) {
  const others = (chat.participants || []).filter(uid => uid !== myUid);
  return others[0] || null;
}

// ────────────────────────────────────────────────────────────────────────────

export default function ConversationsScreen({ navigation }) {
  const auth = getAuth();
  const user = auth.currentUser;
  const schoolId = useMySchoolId();

  const [dmChats, setDmChats] = useState([]);
  const [myGroups, setMyGroups] = useState([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // ── DM שיחות אחרונות ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid),
      where('type', '==', 'dm'),
      orderBy('lastMessageAt', 'desc')
    );
    const unsub = onSnapshot(q,
      snap => setDmChats(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => setDmChats([])
    );
    return unsub;
  }, [user]);

  // ── קבוצות שהמשתמש חבר בהן ─────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), async snap => {
      const ids = (snap.data()?.joinedGroupIds || []).slice(0, 30);
      if (ids.length === 0) { setMyGroups([]); return; }
      try {
        const q = query(collection(db, 'groups'), where(documentId(), 'in', ids));
        const groupsSnap = await getDocs(q);
        setMyGroups(groupsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch {
        setMyGroups([]);
      }
    }, () => setMyGroups([]));
    return unsub;
  }, [user]);

  // ── User search ─────────────────────────────────────────────────────────
  async function handleSearch(text) {
    setSearch(text);
    // The school filter is not a nicety. The rules refuse to return a user
    // from another school, and Firestore fails a query as a whole if any
    // single result is unreadable, so without it this search errors out
    // rather than over-reaching.
    if (!schoolId || text.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const q = query(
        collection(db, 'users'),
        where('schoolId', '==', schoolId),
        where('nickname', '>=', text),
        where('nickname', '<=', text + '')
      );
      const snap = await getDocs(q);
      setSearchResults(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(u => u.id !== user.uid)
      );
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setSearch('');
    setSearchResults([]);
  }

  // ── פתיחת DM מהרשימה ────────────────────────────────────────────────────
  function openDmChat(chat) {
    const partnerName = getPartnerName(chat, user.uid);
    const partnerUid = getPartnerUid(chat, user.uid);
    if (!partnerUid) return;
    navigation.navigate('Chat', {
      name: partnerName,
      color: colors.primary,
      bg: colors.primarySoft,
      isGroup: false,
      partnerUid,
      // שיחה קיימת — נפתח בדיוק את המסמך שברשימה (גם ליווי וגם צוות),
      // ולא מזהה DM שנבנה מחדש
      chatId: chat.id,
    });
  }

  // ── פתיחת DM חדש מתוצאות חיפוש ─────────────────────────────────────────
  function openNewDm(targetUser) {
    clearSearch();
    navigation.navigate('Chat', {
      name: targetUser.nickname,
      color: colors.primary,
      bg: colors.primarySoft,
      isGroup: false,
      partnerUid: targetUser.id,
    });
  }

  // ── שליחת בקשת חברות ────────────────────────────────────────────────────
  async function sendFriendRequest(toUser) {
    try {
      await setDoc(doc(db, 'friendRequests', `${user.uid}_${toUser.id}`), {
        fromUid: user.uid,
        toUid: toUser.id,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      Alert.alert('🎉', `בקשת חברות נשלחה ל${toUser.nickname}!`);
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לשלוח בקשה');
    }
  }

  function handleSignOut() {
    Alert.alert('התנתקות', 'האם אתה בטוח?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'התנתק', style: 'destructive', onPress: () => signOut(auth).catch(() => {}) },
    ]);
  }

  // ── רינדור שיחת DM ──────────────────────────────────────────────────────
  function renderDmChat({ item }) {
    const partnerName = getPartnerName(item, user.uid);
    const initial = partnerName[0] || '?';
    return (
      <TouchableOpacity style={s.row} onPress={() => openDmChat(item)}>
        <View style={[s.av, { backgroundColor: colors.primarySoft }]}>
          <Text style={[s.avTxt, { color: colors.primary }]}>{initial}</Text>
        </View>
        <View style={s.rowInfo}>
          <Text style={s.rowName}>{partnerName}</Text>
          <Text style={s.rowPreview} numberOfLines={1}>
            {item.lastSender ? `${item.lastSender}: ${item.lastMessage}` : item.lastMessage || ''}
          </Text>
        </View>
        <Text style={s.timeAgo}>{timeAgo(item.lastMessageAt)}</Text>
      </TouchableOpacity>
    );
  }

  // ── רינדור קבוצה ────────────────────────────────────────────────────────
  function renderGroup({ item }) {
    return (
      <TouchableOpacity
        style={s.row}
        onPress={() => navigation.navigate('Chat', {
          name: item.name,
          color: item.accentColor,
          bg: 'transparent',
          isGroup: true,
          groupId: item.id,
        })}
      >
        <View style={[s.accent, { backgroundColor: item.accentColor }]} />
        <View style={s.rowInfo}>
          <Text style={s.rowName}>{item.name}</Text>
          <Text style={s.rowPreview}>{item.memberCount || 0} פעילים</Text>
        </View>
      </TouchableOpacity>
    );
  }

  // ── ממשק ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>

      {/* Header */}
      <View style={s.header}>
        <Text style={s.logo}>לינק</Text>
        <Text style={s.subtitle}>שיחות</Text>
        <View style={s.headerRight}>
          <TouchableOpacity style={s.mentoringBtn} onPress={() => navigation.navigate('Mentoring')}>
            <Text style={s.mentoringTxt}>🤝 מתנדבים</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.profileBtn} onPress={() => navigation.navigate('Profile')}>
            <Text style={{ fontSize: 16 }}>👤</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
            <Text style={s.signOutTxt}>התנתקות</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* חיפוש */}
      <View style={s.searchWrap}>
        <View style={s.searchBox}>
          <Text style={s.searchIco}>🔍</Text>
          <TextInput
            style={s.searchInput}
            placeholder="חפש לפי כינוי..."
            placeholderTextColor={colors.text3}
            value={search}
            onChangeText={handleSearch}
            textAlign="left"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={clearSearch}>
              <Text style={s.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* תוצאות חיפוש */}
      {search.length >= 2 && (
        <View style={s.resultsWrap}>
          {searching && <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />}
          {!searching && searchResults.length === 0 && (
            <Text style={s.hint}>לא נמצאו משתמשים</Text>
          )}
          {searchResults.map(u => (
            <View key={u.id} style={s.resultRow}>
              <Avatar uri={u.avatarUrl} name={u.nickname} color={colors.primary} bg={colors.primarySoft} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={s.resultName}>{u.nickname}</Text>
                <Text style={s.resultRole}>
                  {u.role === 'student' ? '🎒 תלמיד/ה' : '🤝 מתנדב/ת'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => openNewDm(u)} style={s.chatBtn}>
                <Text style={s.chatBtnTxt}>💬</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.addFriendBtn} onPress={() => sendFriendRequest(u)}>
                <Text style={s.addFriendTxt}>+ חבר/ה</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* רשימת שיחות + קבוצות */}
      <FlatList
        style={s.list}
        data={[
          ...(dmChats.length > 0 ? [{ _type: 'header', _label: 'שיחות פרטיות' }] : []),
          ...dmChats.map(c => ({ _type: 'dm', ...c })),
          { _type: 'header', _label: 'קבוצות' },
          ...myGroups.map(g => ({ _type: 'group', ...g })),
        ]}
        keyExtractor={(item, i) => item.id || `header_${i}`}
        renderItem={({ item }) => {
          if (item._type === 'header') {
            return <Text style={s.sectionTitle}>{item._label}</Text>;
          }
          if (item._type === 'dm') return renderDmChat({ item });
          if (item._type === 'group') return renderGroup({ item });
          return null;
        }}
        ListEmptyComponent={
          <Text style={s.hint}>אין עדיין שיחות — חפש/י חבר/ה למעלה כדי להתחיל</Text>
        }
        ListFooterComponent={
          myGroups.length === 0
            ? <Text style={s.hint}>עדיין לא הצטרפת לקבוצות — עבור/י ל"גלה"</Text>
            : <View style={{ height: 20 }} />
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, height: 58,
    backgroundColor: colors.card,
    borderBottomWidth: 2, borderBottomColor: colors.primary,
  },
  logo: { fontSize: 22, fontWeight: font.black, color: colors.primary, letterSpacing: -1 },
  subtitle: { fontSize: 13, fontWeight: font.semi, color: colors.text3 },
  headerRight: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 },
  mentoringBtn: { backgroundColor: colors.greenSoft, paddingHorizontal: 11, paddingVertical: 6, borderRadius: radius.sm },
  mentoringTxt: { fontSize: 11, fontWeight: font.bold, color: colors.green },
  profileBtn: { width: 30, height: 30, borderRadius: radius.sm, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  signOutBtn: { backgroundColor: colors.redSoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.red },
  signOutTxt: { fontSize: 11, fontWeight: font.bold, color: colors.red },

  searchWrap: { backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card2, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border },
  searchIco: { fontSize: 14 },
  searchInput: { flex: 1, color: colors.text, fontSize: 14 },
  searchClear: { fontSize: 12, color: colors.text3, paddingHorizontal: 4 },

  resultsWrap: { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 14, paddingVertical: 6 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  resultName: { fontSize: 14, fontWeight: font.bold, color: colors.text },
  resultRole: { fontSize: 11, color: colors.text3, marginTop: 2 },
  chatBtn: { paddingHorizontal: 8 },
  chatBtnTxt: { fontSize: 20 },
  addFriendBtn: { backgroundColor: colors.primarySoft, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6 },
  addFriendTxt: { fontSize: 11, fontWeight: font.bold, color: colors.primary },

  hint: { fontSize: 13, color: colors.text3, textAlign: 'center', padding: 16 },

  list: { flex: 1, paddingHorizontal: 16 },
  sectionTitle: {
    fontSize: 10, fontWeight: font.black, color: colors.primary,
    letterSpacing: 2, textTransform: 'uppercase',
    marginTop: 20, marginBottom: 4,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  av: { width: 42, height: 42, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  avTxt: { fontSize: 16, fontWeight: font.black },
  accent: { width: 3, height: 36 },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 14, fontWeight: font.bold, color: colors.text, marginBottom: 3 },
  rowPreview: { fontSize: 12, color: colors.text3 },
  timeAgo: { fontSize: 10, color: colors.text3, fontWeight: font.bold },
});
