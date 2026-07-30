import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyB4r5hRhisIfZccycP2QAyvOqIIkNnSpr0",
  authDomain: "link-app-965dd.firebaseapp.com",
  projectId: "link-app-965dd",
  storageBucket: "link-app-965dd.firebasestorage.app",
  messagingSenderId: "87561510798",
  appId: "1:87561510798:android:eddf7ce73737cdc7b7cedf",
};

// US market runs against a NAMED Firestore database ('usa') inside the same
// Firebase project. The Israeli app uses the project's default database.
// Dropping the second argument here would silently point this build at Israeli data.
export const US_DATABASE_ID = 'usa';
export const FUNCTIONS_REGION = 'us-central1';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, US_DATABASE_ID);
export const storage = getStorage(app);
export default app;