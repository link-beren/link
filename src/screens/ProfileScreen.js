import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  SafeAreaView, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, functions, storage } from '../firebase';
import { gradeLabel } from '../config/market';
import Avatar from '../components/Avatar';
import { colors, radius, font } from '../theme';

const roleLabels = {
  student: '🎒 Student',
  mentor: '🤝 Peer mentor',
  staff: '🏫 School staff',
  admin: '🛡️ System admin',
};

export default function ProfileScreen({ navigation }) {
  const user = getAuth().currentUser;
  const [profile, setProfile] = useState(null);
  const [nickname, setNickname] = useState('');
  const [savingNickname, setSavingNickname] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [applying, setApplying] = useState(false);

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
    if (!trimmed) { Alert.alert('Hold on', 'Please enter a display name.'); return; }
    setSavingNickname(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { nickname: trimmed });
      await AsyncStorage.setItem('user_nickname', trimmed);
      Alert.alert('✓', 'Display name updated.');
    } catch {
      Alert.alert('Something went wrong', 'Your display name could not be updated right now.');
    } finally {
      setSavingNickname(false);
    }
  }

  async function pickAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to change your profile picture.');
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
      Alert.alert('Something went wrong', 'That picture could not be uploaded right now.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  // Any student may volunteer, but the switch happens server-side: `role` is
  // immutable from the client, because a client that could edit it could make
  // itself staff and read every distress alert in the school.
  function applyToMentor() {
    Alert.alert(
      'Become a peer mentor',
      'Peer mentors are students at this school who make time to listen to other '
      + 'students. Your school reviews every application before it goes live.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Apply',
          onPress: async () => {
            setApplying(true);
            try {
              await httpsCallable(functions, 'usApplyToMentor')({});
              Alert.alert('Application sent', 'Your school will review it shortly.');
            } catch (err) {
              Alert.alert('Something went wrong', err?.message || 'Your application could not be sent.');
            } finally {
              setApplying(false);
            }
          },
        },
      ],
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Text style={s.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>My profile</Text>
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
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>My profile</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ alignItems: 'center', paddingVertical: 24 }}>
        <TouchableOpacity onPress={pickAvatar} disabled={uploadingAvatar} style={s.avatarWrap}>
          <Avatar uri={profile.avatarUrl} name={nickname} color={colors.primary} bg={colors.primarySoft} size={100} />
          <View style={s.avatarBadge}>
            {uploadingAvatar ? <ActivityIndicator size="small" color="white" /> : <Text style={s.avatarBadgeTxt}>✏️</Text>}
          </View>
        </TouchableOpacity>
        <Text style={s.hint}>Tap your picture to change it</Text>

        {!!profile.role && <Text style={s.rolePill}>{roleLabels[profile.role] || profile.role}</Text>}
        {!!profile.gradeLevel && <Text style={s.classTxt}>🎓 {gradeLabel(profile.gradeLevel)}</Text>}
        {!!profile.homeroomName && <Text style={s.classTxt}>🏫 {profile.homeroomName}</Text>}

        <View style={s.card}>
          <Text style={s.fieldLabel}>Display name</Text>
          <TextInput
            style={s.input}
            value={nickname}
            onChangeText={setNickname}
            placeholder="Display name"
            placeholderTextColor={colors.text3}
            textAlign="left"
            maxLength={20}
          />
          <Text style={s.charCount}>{nickname.length}/20</Text>

          <TouchableOpacity style={s.saveBtn} onPress={saveNickname} disabled={savingNickname}>
            {savingNickname ? <ActivityIndicator color="white" /> : <Text style={s.saveBtnTxt}>Save</Text>}
          </TouchableOpacity>
        </View>

        {profile.role === 'student' && (
          <TouchableOpacity style={s.mentorBtn} onPress={applyToMentor} disabled={applying}>
            {applying
              ? <ActivityIndicator color={colors.primary} />
              : <Text style={s.mentorBtnTxt}>🤝 Apply to be a peer mentor</Text>}
          </TouchableOpacity>
        )}

        <Text style={s.emailTxt}>{profile.email}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 58, backgroundColor: colors.card, borderBottomWidth: 2, borderBottomColor: colors.primary },
  backBtn: { padding: 6 },
  backArrow: { fontSize: 20, color: colors.text2 },
  headerTitle: { fontSize: 15, fontWeight: font.black, color: colors.text },
  scroll: { flex: 1, padding: 20 },
  avatarWrap: { position: 'relative' },
  avatarBadge: { position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  avatarBadgeTxt: { fontSize: 13 },
  hint: { fontSize: 12, color: colors.text3, marginTop: 10 },
  rolePill: { fontSize: 12, fontWeight: font.bold, color: colors.primary, backgroundColor: colors.primarySoft, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 4, marginTop: 14 },
  classTxt: { fontSize: 12, color: colors.text2, marginTop: 8 },
  card: { width: '100%', backgroundColor: 'transparent', borderRadius: 0, padding: 0, borderWidth: 0, marginTop: 28 },
  fieldLabel: { fontSize: 10, fontWeight: font.black, color: colors.text3, marginBottom: 10, textAlign: 'left', letterSpacing: 1.5, textTransform: 'uppercase' },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: colors.text, textAlign: 'left' },
  charCount: { fontSize: 11, color: colors.text3, textAlign: 'right', marginTop: 6, marginBottom: 16 },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.full, padding: 15, alignItems: 'center', marginTop: 8 },
  saveBtnTxt: { color: 'white', fontSize: 15, fontWeight: font.black, letterSpacing: 0.5 },
  mentorBtn: { width: '100%', borderRadius: radius.full, padding: 15, alignItems: 'center', marginTop: 20, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  mentorBtnTxt: { color: colors.primary, fontSize: 14, fontWeight: font.black },
  emailTxt: { fontSize: 12, color: colors.text3, marginTop: 20 },
});
