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

// The areas a system admin can enter
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
      <Tab.Screen name="MentorTab" component={MentorHomeStack} options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" label="Home" focused={focused} /> }} />
      <Tab.Screen name="ConvTab" component={MentorConvStack} options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="💬" label="Chats" focused={focused} /> }} />
      <Tab.Screen name="DiscoverTab" component={DiscoverScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🌐" label="Discover" focused={focused} /> }} />
      <Tab.Screen name="FriendsTab" component={FriendsStack} options={{
        tabBarIcon: ({ focused }) => (
          <View>
            <TabIcon emoji="❤️" label="Friends" focused={focused} />
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
      <Tab.Screen name="ConvTab" component={ConvStack} options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="💬" label="Chats" focused={focused} /> }} />
      <Tab.Screen name="DiscoverTab" component={DiscoverScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🌐" label="Discover" focused={focused} /> }} />
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
            <TabIcon emoji="❤️" label="Friends" focused={focused} />
            {pendingCount > 0 && (
              <View style={{ position: 'absolute', top: -2, left: -2, backgroundColor: colors.red, borderRadius: 99, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                <Text style={{ fontSize: 9, fontWeight: '900', color: 'white' }}>{pendingCount}</Text>
              </View>
            )}
          </View>
        ),
      }} />
      <Tab.Screen name="MentoringTab" component={MentoringStack} options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🤝" label="Mentors" focused={focused} /> }} />
    </Tab.Navigator>
  );
}

/**
 * Sends a local notification for new distress alerts (less than 5 seconds old).
 * status is filtered here rather than in the query, so that the existing
 * notifySchoolIds + createdAt index is enough.
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
        alert.unrouted ? '🆘 Distress alert with no school' : '🆘 New distress alert',
        `${alert.nickname || 'Student'}: ${alert.reasonText}`
      );
    }
  });
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null);
  const [mentorStatus, setMentorStatus] = useState(null);
  const [homeroomName, setHomeroomName] = useState(null);
  const [homeroomId, setHomeroomId] = useState(null);
  // The user's school — school staff and peer mentors only. Students have no school.
  const [schoolId, setSchoolId] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  // The area the system admin picked on the login screen (student / mentor / staff)
  const [adminViewRole, setAdminViewRole] = useState(null);

  useEffect(() => {
    const auth = getAuth();
    let unsubRole = null;
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (unsubRole) { unsubRole(); unsubRole = null; }
      if (u) {
        // A listener (not a one-off getDoc) — so we do not miss the role if the doc has not been written yet during sign-up
        unsubRole = onSnapshot(doc(db, 'users', u.uid), userDoc => {
          // The document does not exist yet — a new sign-up is in progress, so we wait
          if (!userDoc.exists()) return;

          const data = userDoc.data();
          const detectedRole = data?.role;

          // role is missing — the document is corrupt, so we sign out
          if (!detectedRole) {
            signOut(getAuth()).catch(() => {});
            return;
          }

          // role is decided solely by Firestore — never by the UI
          setRole(detectedRole);

          // System admin — load the area that was picked on the login screen.
          // Default to 'student' if there is no saved value or the value is invalid,
          // otherwise we end up on an endless loading screen with no matching navigation branch.
          if (detectedRole === 'admin') {
            AsyncStorage.getItem('admin_view_role')
              .then(saved => setAdminViewRole(ADMIN_VIEW_ROLES.includes(saved) ? saved : 'student'))
              .catch(() => setAdminViewRole('student'));
          } else {
            setAdminViewRole(null);
          }

          setMentorStatus(data.mentorStatus || null);
          setHomeroomName(data.homeroomName || null);
          setHomeroomId(data.homeroomId || null);
          setSchoolId(data.schoolId || null);
          setLoading(false);

          // Hour tracking — only for approved peer mentors who belong to a school.
          // Without schoolId the security rules reject every hours write.
          if (detectedRole === 'mentor' && data.mentorStatus === 'approved' && data.schoolId) {
            startTracking({
              uid: u.uid,
              schoolId: data.schoolId,
              homeroomId: data.homeroomId || null,
              mentorName: data.nickname || u.email?.split('@')[0] || 'Peer Mentor',
            });
          } else {
            stopTracking();
          }
        }, () => {
          // Firestore error — we sign out
          signOut(getAuth()).catch(() => {});
          setLoading(false);
        });
        registerForPushNotifications(u.uid);
      } else {
        setRole(null);
        setMentorStatus(null);
        setHomeroomName(null);
        setHomeroomId(null);
        setSchoolId(null);
        setAdminViewRole(null);
        AsyncStorage.removeItem('admin_view_role').catch(() => {});
        stopTracking();
        setLoading(false);
      }
    });
    return () => { unsubAuth(); if (unsubRole) unsubRole(); };
  }, []);

  // Listens for pending friend requests for the badge
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

  // Global listener for new messages — works on every screen
  useEffect(() => {
    if (!user) return;
    // Listens to all of the user's chats
    const chatsQuery = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid)
    );
    // chatId -> the unsubscribe function for the listener on that chat's last message,
    // so that we do not create a duplicate listener every time the outer query fires again
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
              // Only new messages (less than 5 seconds old) from other people
              if (msg.senderId !== user.uid && Date.now() - msgTime < 5000) {
                const { sendLocalNotification } = require('./src/notifications');
                sendLocalNotification(msg.senderName, msg.text);
              }
            }
          });
        }, () => {});
      });

      // Cleans up listeners for chats that are no longer in the list (for example after leaving a group)
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

  // The role that decides which navigation is shown. For a system admin — the area picked at login.
  const isAdmin = role === 'admin';
  const effectiveRole = isAdmin ? adminViewRole : role;

  // Global listener for new distress alerts — for school staff.
  // An alert belongs to the student's own school, so this must filter by
  // schoolId: without the filter the rules reject the entire query, not just
  // the rows outside the school. Admins read everything, so no filter there.
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
      where('schoolId', '==', schoolId),
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

  // System admin — we wait for the selected area to load from local storage
  if (isAdmin && !adminViewRole) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (effectiveRole === 'mentor') {
    // A system admin enters the mentor area directly — no school staff approval needed
    if (!isAdmin && mentorStatus !== 'approved') {
      return (
        <NavigationContainer>
          <MentorPendingScreen mentorStatus={mentorStatus} homeroomName={homeroomName} />
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