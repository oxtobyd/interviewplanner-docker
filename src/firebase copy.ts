import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

//fynesys storage settings
const firebaseConfig = {
    apiKey: "AIzaSyBhvKkCscHwHS3jAjjTlGCwmWyALvbK51Q",
    authDomain: "yalp-9f1fd.firebaseapp.com",
    projectId: "yalp-9f1fd",
    storageBucket: "yalp-9f1fd.appspot.com",
    messagingSenderId: "972173559142",
    appId: "1:972173559142:web:1a32c58fec160dd32d34a7"
  };

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);