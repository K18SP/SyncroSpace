
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, FacebookAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Surface missing env vars early to avoid silent 401s from Identity Toolkit
const requiredEnvKeys = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
];

const missingEnvKeys = requiredEnvKeys.filter((key) => !process.env[key]);
if (missingEnvKeys.length > 0) {
  // eslint-disable-next-line no-console
  console.error(
    `Missing Firebase environment variables: ${missingEnvKeys.join(', ')}. ` +
      'Create .env.local with your Firebase Web app config and restart the dev server.'
  );
}

// In development, log which envs are present (partial values only)
if (process.env.NODE_ENV !== 'production') {
  const preview = (value?: string) => (value ? `${value.slice(0, 6)}…` : 'undefined');
  // eslint-disable-next-line no-console
  console.info('Firebase env check:', {
    NEXT_PUBLIC_FIREBASE_API_KEY: preview(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: preview(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: preview(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    NEXT_PUBLIC_FIREBASE_APP_ID: preview(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
  });
}

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const googleProvider = new GoogleAuthProvider();
const facebookProvider = new FacebookAuthProvider();

export { app, auth, db, storage, googleProvider, facebookProvider };
