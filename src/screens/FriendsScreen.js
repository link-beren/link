import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Alert, ActivityIndicator,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { collection, doc, updateDoc, onSnapshot, query, where, arrayUnion, arrayRemove, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { colors, radius, font } from '../theme';
import Avatar from '../components/Avatar';

export default function FriendsScreen({ navigation }) {
  const [tab, setTab] = useState('requests');
  const [requests, setRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const auth = getAuth();
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;
    const reqQuery = query(collection(db, 'friendRequests'), where('toUid', '==', user.uid), where('status', '==', 'pending'));
    const unsubReq = onSnapshot(reqQuery, async snap => {
      const reqs = await Promise.all(snap.docs.map(async d => {
        const data = d.data();
        try {
          const userDoc = await getDoc(doc(db, 'users', data.fromUid));
          return { id: d.id, ...data, senderNickname: userDoc.data()?.nickname || 'משתמש', senderAvatarUrl: userDoc.data()?.avatarUrl };
        } catch {
          return { id: d.id, ...data, senderNickname: 'משתמש' };
        }
      }));
      setRequests(reqs);
      setLoading(false);
    }, () => { setRequests([]); setLoading(false); });

    const unsubFriends = onSnapshot(doc(db, 'users', user.uid), async snap => {
      const friendUids = snap.data()?.friends || [];
      if (friendUids.length === 0) { setFriends([]); return; }
      const friendDocs = await Promise.all(friendUids.map(uid => getDoc(doc(db, 'users', uid))));
      setFriends(friendDocs.filter(d => d.exists()).map(d => ({ id: d.id, ...d.data() })));
    }, () => setFriends([]));

    return () => { unsubReq(); unsubFriends(); };
  }, [user]);

  async function acceptRequest(req) {
    try {
      await updateDoc(doc(db, 'friendRequests', req.id), { status: 'accepted' });
      await updateDoc(doc(db, 'users', user.uid), { friends: arrayUnion(req.fromUid) });
      await updateDoc(doc(db, 'users', req.fromUid), { friends: arrayUnion(user.uid) });
      Alert.alert('🎉', `${req.senderNickname} הוסף/ה לחברים!`);
    } catch { Alert.alert('שגיאה', 'לא ניתן לאשר בקשה'); }
  }

  async function declineRequest(req) {
    try { await updateDoc(doc(db, 'friendRequests', req.id), { status: 'declined' }); } catch {}
  }

  async function removeFriend(friendUid) {
    Alert.alert('הסר חבר', 'האם אתה בטוח?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'הסר', style: 'destructive', onPress: async () => {
        try {
          await updateDoc(doc(db, 'users', user.uid), { friends: arrayRemove(friendUid) });
          await updateDoc(doc(db, 'users', friendUid), { friends: arrayRemove(user.uid) });
        } catch {}
      }},
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}><Text style={s.logo}>לינק</Text><Text style={s.title}>❤️ חברים</Text></View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.logo}>לינק</Text>
        <Text style={s.title}>❤️ חברים</Text>
      </View>
      <View style={s.tabs}>
        <TouchableOpacity style={[s.tab, tab === 'requests' && s.tabActive]} onPress={() => setTab('requests')}>
          <Text style={[s.tabTxt, tab === 'requests' && s.tabTxtActive]}>
            בקשות {requests.length > 0 && <Text style={s.tabBadge}>({requests.length})</Text>}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, tab === 'all' && s.tabActive]} onPress={() => setTab('all')}>
          <Text style={[s.tabTxt, tab === 'all' && s.tabTxtActive]}>החברים שלי ({friends.length})</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={s.scroll} contentContainerStyle={{ gap: 10, paddingBottom: 20 }}>
        {tab === 'requests' && (
          requests.length === 0
            ? <View style={s.empty}><Text style={s.emptyTxt}>אין בקשות ממתינות 🎉</Text></View>
            : requests.map(req => (
              <View key={req.id} style={s.card}>
                <Avatar uri={req.senderAvatarUrl} name={req.senderNickname} size={46} />
                <View style={s.info}>
                  <Text style={s.name}>{req.senderNickname}</Text>
                  <Text style={s.sub}>שלח/ה לך בקשת חברות</Text>
                </View>
                <View style={s.actions}>
                  <TouchableOpacity style={s.acceptBtn} onPress={() => acceptRequest(req)}>
                    <Text style={s.acceptTxt}>✓ אשר</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.declineBtn} onPress={() => declineRequest(req)}>
                    <Text style={s.declineTxt}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
        )}
        {tab === 'all' && (
          friends.length === 0
            ? <View style={s.empty}><Text style={s.emptyTxt}>אין חברים עדיין 🔍</Text></View>
            : friends.map(f => (
              <View key={f.id} style={s.card}>
                <Avatar uri={f.avatarUrl} name={f.nickname} color={colors.primary} bg={colors.primarySoft} size={46} />
                <View style={s.info}>
                  <Text style={s.name}>{f.nickname}</Text>
                  <Text style={s.sub}>{f.role === 'student' ? '🎒 תלמיד/ה' : '🤝 מתנדב/ת'}</Text>
                </View>
                <View style={s.actions}>
                  <TouchableOpacity style={s.declineBtn} onPress={() => navigation.navigate('Chat', { name: f.nickname, avatar: f.nickname?.[0], color: colors.primary, bg: colors.primarySoft, partnerUid: f.id })}>
                    <Text style={{ fontSize: 18 }}>💬</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.declineBtn} onPress={() => removeFriend(f.id)}>
                    <Text style={s.declineTxt}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, height: 58, backgroundColor: colors.card, borderBottomWidth: 2, borderBottomColor: colors.primary },
  logo: { fontSize: 22, fontWeight: font.black, color: colors.primary, letterSpacing: -1 },
  title: { fontSize: 14, fontWeight: font.semi, color: colors.text3 },
  tabs: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.primary },
  tabTxt: { fontSize: 12, fontWeight: font.bold, color: colors.text3, letterSpacing: 0.5 },
  tabTxtActive: { color: colors.primary },
  tabBadge: { color: colors.red, fontWeight: font.black },
  scroll: { flex: 1, paddingHorizontal: 16, paddingTop: 4 },
  empty: { alignItems: 'center', padding: 40 },
  emptyTxt: { fontSize: 14, color: colors.text3, fontWeight: font.semi, textAlign: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: radius.sm, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: font.bold, color: colors.text },
  sub: { fontSize: 11, color: colors.text3, marginTop: 3 },
  actions: { flexDirection: 'row', gap: 8 },
  acceptBtn: { backgroundColor: colors.green, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 8 },
  acceptTxt: { color: 'white', fontSize: 12, fontWeight: font.black },
  declineBtn: { backgroundColor: 'transparent', borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  declineTxt: { color: colors.text3, fontSize: 12, fontWeight: font.semi },
});