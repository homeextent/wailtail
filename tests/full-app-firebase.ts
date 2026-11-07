import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, GoogleAuthProvider, initializeAuth, inMemoryPersistence } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

if (location.origin !== 'http://127.0.0.1:4178') throw new Error('Unexpected test browser origin.');
const projectId = 'demo-wailtail-stage3';
export const app = initializeApp({ projectId, apiKey: 'fake-key', storageBucket: `${projectId}.appspot.com` });
export const auth = initializeAuth(app, { persistence: inMemoryPersistence });
connectAuthEmulator(auth, 'http://127.0.0.1:9099');
export const db = getFirestore(app, 'ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e');
connectFirestoreEmulator(db, '127.0.0.1', 8080);
export const storage = getStorage(app);
connectStorageEmulator(storage, '127.0.0.1', 9199);
export const googleProvider = new GoogleAuthProvider();
export const messaging = null;
export const getMessagingInstance = async () => null;
