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

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;