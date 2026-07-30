import * as Notifications from 'expo-notifications';
import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import Constants from 'expo-constants';

// ב-Expo Go appOwnership === 'expo', ב-APK זה null או 'standalone'
const isExpoGo = Constants.appOwnership === 'expo';

// תמיד הגדר handler — גם ב-Expo Go וגם ב-APK
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(userId) {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    // Push token רק ב-APK
    if (!isExpoGo) {
      try {
        const token = (await Notifications.getExpoPushTokenAsync({
          projectId: '3eb15964-9247-44d7-a7e3-177364d33060',
        })).data;
        if (userId) {
          await setDoc(doc(db, 'users', userId), { expoPushToken: token }, { merge: true });
        }
        return token;
      } catch (e) {
        console.log('push token error:', e);
      }
    }
    return null;
  } catch (error) {
    console.log('שגיאה בהתראות:', error);
    return null;
  }
}

export async function sendLocalNotification(title, body) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null,
    });
  } catch (error) {
    console.log('שגיאה בהתראה:', error);
  }
}