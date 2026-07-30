import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  SafeAreaView, Alert, ActivityIndicator,
} from 'react-native';
import {
  collection, addDoc, onSnapshot, orderBy, query,
  serverTimestamp, doc, setDoc, getDoc, updateDoc,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, radius, font } from '../theme';
import Avatar from '../components/Avatar';

// ─── helpers ────────────────────────────────────────────────────────────────

function buildDmChatId(uid1, uid2) {
  return [uid1, uid2].sort().join('_');
}

function buildGroupChatId(groupId) {
  return groupId;
}

// ────────────────────────────────────────────────────────────────────────────

export default function ChatScreen({ route, navigation }) {
  // chatId מועבר מהמסכים שכבר מכירים את מסמך השיחה (שיחות ליווי/צוות, שרשור
  // קיים). בלעדיו הייתה נבנית תמיד שיחת DM עם מזהה אחר, ולכן פתיחת שיחת ליווי
  // מהמובייל פתחה מסמך שיחה שונה מזה שהווב יצר — עם היסטוריה ריקה.
  const { name, color, bg, isGroup, partnerUid, groupId, chatId: chatIdParam } = route.params;

  const auth = getAuth();
  const user = auth.currentUser;

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [myNickname, setMyNickname] = useState('');
  const [partnerName, setPartnerName] = useState(name);
  const [partnerAvatarUrl, setPartnerAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [helpRequested, setHelpRequested] = useState(false);

  const chatId = chatIdParam
    ? chatIdParam
    : isGroup
      ? buildGroupChatId(groupId)
      : buildDmChatId(user.uid, partnerUid);

  const flatRef = useRef(null);

  // ── טעינה ראשונית ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      // כינוי המשתמש הנוכחי
      const nick = await AsyncStorage.getItem('user_nickname');
      if (nick) setMyNickname(nick);

      // פרטי הצד השני (DM בלבד)
      if (!isGroup && partnerUid) {
        try {
          const snap = await getDoc(doc(db, 'users', partnerUid));
          if (snap.exists()) {
            const data = snap.data();
            setPartnerName(data.nickname || name);
            setPartnerAvatarUrl(data.avatarUrl || null);
          }
        } catch {}
      }

      setLoading(false);
    }
    init();
  }, []);

  // ── האזנה להודעות ──────────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 80);
    }, () => {}); // שגיאות snapshot מטופלות בשקט
    return unsub;
  }, [chatId]);

  // ── שליחת הודעה ────────────────────────────────────────────────────────────
  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput('');

    const senderName = myNickname || user.email?.split('@')[0] || 'משתמש';

    try {
      // 1. שמור הודעה
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        text,
        senderId: user.uid,
        senderName,
        createdAt: serverTimestamp(),
      });

      // 2. עדכן מסמך השיחה (lastMessage + metadata)
      if (isGroup) {
        await setDoc(doc(db, 'chats', chatId), {
          lastMessage: text,
          lastMessageAt: serverTimestamp(),
          lastSender: senderName,
          isGroup: true,
          type: 'group',
          groupId,
          groupName: partnerName || name,
        }, { merge: true });
      } else {
        // הסוג נגזר ממזהה השיחה ולא נכתב קבוע כ-'dm'. קודם כל הודעה במובייל
        // דרסה type ל-'dm' ב-merge, וכך שיחות ליווי נעלמו מהמסכים שמסננים
        // type == 'mentoring' (MentorHomeScreen, פורטל הצוות וניתוב מצוקה).
        const derivedType = chatId.startsWith('mentoring_')
          ? 'mentoring'
          : chatId.startsWith('staff_')
            ? 'staff'
            : 'dm';

        const names = {
          [user.uid]: partnerName,
          [partnerUid]: senderName,
        };

        await setDoc(doc(db, 'chats', chatId), {
          lastMessage: text,
          lastMessageAt: serverTimestamp(),
          lastSender: senderName,
          participants: [user.uid, partnerUid],
          type: derivedType,
          isGroup: false,
          // כל UID ממופה לשם הצד השני — כך כל משתמש רואה את שם בן-שיחו.
          // participantNames הוא השדה הקנוני; chatNames נשמר לתאימות עם
          // גרסאות ווב שכבר קוראות ממנו.
          participantNames: names,
          chatNames: names,
        }, { merge: true });
      }
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לשלוח הודעה');
    }
  }

  // ── בקשת עזרה מאדמין ──────────────────────────────────────────────────────
  async function requestHelp() {
    Alert.alert(
      'בקשת עזרה מאדמין',
      'האם אתה/ת בטוח/ה? האדמין יוכל לצפות בתוכן השיחה הזו.',
      [
        { text: 'ביטול', style: 'cancel' },
        { text: 'בקש עזרה', style: 'destructive', onPress: async () => {
          try {
            await updateDoc(doc(db, 'chats', chatId), {
              helpRequested: true,
              helpRequestedAt: serverTimestamp(),
              helpRequestedBy: user.uid,
            });
            setHelpRequested(true);
            Alert.alert('נשלח', 'בקשת העזרה נשלחה לאדמין בהצלחה.');
          } catch {
            Alert.alert('שגיאה', 'לא ניתן לשלוח את הבקשה');
          }
        }},
      ]
    );
  }

  // ── רינדור הודעה ───────────────────────────────────────────────────────────
  const renderMsg = useCallback(({ item }) => {
    const isMe = item.senderId === user.uid;
    if (isMe) {
      return (
        <View style={s.myWrap}>
          <Text style={s.myName}>{item.senderName}</Text>
          <Text style={s.myText}>{item.text}</Text>
        </View>
      );
    }
    return (
      <View style={s.theirWrap}>
        <Text style={[s.theirName, { color: color || colors.primary }]}>{item.senderName}</Text>
        <Text style={s.theirText}>{item.text}</Text>
      </View>
    );
  }, [user.uid, color]);

  // ── מצב טעינה ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Text style={s.backArrow}>→</Text>
          </TouchableOpacity>
          <Text style={s.headerName}>{name}</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ── ממשק ───────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backArrow}>→</Text>
        </TouchableOpacity>
        <Avatar
          uri={isGroup ? null : partnerAvatarUrl}
          name={partnerName || name}
          color={color}
          bg={bg}
          size={36}
        />
        <View style={{ flex: 1 }}>
          <Text style={s.headerName}>{partnerName || name}</Text>
          <Text style={s.headerSub}>{isGroup ? 'קבוצה' : 'שיחה פרטית'}</Text>
        </View>
        <TouchableOpacity
          style={s.callBtn}
          onPress={() => Alert.alert('שיחה', `מתקשר ל${partnerName || name}...`)}
        >
          <Text style={{ fontSize: 20 }}>📞</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.callBtn, helpRequested && { opacity: 0.5 }]}
          onPress={helpRequested ? undefined : requestHelp}
          disabled={helpRequested}
        >
          <Text style={{ fontSize: 18 }}>{helpRequested ? '✅' : '🆘'}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={renderMsg}
          contentContainerStyle={s.msgList}
          ListEmptyComponent={
            <Text style={s.empty}>אין הודעות עדיין — שלח את הראשונה! 👋</Text>
          }
        />
        <View style={s.inputBar}>
          <TouchableOpacity
            style={s.distressBtn}
            onPress={() => navigation.navigate('Distress')}
          >
            <Text style={s.distressTxt}>⚠️</Text>
          </TouchableOpacity>
          <View style={s.inputWrap}>
            <TextInput
              style={s.input}
              value={input}
              onChangeText={setInput}
              placeholder="כתוב הודעה..."
              placeholderTextColor={colors.text3}
              onSubmitEditing={send}
              returnKeyType="send"
              textAlign="left"
              multiline={false}
            />
          </View>
          <TouchableOpacity style={s.sendBtn} onPress={send}>
            <Text style={{ color: 'white', fontSize: 16, fontWeight: font.bold }}>→</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, height: 58,
    backgroundColor: colors.card,
    borderBottomWidth: 2, borderBottomColor: colors.primary,
  },
  backBtn: { padding: 6 },
  backArrow: { fontSize: 20, color: colors.text2, transform: [{ scaleX: -1 }] },
  headerName: { fontSize: 15, fontWeight: font.black, color: colors.text },
  headerSub: { fontSize: 11, color: colors.text3 },
  callBtn: { padding: 6 },
  msgList: { padding: 16, gap: 12, flexGrow: 1 },
  empty: { textAlign: 'center', color: colors.text3, fontSize: 13, marginTop: 60 },
  myWrap: {
    alignSelf: 'flex-end', maxWidth: '78%',
    backgroundColor: colors.primary,
    borderRadius: radius.sm, borderBottomRightRadius: 2,
    paddingVertical: 9, paddingHorizontal: 13,
  },
  myName: { fontSize: 11, fontWeight: font.bold, color: 'rgba(255,255,255,0.6)', marginBottom: 3 },
  myText: { fontSize: 14, color: '#fff', lineHeight: 20, textAlign: 'left' },
  theirWrap: {
    alignSelf: 'flex-start', maxWidth: '78%',
    backgroundColor: colors.card,
    borderRadius: radius.sm, borderBottomLeftRadius: 2,
    paddingVertical: 9, paddingHorizontal: 13,
    borderWidth: 1, borderColor: colors.border,
  },
  theirName: { fontSize: 11, fontWeight: font.bold, marginBottom: 3 },
  theirText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: colors.card,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  distressBtn: {
    backgroundColor: colors.redSoft, borderRadius: radius.full,
    padding: 9, borderWidth: 1, borderColor: colors.red,
  },
  distressTxt: { fontSize: 15 },
  inputWrap: {
    flex: 1, backgroundColor: colors.card2,
    borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  input: { color: colors.text, fontSize: 14, textAlign: 'left' },
  sendBtn: {
    width: 38, height: 38, borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
});
