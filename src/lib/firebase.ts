import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBn4IJp4Y58E8hoLr3qJ3RM7f3AJIxD1I4",
  authDomain: "partssr.firebaseapp.com",
  databaseURL: "https://partssr-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "partssr",
  storageBucket: "partssr.firebasestorage.app",
  messagingSenderId: "170192235843",
  appId: "1:170192235843:web:e94eb765a20081e7ae93f6",
  measurementId: "G-E99627W9KP"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
export const storage = getStorage(app);
export default app;