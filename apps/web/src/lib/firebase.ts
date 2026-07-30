import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

const firebaseConfig: FirebaseOptions = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ??
    'AIzaSyCDk8kiDDdQJwggqaymUIG0vdxz40XFR5s',
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ??
    'link-app-965dd.firebaseapp.com',
  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'link-app-965dd',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ??
    'link-app-965dd.firebasestorage.app',
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '87561510798',
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ??
    '1:87561510798:web:1726be658265d05bb7cedf',
  measurementId:
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? 'G-WHDP1JTHL8',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const authPersistenceReady = setPersistence(
  auth,
  browserLocalPersistence,
);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
export const storage = getStorage(app);
// כל הפונקציות פרוסות ב-me-west1; בלי האזור המפורש הקריאה תפנה ל-us-central1
export const functions = getFunctions(app, 'me-west1');
