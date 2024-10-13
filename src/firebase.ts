import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

//YaLP storage settings
const firebaseConfig = {
  apiKey: "AIzaSyApS6_LdhAqKTl8Z0JLWqa2fGZUw10nD4Y",
  authDomain: "yalp-77a29.firebaseapp.com",
  databaseURL: "https://yalp-77a29-default-rtdb.firebaseio.com",
  projectId: "yalp-77a29",
  storageBucket: "yalp-77a29.appspot.com",
  messagingSenderId: "13179626113",
  appId: "1:13179626113:web:a60b5d4f5fd678d1502380",
  measurementId: "G-NHQCPB41Y9"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);