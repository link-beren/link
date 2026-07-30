import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { collection, query, where, orderBy, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { joinGroup, leaveGroup, createGroup } from '../groups';
import { colors, radius, font } from '../theme';
import useRoleGuard from '../hooks/useRoleGuard';

const filters = [
  { key: 'all', label: 'הכל' },
  { key: 'gaming', label: '🎮 גיימינג' },
  { key: 'sports', label: '⚽ ספורט' },
  { key: 'art', label: '🎨 אמנות' },
  { key: 'literature', label: '📚 ספרות' },
  { key: 'science', label: '🔬 מדע' },
];

const categoryStyle = {
  gaming: { icon: '🎮', color: colors.primary },
  sports: { icon: '⚽', color: colors.green },
  art: { icon: '🎨', color: colors.purple },
  literature: { icon: '📚', color: colors.amber },
  science: { icon: '🔬', color: colors.purple },
};

function withOpacity(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function DiscoverScreen() {
  // profile carries schoolId, so this reuses the listener useRoleGuard
  // already holds instead of opening a second one on the same document.
  const { authorized, profile } = useRoleGuard(['student', 'mentor']);
  const [activeFilter, setActiveFilter] = useState('all');
  const [groups, setGroups] = useState(null);
  const [myGroupIds, setMyGroupIds] = useState([]);
  const [nickname, setNickname] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const auth = getAuth();
  const user = auth.currentUser;
  const schoolId = profile ? profile.schoolId || null : undefined;

  // All hooks stay above every early return.
  //
  // Groups belong to a school. A shared national group would put students from
  // two districts in one chat, which is exactly what the isolation model
  // exists to prevent, so the filter is mandatory rather than a nicety.
  useEffect(() => {
    if (schoolId === undefined) return;
    if (!schoolId) {
      setGroups([]);
      return;
    }
    const q = query(
      collection(db, 'groups'),
      where('schoolId', '==', schoolId),
      orderBy('name')
    );
    const unsub = onSnapshot(q, snap => setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => setGroups([]));
    return unsub;
  }, [schoolId]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), snap => {
      setMyGroupIds(snap.data()?.joinedGroupIds || []);
      setNickname(snap.data()?.nickname || '');
    });
    return unsub;
  }, [user]);

  // early returns — אחרי כל ה-hooks
  if (authorized === null) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!authorized) return null;

  const myName = () => nickname || user?.email?.split('@')[0] || 'משתמש';

  async function toggleJoin(g) {
    try {
      if (myGroupIds.includes(g.id)) {
        await leaveGroup(g.id, user.uid);
      } else {
        await joinGroup(g.id, user.uid, myName());
      }
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לעדכן את החברות בקבוצה כרגע');
    }
  }

  async function handleCreateGroup() {
    const name = newName.trim();
    if (!name) { Alert.alert('שגיאה', 'אנא הזן שם קבוצה'); return; }
    if (!newCategory) { Alert.alert('שגיאה', 'אנא בחר/י קטגוריה'); return; }
    setSubmitting(true);
    try {
      const style = categoryStyle[newCategory];
      await createGroup({
        name,
        description: newDesc.trim(),
        category: newCategory,
        icon: style.icon,
        accentColor: style.color,
        uid: user.uid,
        nickname: myName(),
        schoolId,
      });
      setNewName('');
      setNewDesc('');
      setNewCategory(null);
      setCreating(false);
    } catch {
      Alert.alert('שגיאה', 'לא ניתן ליצור את הקבוצה כרגע');
    } finally {
      setSubmitting(false);
    }
  }

  const filteredGroups = (groups || []).filter(g => activeFilter === 'all' || g.category === activeFilter);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.logo}>לינק</Text>
        <Text style={s.title}>גלה קבוצות</Text>
        <TouchableOpacity style={s.createBtn} onPress={() => setCreating(p => !p)}>
          <Text style={s.createBtnTxt}>{creating ? 'ביטול' : '+ קבוצה'}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.hero}>
          <View style={{ flex: 1 }}>
            <Text style={s.heroTitle}>מצא את הקהילה שלך 🚀</Text>
            <Text style={s.heroSub}>קבוצות אמיתיות לפי תחום עניין</Text>
          </View>
          <Text style={{ fontSize: 44 }}>🌟</Text>
        </View>

        {creating && (
          <View style={s.formCard}>
            <Text style={s.sectionTitle}>קבוצה חדשה</Text>
            <TextInput style={s.input} placeholder="שם הקבוצה" placeholderTextColor={colors.text3} value={newName} onChangeText={setNewName} textAlign="right" />
            <TextInput style={s.textarea} placeholder="תיאור קצר (לא חובה)" placeholderTextColor={colors.text3} value={newDesc} onChangeText={setNewDesc} multiline textAlign="right" />
            <View style={s.categoryRow}>
              {filters.slice(1).map(f => (
                <TouchableOpacity key={f.key} style={[s.chip, newCategory === f.key && s.chipActive]} onPress={() => setNewCategory(f.key)}>
                  <Text style={[s.chipTxt, newCategory === f.key && { color: 'white' }]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={s.submitBtn} onPress={handleCreateGroup} disabled={submitting}>
              {submitting ? <ActivityIndicator color="white" /> : <Text style={s.submitBtnTxt}>צור קבוצה</Text>}
            </TouchableOpacity>
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
          {filters.map(f => (
            <TouchableOpacity key={f.key} style={[s.chip, activeFilter === f.key && s.chipActive]} onPress={() => setActiveFilter(f.key)}>
              <Text style={[s.chipTxt, activeFilter === f.key && { color: 'white' }]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={s.sectionTitle}>🔥 קבוצות</Text>
        {groups === null && <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />}
        {groups !== null && filteredGroups.length === 0 && (
          <Text style={s.hint}>אין עדיין קבוצות כאן — היה/י הראשונ/ה ליצור אחת!</Text>
        )}
        <View style={s.grid}>
          {filteredGroups.map(g => {
            const joined = myGroupIds.includes(g.id);
            return (
              <View key={g.id} style={s.card}>
                <View style={[s.cardHead, { backgroundColor: withOpacity(g.accentColor || colors.primary, 0.15) }]}>
                  <Text style={{ fontSize: 28 }}>{g.icon || '📚'}</Text>
                </View>
                <View style={s.cardBody}>
                  <Text style={s.cardName}>{g.name}</Text>
                  {!!g.description && <Text style={s.cardDesc}>{g.description}</Text>}
                  <View style={s.cardFoot}>
                    <Text style={s.memberTxt}>● {(g.memberCount || 0).toLocaleString()}</Text>
                    <TouchableOpacity style={[s.joinBtn, joined && s.joinBtnActive]} onPress={() => toggleJoin(g)}>
                      <Text style={[s.joinTxt, joined && { color: colors.green }]}>{joined ? '✓ מצטרף' : 'הצטרף'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, height: 58, backgroundColor: colors.card, borderBottomWidth: 2, borderBottomColor: colors.primary },
  logo: { fontSize: 22, fontWeight: font.black, color: colors.primary, letterSpacing: -1 },
  title: { fontSize: 14, fontWeight: font.semi, color: colors.text3, flex: 1 },
  createBtn: { backgroundColor: colors.primarySoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary },
  createBtnTxt: { fontSize: 12, fontWeight: font.black, color: colors.primary },
  scroll: { flex: 1, padding: 16 },
  hero: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.sm, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  heroTitle: { fontSize: 16, fontWeight: font.black, color: colors.text, marginBottom: 5 },
  heroSub: { fontSize: 12, color: colors.text2 },
  formCard: { backgroundColor: colors.card, borderRadius: radius.sm, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border, gap: 12 },
  input: { backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14, color: colors.text },
  textarea: { backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 12, fontSize: 13, color: colors.text, minHeight: 70, textAlignVertical: 'top' },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  submitBtn: { backgroundColor: colors.primary, borderRadius: radius.full, padding: 13, alignItems: 'center' },
  submitBtnTxt: { color: 'white', fontSize: 14, fontWeight: font.black, letterSpacing: 0.5 },
  chip: { backgroundColor: colors.card2, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 7, marginLeft: 8, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTxt: { fontSize: 12, fontWeight: font.semi, color: colors.text2 },
  sectionTitle: { fontSize: 10, fontWeight: font.black, color: colors.primary, marginBottom: 14, letterSpacing: 2, textTransform: 'uppercase' },
  hint: { fontSize: 12, color: colors.text2, fontWeight: font.semi, textAlign: 'center', marginTop: 20, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { width: '47.5%', backgroundColor: colors.card, borderRadius: radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  cardHead: { height: 52, alignItems: 'center', justifyContent: 'center' },
  cardBody: { padding: 10 },
  cardName: { fontSize: 13, fontWeight: font.black, color: colors.text, marginBottom: 3 },
  cardDesc: { fontSize: 11, color: colors.text3, marginBottom: 8, lineHeight: 15 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  memberTxt: { fontSize: 10, fontWeight: font.bold, color: colors.green },
  joinBtn: { backgroundColor: colors.primarySoft, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  joinBtnActive: { backgroundColor: colors.greenSoft },
  joinTxt: { fontSize: 11, fontWeight: font.black, color: colors.primary },
});
