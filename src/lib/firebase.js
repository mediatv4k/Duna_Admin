import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC8TmDTcb43a2jkUJBOquibEUzgmPh8fiQ",
  authDomain: "duna-admin.firebaseapp.com",
  projectId: "duna-admin",
  storageBucket: "duna-admin.firebasestorage.app",
  messagingSenderId: "18381986205",
  appId: "1:18381986205:web:02e6e7b3ed0395191db774"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
