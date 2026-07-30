import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { app, db } from './firebase';

export async function requestWebPushToken(uid: string) {
  const supported = await isSupported();
  if (!supported || !('Notification' in window) || !('serviceWorker' in navigator)) {
    throw new Error('This browser does not support Web Push notifications.');
  }

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
  if (!vapidKey) {
    throw new Error('VITE_FIREBASE_VAPID_KEY is missing. Create a Web Push certificate in the Firebase Console and add it to the env file.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  const registration = await navigator.serviceWorker.ready;
  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    throw new Error('Firebase did not return a notification token.');
  }

  await setDoc(
    doc(db, 'users', uid, 'fcmWebTokens', token),
    {
      token,
      platform: 'web',
      userAgent: navigator.userAgent,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return token;
}

export async function subscribeForegroundMessages(onNotification: (message: string) => void) {
  if (!(await isSupported())) return () => {};
  const messaging = getMessaging(app);
  return onMessage(messaging, (payload) => {
    onNotification(payload.notification?.title || payload.notification?.body || 'You have a new notification');
  });
}
