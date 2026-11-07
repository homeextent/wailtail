import * as admin from 'firebase-admin';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';

const firebaseAdmin = (admin as any).default || admin;

export const NAMED_FIRESTORE_DATABASE_ID =
  'ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e';

export interface FirebaseAdminServices {
  app: any;
  auth: Auth;
  firestore: Firestore;
}

let cachedServices: FirebaseAdminServices | null = null;

/**
 * Reusable Firebase Admin initialization with initialization guard and named database binding.
 * Reuses existing initialized apps when available.
 */
export function getFirebaseAdminServices(): FirebaseAdminServices {
  if (cachedServices && firebaseAdmin.apps.length > 0) {
    return cachedServices;
  }

  let app: any;
  if (firebaseAdmin.apps.length > 0) {
    app = firebaseAdmin.apps[0];
  } else {
    const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
    if (serviceAccountRaw) {
      try {
        const serviceAccount = JSON.parse(serviceAccountRaw);
        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        app = firebaseAdmin.initializeApp({
          credential: firebaseAdmin.credential.cert(serviceAccount)
        });
      } catch (err: any) {
        throw new Error(`Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY: ${err.message}`);
      }
    } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      app = firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
      });
    } else {
      // Default credentials / GCP environment
      app = firebaseAdmin.initializeApp();
    }
  }

  const auth = getAuth(app);
  // Explicitly binds to the project's named Firestore database instance
  const firestore = getFirestore(app, NAMED_FIRESTORE_DATABASE_ID);

  cachedServices = { app, auth, firestore };
  return cachedServices;
}

/**
 * Reset helper for testing environments.
 */
export function resetCachedServices(): void {
  cachedServices = null;
}
