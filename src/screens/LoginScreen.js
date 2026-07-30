import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  SafeAreaView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView, Modal,
} from 'react-native';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { colors, radius, font } from '../theme';
import { GRADE_LEVELS } from '../config/market';

export default function LoginScreen() {
  const [role, setRole] = useState(null);
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  // One code field for every role. There is no school picker: the school list
  // is not publicly readable here, and a picker would let anyone enumerate
  // every district on the platform. The code identifies the school.
  const [schoolCode, setSchoolCode] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gradePickerOpen, setGradePickerOpen] = useState(false);
  const [gradeLevel, setGradeLevel] = useState(null);

  const auth = getAuth();
  // Students and peer mentors pick a grade level; staff do not.
  const isRegistering = mode === 'register';
  const needsGrade = isRegistering && (role === 'student' || role === 'mentor');
  const needsCode = isRegistering;

  useEffect(() => {
    async function loadSaved() {
      try {
        // מיגרציה מחד-פעמית ממפתח ישן ששמר סיסמה כטקסט גלוי
        const legacy = await AsyncStorage.getItem('saved_credentials');
        if (legacy) {
          const { email: e, password: p } = JSON.parse(legacy);
          await AsyncStorage.setItem('saved_email', e);
          await SecureStore.setItemAsync('saved_password', p);
          await AsyncStorage.removeItem('saved_credentials');
        }

        const e = await AsyncStorage.getItem('saved_email');
        const p = await SecureStore.getItemAsync('saved_password');
        if (e && p) {
          setEmail(e); setPassword(p); setRememberMe(true);
        }
      } catch {}
    }
    loadSaved();
  }, []);

  async function handleAuth() {
    if (!email || !password) { Alert.alert('Error', 'Please enter your email and password'); return; }
    if (needsGrade && !nickname.trim()) {
      Alert.alert('Error', 'Please choose a display name'); return;
    }
    if (needsGrade && !gradeLevel) {
      Alert.alert('Error', 'Please select your grade level'); return;
    }
    if (needsCode && !schoolCode.trim()) {
      Alert.alert('Error', role === 'staff' ? 'Please enter your staff code' : 'Please enter your school code');
      return;
    }
    // The code is never checked on the client. Each school has its own, and it
    // is verified server-side so it cannot be extracted from the app bundle.
    setLoading(true);
    try {
      let userCred;
      if (mode === 'login') {
        // נשמר לפני ההתחברות כי onAuthStateChanged ב-App.js עלול לרוץ
        // לפני שנסיים לבדוק את התפקיד. רלוונטי רק לחשבונות אדמין,
        // ולכן כישלון כתיבה לא יחסום התחברות רגילה.
        try { await AsyncStorage.setItem('admin_view_role', role); } catch {}
        userCred = await signInWithEmailAndPassword(auth, email, password);
        // בדוק שה-role ב-Firestore תואם לתפקיד שנבחר במסך
        try {
          const userDoc = await getDoc(doc(db, 'users', userCred.user.uid));
          const actualRole = userDoc.data()?.role;

          // אדמין — גישה לכל אזור, בלי בדיקת התאמת תפקיד.
          // האזור שנבחר כבר נשמר ב-admin_view_role ו-App.js מנתב לפיו.
          if (actualRole !== 'admin' && actualRole !== role) {
            // role לא תואם — מנתקים מיד ומציגים שגיאה
            await auth.signOut();
            const roleNames = { student: 'תלמיד/ה', mentor: 'מתנדב/ת', staff: 'צוות בית ספר' };
            Alert.alert(
              'שגיאת כניסה',
              `החשבון הזה משויך כ"${roleNames[actualRole] || actualRole}" ולא כ"${roleNames[role]}". אנא חזור/י ובחר/י את התפקיד הנכון.`
            );
            setLoading(false);
            return;
          }
          const nick = userDoc.data()?.nickname;
          if (nick) await AsyncStorage.setItem('user_nickname', nick);
        } catch {
          // שגיאת רשת — נתנתק ונבקש לנסות שוב
          await auth.signOut();
          Alert.alert('שגיאה', 'לא ניתן לאמת את התפקיד, נסה שוב');
          setLoading(false);
          return;
        }
      } else {
        userCred = await createUserWithEmailAndPassword(auth, email, password);
        const resolvedNickname = nickname.trim() || email.split('@')[0];

        // Every role is created server-side. The rules deny client writes to
        // /users outright: a client that could write its own document could
        // put any schoolId in it and land inside another school.
        try {
          await httpsCallable(functions, 'usRegisterWithSchoolCode')({
            code: schoolCode.trim(),
            role,
            nickname: resolvedNickname,
            gradeLevel: gradeLevel || '',
          });
          // The function sets the schoolId claim. Without an explicit refresh
          // our token still lacks it and every school-scoped query fails.
          await userCred.user.getIdToken(true);
        } catch (codeError) {
          // Registration failed, so delete the Auth account we just created.
          // Left behind it blocks signing up again with the same email while
          // granting access to nothing.
          try { await userCred.user.delete(); } catch {}
          Alert.alert('Error', codeError?.message || 'That code is not valid');
          setLoading(false);
          return;
        }
        await AsyncStorage.setItem('user_nickname', resolvedNickname);
      }
      if (rememberMe) {
        await AsyncStorage.setItem('saved_email', email);
        await SecureStore.setItemAsync('saved_password', password);
      } else {
        await AsyncStorage.removeItem('saved_email');
        await SecureStore.deleteItemAsync('saved_password');
      }
      // role נקבע ב-App.js מ-Firestore בלבד — אין צורך לעדכן כאן
    } catch (error) {
      let msg = 'אירעה שגיאה, נסה שוב';
      if (error.code === 'auth/user-not-found') msg = 'משתמש לא נמצא';
      if (error.code === 'auth/wrong-password') msg = 'סיסמה שגויה';
      if (error.code === 'auth/email-already-in-use') msg = 'האימייל כבר בשימוש';
      if (error.code === 'auth/weak-password') msg = 'סיסמה חלשה מדי (מינימום 6 תווים)';
      if (error.code === 'auth/invalid-email') msg = 'אימייל לא תקין';
      Alert.alert('שגיאה', msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      Alert.alert('שגיאה', 'אנא הכנס/י את כתובת האימייל שלך למעלה, ואז לחצ/י שוב על "שכחתי סיסמה"');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      Alert.alert('נשלח ✓', 'אם קיים חשבון עם האימייל הזה, נשלח אליו קישור לאיפוס הסיסמה');
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        Alert.alert('נשלח ✓', 'אם קיים חשבון עם האימייל הזה, נשלח אליו קישור לאיפוס הסיסמה');
      } else {
        let msg = 'לא ניתן לשלוח כרגע, נסה שוב';
        if (error.code === 'auth/invalid-email') msg = 'אימייל לא תקין';
        Alert.alert('שגיאה', msg);
      }
    } finally {
      setLoading(false);
    }
  }

  // ── בחירת תפקיד ──
  if (!role) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.roleContainer}>
          <View style={s.logoWrap}>
            <Text style={s.logo}>לינק</Text>
            <Text style={s.tagline}>הרשת החברתית שמחברת</Text>
          </View>
          <Text style={s.roleTitle}>אני...</Text>
          <TouchableOpacity style={s.roleCard} onPress={() => setRole('student')}>
            <Text style={s.roleEmoji}>🎒</Text>
            <View style={s.roleInfo}>
              <Text style={s.roleName}>תלמיד/ה</Text>
              <Text style={s.roleDesc}>כניסה לרשת החברתית, שיחות וקבוצות</Text>
            </View>
            <Text style={s.roleArrow}>←</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.roleCard, s.roleCardMentor]} onPress={() => setRole('mentor')}>
            <Text style={s.roleEmoji}>🤝</Text>
            <View style={s.roleInfo}>
              <Text style={[s.roleName, { color: colors.green }]}>מתנדב/ת</Text>
              <Text style={s.roleDesc}>ניהול שיחות עם תלמידים, שעות ורפלקציה</Text>
            </View>
            <Text style={s.roleArrow}>←</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.roleCard, s.roleCardStaff]} onPress={() => setRole('staff')}>
            <Text style={s.roleEmoji}>🏫</Text>
            <View style={s.roleInfo}>
              <Text style={[s.roleName, { color: colors.purple }]}>צוות בית ספר</Text>
              <Text style={s.roleDesc}>ניהול תלמידים, אישור שעות והתראות מצוקה</Text>
            </View>
            <Text style={s.roleArrow}>←</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── טופס התחברות ──
  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          <View style={s.logoWrap}>
            <Text style={s.logo}>לינק</Text>
            <View style={[s.rolePill, role === 'mentor' && s.rolePillMentor, role === 'staff' && s.rolePillStaff]}>
              <Text style={[s.rolePillTxt, role === 'mentor' && { color: colors.green }, role === 'staff' && { color: colors.purple }]}>
                {role === 'student' ? '🎒 תלמיד/ה' : role === 'mentor' ? '🤝 מתנדב/ת' : '🏫 צוות בית ספר'}
              </Text>
            </View>
          </View>

          <View style={s.card}>
            <Text style={s.title}>{mode === 'login' ? 'כניסה לחשבון' : 'יצירת חשבון'}</Text>

            <TextInput style={s.input} placeholder="אימייל" placeholderTextColor={colors.text3} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" textAlign="left" />

            <TextInput style={s.input} placeholder="סיסמה" placeholderTextColor={colors.text3} value={password} onChangeText={setPassword} secureTextEntry textAlign="left" />

            {mode === 'login' && (
              <TouchableOpacity style={s.forgotBtn} onPress={handleForgotPassword} disabled={loading}>
                <Text style={s.forgotTxt}>שכחתי סיסמה</Text>
              </TouchableOpacity>
            )}

            {needsGrade && (
              <View>
                <TextInput
                  style={s.input}
                  placeholder="Display name (shown in chat) 😎"
                  placeholderTextColor={colors.text3}
                  value={nickname}
                  onChangeText={setNickname}
                  maxLength={20}
                />
                <Text style={s.charCount}>{nickname.length}/20</Text>
              </View>
            )}

            {needsCode && (
              <View style={{ marginBottom: 12 }}>
                <TextInput
                  style={s.input}
                  placeholder={role === 'staff' ? 'Staff code' : 'School code'}
                  placeholderTextColor={colors.text3}
                  value={schoolCode}
                  onChangeText={t => setSchoolCode(t.toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  secureTextEntry={role === 'staff'}
                />
                <Text style={s.hint}>
                  {role === 'staff'
                    ? 'Ask your school administrator for the staff code.'
                    : 'Your school gives this out — ask a teacher if you do not have it.'}
                </Text>
              </View>
            )}

            {needsGrade && (
              <View style={{ marginBottom: 20 }}>
                <Text style={s.fieldLabel}>Grade level</Text>
                <TouchableOpacity style={s.gradePicker} onPress={() => setGradePickerOpen(true)}>
                  <Text style={[s.gradePickerTxt, !gradeLevel && { color: colors.text3 }]}>
                    {GRADE_LEVELS.find(g => g.value === gradeLevel)?.label || 'Select your grade'}
                  </Text>
                  <Text style={s.gradePickerArrow}>▾</Text>
                </TouchableOpacity>
                <Modal visible={gradePickerOpen} transparent animationType="fade" onRequestClose={() => setGradePickerOpen(false)}>
                  <TouchableOpacity style={s.gradeModalOverlay} activeOpacity={1} onPress={() => setGradePickerOpen(false)}>
                    <View style={s.gradeModalSheet}>
                      <Text style={s.gradeModalTitle}>SELECT YOUR GRADE</Text>
                      <ScrollView>
                        {GRADE_LEVELS.map(g => {
                          const active = gradeLevel === g.value;
                          return (
                            <TouchableOpacity
                              key={g.value}
                              style={[s.gradeOption, active && s.gradeOptionActive]}
                              onPress={() => { setGradeLevel(g.value); setGradePickerOpen(false); }}
                            >
                              <Text style={[s.gradeOptionTxt, active && s.gradeOptionTxtActive]}>{g.label}</Text>
                              {active && <Text style={s.gradeOptionCheck}>✓</Text>}
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  </TouchableOpacity>
                </Modal>
              </View>
            )}

            {isRegistering && role === 'mentor' && (
              <Text style={s.hint}>
                Peer mentor accounts are reviewed by your school before they go live.
              </Text>
            )}

            <TouchableOpacity style={s.rememberRow} onPress={() => setRememberMe(p => !p)}>
              <View style={[s.checkbox, rememberMe && s.checkboxActive]}>
                {rememberMe && <Text style={{ color: 'white', fontSize: 12, fontWeight: '900' }}>✓</Text>}
              </View>
              <Text style={s.rememberTxt}>Remember me</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[s.mainBtn, role === 'mentor' && s.mainBtnMentor, role === 'staff' && s.mainBtnStaff]} onPress={handleAuth} disabled={loading}>
              {loading ? <ActivityIndicator color="white" /> : <Text style={s.mainBtnTxt}>{mode === 'login' ? 'כניסה' : 'הרשמה'}</Text>}
            </TouchableOpacity>

            <View style={s.divider}>
              <View style={s.divLine} />
              <Text style={s.divTxt}>או</Text>
              <View style={s.divLine} />
            </View>

            <TouchableOpacity style={s.socialBtn} onPress={() => Alert.alert('בקרוב', 'כניסה עם Google תהיה זמינה בגרסה הבאה')}>
              <Text style={s.socialIco}>🌐</Text><Text style={s.socialTxt}>המשך עם Google</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.socialBtn} onPress={() => Alert.alert('בקרוב', 'כניסה עם Apple תהיה זמינה בגרסה הבאה')}>
              <Text style={s.socialIco}>🍎</Text><Text style={s.socialTxt}>המשך עם Apple</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.toggleBtn} onPress={() => setMode(mode === 'login' ? 'register' : 'login')}>
              <Text style={s.toggleTxt}>{mode === 'login' ? 'אין לך חשבון? הירשם עכשיו' : 'יש לך חשבון? התחבר'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.backBtn} onPress={() => setRole(null)}>
              <Text style={s.backTxt}>← החלף תפקיד</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: 24 },
  roleContainer: { flex: 1, justifyContent: 'center', padding: 24 },
  logoWrap: { alignItems: 'center', marginBottom: 40 },
  logo: { fontSize: 52, fontWeight: font.black, color: colors.primary, letterSpacing: -2 },
  tagline: { fontSize: 11, color: colors.text3, fontWeight: font.semi, marginTop: 8, letterSpacing: 2, textTransform: 'uppercase' },
  roleTitle: { fontSize: 11, fontWeight: font.black, color: colors.text3, textAlign: 'center', marginBottom: 24, letterSpacing: 2, textTransform: 'uppercase' },
  roleCard: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: colors.card, borderRadius: radius.sm, padding: 20, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  roleCardMentor: { borderColor: 'rgba(16,185,129,0.35)' },
  roleCardStaff: { borderColor: 'rgba(147,51,234,0.45)' },
  roleEmoji: { fontSize: 30 },
  roleInfo: { flex: 1 },
  roleName: { fontSize: 17, fontWeight: font.black, color: colors.text, marginBottom: 3 },
  roleDesc: { fontSize: 12, color: colors.text3, lineHeight: 18 },
  roleArrow: { fontSize: 16, color: colors.text3 },
  rolePill: { backgroundColor: colors.primarySoft, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 4, marginTop: 10 },
  rolePillMentor: { backgroundColor: colors.greenSoft },
  rolePillStaff: { backgroundColor: colors.purpleSoft },
  rolePillTxt: { fontSize: 12, fontWeight: font.bold, color: colors.primary },
  card: { backgroundColor: 'transparent' },
  title: { fontSize: 24, fontWeight: font.black, color: colors.text, textAlign: 'left', marginBottom: 32 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: colors.text, marginBottom: 16, textAlign: 'left' },
  charCount: { fontSize: 11, color: colors.text3, textAlign: 'left', marginTop: -16, marginBottom: 16 },
  forgotBtn: { alignSelf: 'flex-end', marginTop: -14, marginBottom: 20 },
  forgotTxt: { fontSize: 12, color: colors.primary, fontWeight: font.bold },
  fieldLabel: { fontSize: 10, fontWeight: font.black, color: colors.text3, marginBottom: 10, textAlign: 'left', letterSpacing: 1.5, textTransform: 'uppercase' },
  hint: { fontSize: 12, color: colors.text2, fontWeight: font.semi, textAlign: 'center', marginVertical: 8 },
  classRow: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 13, marginBottom: 8 },
  classRowActive: { borderLeftColor: colors.primary, backgroundColor: colors.primarySoft },
  classRowTxt: { fontSize: 14, fontWeight: font.bold, color: colors.text, textAlign: 'left' },
  classRowSub: { fontSize: 11, color: colors.text3, textAlign: 'left', marginTop: 3 },
  gradePicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 12, paddingHorizontal: 14 },
  gradePickerTxt: { fontSize: 15, color: colors.text, textAlign: 'left' },
  gradePickerArrow: { fontSize: 14, color: colors.text3 },
  gradeModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 32 },
  gradeModalSheet: { backgroundColor: colors.card2, borderRadius: radius.md, maxHeight: 400, overflow: 'hidden' },
  gradeModalTitle: { fontSize: 13, fontWeight: font.black, color: colors.text3, textAlign: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border, letterSpacing: 1.5 },
  gradeOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  gradeOptionActive: { backgroundColor: colors.primarySoft },
  gradeOptionTxt: { fontSize: 15, fontWeight: font.semi, color: colors.text, textAlign: 'left' },
  gradeOptionTxtActive: { color: colors.primary, fontWeight: font.bold },
  gradeOptionCheck: { fontSize: 14, color: colors.primary, fontWeight: font.black },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24 },
  checkbox: { width: 18, height: 18, borderRadius: 3, borderWidth: 1.5, borderColor: colors.border, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  rememberTxt: { fontSize: 13, fontWeight: font.semi, color: colors.text2 },
  mainBtn: { backgroundColor: colors.primary, borderRadius: radius.full, padding: 16, alignItems: 'center', marginBottom: 4 },
  mainBtnMentor: { backgroundColor: colors.green },
  mainBtnStaff: { backgroundColor: colors.purple },
  mainBtnTxt: { color: 'white', fontSize: 15, fontWeight: font.black, letterSpacing: 0.5 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 12 },
  divLine: { flex: 1, height: 1, backgroundColor: colors.border },
  divTxt: { fontSize: 10, color: colors.text3, fontWeight: font.black, letterSpacing: 1.5 },
  socialBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 13, paddingHorizontal: 16, marginBottom: 8 },
  socialIco: { fontSize: 17 },
  socialTxt: { fontSize: 13, fontWeight: font.semi, color: colors.text2 },
  toggleBtn: { alignItems: 'center', marginTop: 12 },
  toggleTxt: { fontSize: 13, color: colors.primary, fontWeight: font.bold },
  backBtn: { alignItems: 'center', marginTop: 16 },
  backTxt: { fontSize: 12, color: colors.text3, fontWeight: font.semi },
});
