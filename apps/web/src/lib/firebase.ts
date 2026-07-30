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
// US market runs against a NAMED Firestore database ('usa') inside the same
// Firebase project. The Israeli app uses the project's default database.
// Dropping the third argument here would silently point this build at Israeli data.
export const US_DATABASE_ID = 'usa';

export const db = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  },
  US_DATABASE_ID,
);
export const storage = getStorage(app);
// US Cloud Functions are deployed to us-central1 under the 'usa' codebase,
// with every export prefixed `us` so it cannot collide with the Israeli codebase.
export const functions = getFunctions(app, 'us-central1');
