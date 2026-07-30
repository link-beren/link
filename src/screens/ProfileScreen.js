import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  SafeAreaView, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, storage } from '../firebase';
import Avatar from '../components/Avatar';
import { colors, radius, font } from '../theme';

const roleLabels = { student: '🎒 תלמיד/ה', mentor: '🤝 מתנדב/ת', staff: '🏫 צוות בית ספר', admin: '🛡️ מנהל/ת מערכת' };

export default function ProfileScreen({ navigation }) {
  const user = getAuth().currentUser;
  const [profile, setProfile] = useState(null);
  const [nickname, setNickname] = useState('');
  const [savingNickname, setSavingNickname] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), snap => {
      const data = snap.data();
      setProfile(data);
      setNickname(data?.nickname || '');
    }, () => {});
    return unsub;
  }, [user]);

  async function saveNickname() {
    const trimmed = nickname.trim();
    if (!trimmed) { Alert.alert('שגיאה', 'אנא הכנס/י כינוי'); return; }
    setSavingNickname(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { nickname: trimmed });
      await AsyncStorage.setItem('user_nickname', trimmed);
      Alert.alert('✓', 'הכינוי עודכן');
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לעדכן את הכינוי כרגע');
    } finally {
      setSavingNickname(false);
    }
  }

  async function pickAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('אין הרשאה', 'צריך לאשר גישה לתמונות כדי להחליף תמונת פרופיל');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (result.canceled) return;

    setUploadingAvatar(true);
    try {
      const response = await fetch(result.assets[0].uri);
      const blob = await response.blob();
      const avatarRef = ref(storage, `avatars/${user.uid}`);
      await uploadBytes(avatarRef, blob);
      const url = await getDownloadURL(avatarRef);
      await updateDoc(doc(db, 'users', user.uid), { avatarUrl: url });
    } catch {
      Alert.alert('שגיאה', 'לא ניתן להעלות את התמונה כרגע');
    } finally {
      setUploadingAvatar(false);
    }
  }

  if (!profile) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Text style={s.backArrow}>→</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>הפרופיל שלי</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backArrow}>→</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>הפרופיל שלי</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ alignItems: 'center', paddingVertical: 24 }}>
        <TouchableOpacity onPress={pickAvatar} disabled={uploadingAvatar} style={s.avatarWrap}>
          <Avatar uri={profile.avatarUrl} name={nickname} color={colors.primary} bg={colors.primarySoft} size={100} />
          <View style={s.avatarBadge}>
            {uploadingAvatar ? <ActivityIndicator size="small" color="white" /> : <Text style={s.avatarBadgeTxt}>✏️</Text>}
          </View>
        </TouchableOpacity>
        <Text style={s.hint}>הקש/י על התמונה כדי להחליף</Text>

        {!!profile.role && <Text style={s.rolePill}>{roleLabels[profile.role] || profile.role}</Text>}
        {!!profile.className && <Text style={s.classTxt}>🏫 {profile.className}</Text>}

        <View style={s.card}>
          <Text style={s.fieldLabel}>כינוי</Text>
          <TextInput
            style={s.input}
            value={nickname}
            onChangeText={setNickname}
            placeholder="כינוי"
            placeholderTextColor={colors.text3}
            textAlign="right"
            maxLength={20}
          />
          <Text style={s.charCount}>{nickname.length}/20</Text>

          <TouchableOpacity style={s.saveBtn} onPress={saveNickname} disabled={savingNickname}>
            {savingNickname ? <ActivityIndicator color="white" /> : <Text style={s.saveBtnTxt}>שמור</Text>}
          </TouchableOpacity>
        </View>

        <Text style={s.emailTxt}>{profile.email}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 58, backgroundColor: colors.card, borderBottomWidth: 2, borderBottomColor: colors.primary },
  backBtn: { padding: 6 },
  backArrow: { fontSize: 20, color: colors.text2, transform: [{ scaleX: -1 }] },
  headerTitle: { fontSize: 15, fontWeight: font.black, color: colors.text },
  scroll: { flex: 1, padding: 20 },
  avatarWrap: { position: 'relative' },
  avatarBadge: { position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  avatarBadgeTxt: { fontSize: 13 },
  hint: { fontSize: 12, color: colors.text3, marginTop: 10 },
  rolePill: { fontSize: 12, fontWeight: font.bold, color: colors.primary, backgroundColor: colors.primarySoft, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 4, marginTop: 14 },
  classTxt: { fontSize: 12, color: colors.text2, marginTop: 8 },
  card: { width: '100%', backgroundColor: 'transparent', borderRadius: 0, padding: 0, borderWidth: 0, marginTop: 28 },
  fieldLabel: { fontSize: 10, fontWeight: font.black, color: colors.text3, marginBottom: 10, textAlign: 'right', letterSpacing: 1.5, textTransform: 'uppercase' },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: colors.text, textAlign: 'right' },
  charCount: { fontSize: 11, color: colors.text3, textAlign: 'left', marginTop: 6, marginBottom: 16 },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.full, padding: 15, alignItems: 'center', marginTop: 8 },
  saveBtnTxt: { color: 'white', fontSize: 15, fontWeight: font.black, letterSpacing: 0.5 },
  emailTxt: { fontSize: 12, color: colors.text3, marginTop: 20 },
});
