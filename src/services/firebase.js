import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAUuvfc-I_ENDb8VJiaXplQt7P_gjUepcU",
  authDomain: "ambika-sandwitch.firebaseapp.com",
  projectId: "ambika-sandwitch",
  storageBucket: "ambika-sandwitch.firebasestorage.app",
  messagingSenderId: "362524732737",
  appId: "1:362524732737:web:e1cdd3eb0f5f374c8845c0",
  measurementId: "G-7P2DCYTLRQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);