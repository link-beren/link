import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Text, View, ActivityIndicator } from 'react-native';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, collection, query, where, orderBy, limit } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from './src/firebase';
import { colors } from './src/theme';
import './src/firebase';
import { registerForPushNotifications } from './src/notifications';
import { startTracking, stopTracking } from './src/utils/sessionTracker';
import LoginScreen from './src/screens/LoginScreen';
import ConversationsScreen from './src/screens/ConversationsScreen';
import ChatScreen from './src/screens/ChatScreen';
import DiscoverScreen from './src/screens/DiscoverScreen';
import FriendsScreen from './src/screens/FriendsScreen';
import MentoringScreen from './src/screens/MentoringScreen';
import DistressScreen from './src/screens/DistressScreen';
import MentorHomeScreen from './src/screens/MentorHomeScreen';
import StaffPortalScreen from './src/screens/StaffPortalScreen';
import MentorPendingScreen from './src/screens/MentorPendingScreen';
import ProfileScreen from './src/screens/ProfileScreen';

// האזורים שאדמין יכול להיכנס אליהם
const ADMIN_VIEW_ROLES = ['student', 'mentor', 'staff'];

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function TabIcon({ emoji, label, focused }) {
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Text style={{ fontSize: 21 }}>{emoji}</Text>
      <Text style={{ fontSize: 10, fontWeight: '700', color: focused ? colors.primary : colors.text3 }}>{label}</Text>
    </View>
  );
}

function ConvStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Conversations" component={ConversationsScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="Mentoring" component={MentoringScreen} />
      <Stack.Screen name="Distress" component={DistressScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}

function FriendsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FriendsList" component={FriendsScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="Distress" component={DistressScreen} />
    </Stack.Navigator>
  );
}

function StaffStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="StaffPortal" component={StaffPortalScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="Distress" component={DistressScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}

function MentorHomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MentorHome" component={MentorHomeScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}

function MentorConvStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Conversations" component={ConversationsScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}

function MentorTabs({ pendingCount }) {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, height: 72, paddingBottom: 10 }, tabBarShowLabel: false }}>
      <Tab.Screen name="MentorTab" component={MentorHomeStack} options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" label="בית" focused={focused} /> }} />
      <Tab.Screen name="ConvTab" component={MentorConvStack} options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="💬" label="שיחות" focused={focused} /> }} />
      <Tab.Screen name="DiscoverTab" component={DiscoverScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🌐" label="גלה" focused={focused} /> }} />
      <Tab.Screen name="FriendsTab" component={FriendsStack} options={{
        tabBarIcon: ({ focused }) => (
          <View>
            <TabIcon emoji="❤️" label="חברים" focused={focused} />
            {pendingCount > 0 && (
              <View style={{ position: 'absolute', top: -2, left: -2, backgroundColor: colors.red, borderRadius: 99, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                <Text style={{ fontSize: 9, fontWeight: '900', color: 'white' }}>{pendingCount}</Text>
              </View>
            )}
          </View>
        ),
      }} />
    </Tab.Navigator>
  );
}

function MentoringStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MentoringHome" component={MentoringScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="Distress" component={DistressScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}

function StudentTabs({ pendingCount }) {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, height: 72, paddingBottom: 10 }, tabBarShowLabel: false }}>
      <Tab.Screen name="ConvTab" component={ConvStack} options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="💬" label="שיחות" focused={focused} /> }} />
      <Tab.Screen name="DiscoverTab" component={DiscoverScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🌐" label="גלה" focused={focused} /> }} />
      <Tab.Screen name="DistressTab" component={DistressScreen} options={{
        tabBarIcon: ({ focused }) => (
          <View style={{ backgroundColor: colors.red, borderRadius: 30, width: 54, height: 54, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
            <Text style={{ fontSize: 22 }}>🆘</Text>
          </View>
        ),
      }} />
      <Tab.Screen name="FriendsTab" component={FriendsStack} options={{
        tabBarIcon: ({ focused }) => (
          <View>
            <TabIcon emoji="❤️" label="חברים" focused={focused} />
            {pendingCount > 0 && (
              <View style={{ position: 'absolute', top: -2, left: -2, backgroundColor: colors.red, borderRadius: 99, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                <Text style={{ fontSize: 9, fontWeight: '900', color: 'white' }}>{pendingCount}</Text>
              </View>
            )}
          </View>
        ),
      }} />
      <Tab.Screen name="MentoringTab" component={MentoringStack} options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🤝" label="מתנדבים" focused={focused} /> }} />
    </Tab.Navigator>
  );
}

/**
 * שולח התראה מקומית על התראות מצוקה חדשות (פחות מ-5 שניות).
 * status מסונן כאן ולא בשאילתה, כדי להסתפק באינדקס
 * notifySchoolIds + createdAt הקיים.
 */
function notifyNewAlerts(snap) {
  snap.docChanges().forEach(change => {
    if (change.type !== 'added') return;
    const alert = change.doc.data();
    if (alert.status !== 'open') return;
    const alertTime = alert.createdAt?.toMillis?.() || 0;
    if (Date.now() - alertTime < 5000) {
      const { sendLocalNotification } = require('./src/notifications');
      sendLocalNotification(
        alert.unrouted ? '🆘 מצוקה ללא שיוך בית ספר' : '🆘 התראת מצוקה חדשה',
        `${alert.nickname || 'תלמיד/ה'}: ${alert.reasonText}`
      );
    }
  });
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null);
  const [mentorStatus, setMentorStatus] = useState(null);
  const [className, setClassName] = useState(null);
  const [classId, setClassId] = useState(null);
  // בית הספר של המשתמש — צוות ומתנדבים בלבד. לתלמידים אין שיוך.
  const [schoolId, setSchoolId] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  // האזור שאדמין בחר במסך ההתחברות (student / mentor / staff)
  const [adminViewRole, setAdminViewRole] = useState(null);

  useEffect(() => {
    const auth = getAuth();
    let unsubRole = null;
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (unsubRole) { unsubRole(); unsubRole = null; }
      if (u) {
        // מאזין (לא getDoc חד-פעמי) — כדי לא לפספס את התפקיד אם ה-doc עוד לא נכתב בזמן ההרשמה
        unsubRole = onSnapshot(doc(db, 'users', u.uid), userDoc => {
          // המסמך עוד לא קיים — הרשמה חדשה בתהליך, ממתינים
          if (!userDoc.exists()) return;

          const data = userDoc.data();
          const detectedRole = data?.role;

          // role חסר — מסמך פגום, מנתקים
          if (!detectedRole) {
            signOut(getAuth()).catch(() => {});
            return;
          }

          // role נקבע אך ורק מ-Firestore — אף פעם לא מ-UI
          setRole(detectedRole);

          // אדמין — טוענים את האזור שנבחר במסך ההתחברות.
          // ברירת מחדל 'student' אם אין ערך שמור או שהערך לא תקין,
          // אחרת נגיע למסך טעינה אינסופי בלי אף ענף ניווט תואם.
          if (detectedRole === 'admin') {
            AsyncStorage.getItem('admin_view_role')
              .then(saved => setAdminViewRole(ADMIN_VIEW_ROLES.includes(saved) ? saved : 'student'))
              .catch(() => setAdminViewRole('student'));
          } else {
            setAdminViewRole(null);
          }

          setMentorStatus(data.mentorStatus || null);
          setClassName(data.className || null);
          setClassId(data.classId || null);
          setSchoolId(data.schoolId || null);
          setLoading(false);

          // מעקב שעות — רק למנטורים מאושרים המשויכים לבית ספר.
          // בלי schoolId כללי האבטחה דוחים כל כתיבת שעות.
          if (detectedRole === 'mentor' && data.mentorStatus === 'approved' && data.schoolId) {
            startTracking({
              uid: u.uid,
              schoolId: data.schoolId,
              classId: data.classId || null,
              mentorName: data.nickname || u.email?.split('@')[0] || 'מתנדב/ת',
            });
          } else {
            stopTracking();
          }
        }, () => {
          // שגיאת Firestore — מנתקים
          signOut(getAuth()).catch(() => {});
          setLoading(false);
        });
        registerForPushNotifications(u.uid);
      } else {
        setRole(null);
        setMentorStatus(null);
        setClassName(null);
        setClassId(null);
        setSchoolId(null);
        setAdminViewRole(null);
        AsyncStorage.removeItem('admin_view_role').catch(() => {});
        stopTracking();
        setLoading(false);
      }
    });
    return () => { unsubAuth(); if (unsubRole) unsubRole(); };
  }, []);

  // מאזין לבקשות חברות ממתינות לbadge
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'friendRequests'),
      where('toUid', '==', user.uid),
      where('status', '==', 'pending')
    );
    const unsub = onSnapshot(q, snap => setPendingCount(snap.docs.length), () => {});
    return unsub;
  }, [user]);

  // האזנה גלובלית להודעות חדשות — עובדת בכל מסך
  useEffect(() => {
    if (!user) return;
    // מאזין לכל השיחות של המשתמש
    const chatsQuery = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid)
    );
    // chatId -> פונקציית ביטול המאזין להודעה האחרונה של אותה שיחה,
    // כדי לא ליצור מאזין כפול בכל פעם שהשאילתה החיצונית יורה מחדש
    const msgUnsubs = {};

    const unsubChats = onSnapshot(chatsQuery, snap => {
      const currentIds = new Set(snap.docs.map(d => d.id));

      currentIds.forEach(chatId => {
        if (msgUnsubs[chatId]) return;
        const msgsQuery = query(
          collection(db, 'chats', chatId, 'messages'),
          orderBy('createdAt', 'desc'),
          limit(1)
        );
        msgUnsubs[chatId] = onSnapshot(msgsQuery, msgSnap => {
          msgSnap.docChanges().forEach(change => {
            if (change.type === 'added') {
              const msg = change.doc.data();
              const msgTime = msg.createdAt?.toMillis?.() || 0;
              // רק הודעות חדשות (פחות מ-5 שניות) מאחרים
              if (msg.senderId !== user.uid && Date.now() - msgTime < 5000) {
                const { sendLocalNotification } = require('./src/notifications');
                sendLocalNotification(msg.senderName, msg.text);
              }
            }
          });
        }, () => {});
      });

      // מנקה מאזינים לשיחות שכבר לא ברשימה (למשל יציאה מקבוצה)
      Object.keys(msgUnsubs).forEach(chatId => {
        if (!currentIds.has(chatId)) {
          msgUnsubs[chatId]();
          delete msgUnsubs[chatId];
        }
      });
    }, () => {});

    return () => {
      unsubChats();
      Object.values(msgUnsubs).forEach(unsub => unsub());
    };
  }, [user]);

  // התפקיד שקובע איזה ניווט מוצג. לאדמין — האזור שנבחר בהתחברות.
  const isAdmin = role === 'admin';
  const effectiveRole = isAdmin ? adminViewRole : role;

  // האזנה גלובלית להתראות מצוקה חדשות — עבור צוות בית-הספר.
  // ההתראה מנותבת ל-notifySchoolIds (בתי הספר של המתנדבים שמלווים את התלמיד),
  // ולכן חייבים לסנן לפי בית הספר — בלי הסינון השאילתה כולה נדחית בחוקים.
  // אדמין קורא הכול, ולכן אצלו אין תנאי בית ספר.
  useEffect(() => {
    if (!user) return;
    if (isAdmin) {
      const adminQuery = query(
        collection(db, 'distressAlerts'),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
      return onSnapshot(adminQuery, snap => notifyNewAlerts(snap), () => {});
    }
    if (effectiveRole !== 'staff' || !schoolId) return;
    const alertsQuery = query(
      collection(db, 'distressAlerts'),
      where('notifySchoolIds', 'array-contains', schoolId),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    return onSnapshot(alertsQuery, snap => notifyNewAlerts(snap), () => {});
  }, [user, effectiveRole, isAdmin, schoolId]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <NavigationContainer>
        <LoginScreen />
      </NavigationContainer>
    );
  }

  // אדמין — ממתינים לטעינת האזור הנבחר מהאחסון המקומי
  if (isAdmin && !adminViewRole) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (effectiveRole === 'mentor') {
    // אדמין נכנס לאזור המנטור ישירות — אין צורך באישור צוות
    if (!isAdmin && mentorStatus !== 'approved') {
      return (
        <NavigationContainer>
          <MentorPendingScreen mentorStatus={mentorStatus} className={className} />
        </NavigationContainer>
      );
    }
    return (
      <NavigationContainer>
        <MentorTabs pendingCount={pendingCount} />
      </NavigationContainer>
    );
  }

  if (effectiveRole === 'staff') {
    return (
      <NavigationContainer>
        <StaffStack />
      </NavigationContainer>
    );
  }

  if (effectiveRole === 'student') {
    return (
      <NavigationContainer>
        <StudentTabs pendingCount={pendingCount} />
      </NavigationContainer>
    );
  }

  // role לא ידוע — לא אמורים להגיע לכאן. מציגים מוצא כדי לא להיתקע
  // במסך טעינה אינסופי שאי אפשר לצאת ממנו בלי התקנה מחדש.
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text
        onPress={() => signOut(getAuth()).catch(() => {})}
        style={{ color: colors.primary, fontWeight: '700', marginTop: 24 }}
      >
        התנתקות
      </Text>
    </View>
  );
}