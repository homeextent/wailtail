/**
 * Vercel Serverless Function: /api/admin-delete-user
 *
 * Trusted Server-Side Administrator Account Deletion Endpoint.
 * Strictly verifies administrator identity via Firebase Authentication ID tokens,
 * protects designated administrator accounts and prevents self-deletion,
 * performs server-side Firebase Authentication identity deletion, cleans up
 * profile records across users and bidders collections, and supports retry handling
 * for incomplete cleanup if subsequent Firestore operations fail.
 */

import { getFirebaseAdminServices, FirebaseAdminServices } from './_lib/firebaseAdmin';
import { DESIGNATED_ADMIN_EMAILS, isDesignatedAdminEmail, normalizeEmail } from '../../src/config/adminConfig';

function sendJson(res: any, status: number, data: any) {
  if (res.setHeader) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(data);
  }

  res.statusCode = status;
  res.end(JSON.stringify(data));
}

async function parseRequestBody(req: any): Promise<any> {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return new Promise((resolve) => {
    let bodyData = '';
    req.on('data', (chunk: any) => {
      bodyData += chunk;
    });
    req.on('end', () => {
      try {
        resolve(bodyData ? JSON.parse(bodyData) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

export interface AdminDeleteUserDependencies {
  adminServices?: Pick<FirebaseAdminServices, 'auth' | 'firestore'>;
}

export async function handleAdminDeleteUser(
  req: any,
  res: any,
  deps?: AdminDeleteUserDependencies
) {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    if (res.setHeader) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (typeof res.status === 'function') {
      return res.status(200).end();
    }
    res.statusCode = 200;
    return res.end();
  }

  // 2. Reject non-POST methods
  if (req.method !== 'POST') {
    return sendJson(res, 405, {
      success: false,
      error: 'Method not allowed. Use POST.',
      code: 'auth/method-not-allowed'
    });
  }

  // 3. Verify Authorization Header
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return sendJson(res, 401, {
      success: false,
      error: 'Unauthorized: Missing Authorization header.',
      code: 'auth/missing-token'
    });
  }

  const parts = authHeader.trim().split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer' || !parts[1]) {
    return sendJson(res, 401, {
      success: false,
      error: 'Unauthorized: Malformed Authorization header. Expected "Bearer <token>".',
      code: 'auth/malformed-token'
    });
  }

  const idToken = parts[1];

  let services: Pick<FirebaseAdminServices, 'auth' | 'firestore'>;
  try {
    services = deps?.adminServices || getFirebaseAdminServices();
  } catch (initErr: any) {
    console.error('[admin-delete-user] Firebase Admin initialization failure:', initErr);
    return sendJson(res, 500, {
      success: false,
      error: 'Internal configuration error: Firebase Admin initialization failed.'
    });
  }

  const { auth, firestore } = services;

  // 4. Verify Firebase ID Token with revocation check
  let decodedToken: any;
  try {
    decodedToken = await auth.verifyIdToken(idToken, true);
  } catch (verifyErr: any) {
    console.warn('[admin-delete-user] Token verification rejected:', verifyErr?.message);
    const errorCode = verifyErr?.code;
    const isRevoked = errorCode === 'auth/id-token-revoked';
    return sendJson(res, 401, {
      success: false,
      error: isRevoked
        ? 'Unauthorized: Firebase ID token has been revoked.'
        : 'Unauthorized: Invalid or expired Firebase ID token.',
      code: isRevoked ? 'auth/id-token-revoked' : 'auth/invalid-token'
    });
  }

  // 5. Derive Administrator Identity Exclusively from Verified Token
  const verifiedAdminUid = (decodedToken?.uid || '').trim();
  const rawAdminEmail = (decodedToken?.email || '').trim();
  const verifiedAdminEmail = normalizeEmail(rawAdminEmail);
  const emailVerified = Boolean(decodedToken?.email_verified);

  if (!verifiedAdminUid || !verifiedAdminEmail) {
    return sendJson(res, 401, {
      success: false,
      error: 'Invalid token: Verified token must contain valid uid and email claims.',
      code: 'auth/invalid-token'
    });
  }

  // Require verified email for administrative operations
  if (!emailVerified) {
    return sendJson(res, 403, {
      success: false,
      error: 'Email verification required for administrator privileges.',
      code: 'auth/unverified-email'
    });
  }

  // Require matching designated administrator allowlist
  if (!isDesignatedAdminEmail(verifiedAdminEmail)) {
    return sendJson(res, 403, {
      success: false,
      error: 'Forbidden: Authenticated caller is not a verified designated administrator.',
      code: 'auth/not-admin'
    });
  }

  // 6. Validate Target UID from Request Body
  let body: any;
  try {
    body = await parseRequestBody(req);
  } catch {
    body = {};
  }

  const rawTargetUid = body?.uid;
  if (typeof rawTargetUid !== 'string' || !rawTargetUid.trim()) {
    return sendJson(res, 400, {
      success: false,
      error: 'Missing or invalid target UID: A non-empty string "uid" is required in request body.',
      code: 'admin/invalid-target-uid'
    });
  }

  const cleanTargetUid = rawTargetUid.trim();

  // 7. Guard against self-deletion
  if (cleanTargetUid === verifiedAdminUid) {
    return sendJson(res, 400, {
      success: false,
      error: 'Self-deletion is not permitted. Active administrator accounts cannot delete themselves.',
      code: 'admin/self-deletion-forbidden'
    });
  }

  // 8. Protected Administrator Account Protection (Section 3)
  // Retrieve target from Firebase Auth to inspect authoritative email
  let targetAuthUser: any = null;
  let targetAuthAbsent = false;

  try {
    targetAuthUser = await auth.getUser(cleanTargetUid);
  } catch (getUserErr: any) {
    const errCode = getUserErr?.code || '';
    const errMsg = getUserErr?.message || '';
    if (errCode === 'auth/user-not-found' || errMsg.includes('user-not-found')) {
      targetAuthAbsent = true;
    } else {
      console.error('[admin-delete-user] Error inspecting target user in Firebase Auth:', getUserErr);
      return sendJson(res, 500, {
        success: false,
        error: 'Failed to inspect target user account in Firebase Auth.',
        code: 'admin/auth-error'
      });
    }
  }

  if (targetAuthUser) {
    const targetEmail = normalizeEmail(targetAuthUser.email);
    if (isDesignatedAdminEmail(targetEmail)) {
      return sendJson(res, 403, {
        success: false,
        error: 'Forbidden: Protected administrator accounts cannot be deleted.',
        code: 'admin/protected-account'
      });
    }
  }

  // Independently resolve designated administrator accounts using getUserByEmail()
  // and the existing DESIGNATED_ADMIN_EMAILS allowlist
  const protectedAdminUids = new Set<string>();
  for (const adminEmail of DESIGNATED_ADMIN_EMAILS) {
    const normalizedAdminEmail = normalizeEmail(adminEmail);
    if (!normalizedAdminEmail) continue;
    try {
      const adminRecord = await auth.getUserByEmail(normalizedAdminEmail);
      if (adminRecord?.uid) {
        protectedAdminUids.add(adminRecord.uid);
      }
    } catch (lookupErr: any) {
      const errCode = lookupErr?.code || '';
      const errMsg = lookupErr?.message || '';
      if (errCode === 'auth/user-not-found' || errMsg.includes('user-not-found')) {
        // Designated admin not present in Auth
        continue;
      }
      console.error(`[admin-delete-user] Failed to resolve protected administrator (${normalizedAdminEmail}):`, lookupErr);
      return sendJson(res, 500, {
        success: false,
        error: 'Failed to resolve protected administrator accounts.',
        code: 'admin/auth-error'
      });
    }
  }

  if (protectedAdminUids.has(cleanTargetUid)) {
    return sendJson(res, 403, {
      success: false,
      error: 'Forbidden: Protected administrator accounts cannot be deleted.',
      code: 'admin/protected-account'
    });
  }

  // 9. Server-Side Firebase Authentication Identity Deletion
  if (!targetAuthAbsent) {
    try {
      await auth.deleteUser(cleanTargetUid);
      console.log(`[admin-delete-user] Deleted auth identity for ${cleanTargetUid} by admin ${verifiedAdminUid}`);
    } catch (deleteErr: any) {
      const errCode = deleteErr?.code || '';
      const errMsg = deleteErr?.message || '';
      if (errCode === 'auth/user-not-found' || errMsg.includes('user-not-found')) {
        // Identity already absent (e.g. concurrent deletion or retry)
        console.warn(`[admin-delete-user] Target user ${cleanTargetUid} already deleted from Auth.`);
      } else {
        console.error('[admin-delete-user] Failed to delete user from Firebase Auth:', deleteErr);
        return sendJson(res, 500, {
          success: false,
          error: 'Failed to delete user identity from Firebase Authentication.',
          code: 'admin/auth-deletion-failed'
        });
      }
    }
  }

  // 10. Server-Side Firestore Cleanup across users and bidders collections
  try {
    const docRefsMap = new Map<string, any>();

    // Direct doc references
    const directUserRef = firestore.collection('users').doc(cleanTargetUid);
    docRefsMap.set(directUserRef.path, directUserRef);

    const directBidderRef = firestore.collection('bidders').doc(cleanTargetUid);
    docRefsMap.set(directBidderRef.path, directBidderRef);

    // Exact-UID queries to resolve legacy document documents
    const userUidSnap = await firestore
      .collection('users')
      .where('uid', '==', cleanTargetUid)
      .get();
    userUidSnap.forEach((docSnap: any) => {
      docRefsMap.set(docSnap.ref.path, docSnap.ref);
    });

    const bidderUidSnap = await firestore
      .collection('bidders')
      .where('uid', '==', cleanTargetUid)
      .get();
    bidderUidSnap.forEach((docSnap: any) => {
      docRefsMap.set(docSnap.ref.path, docSnap.ref);
    });

    // Deduplicate references and delete in safe batch chunks (Firestore limit: 500)
    const uniqueRefs = Array.from(docRefsMap.values());
    const BATCH_SIZE = 500;
    for (let i = 0; i < uniqueRefs.length; i += BATCH_SIZE) {
      const batch = firestore.batch();
      const chunk = uniqueRefs.slice(i, i + BATCH_SIZE);
      for (const ref of chunk) {
        batch.delete(ref);
      }
      await batch.commit();
    }

    return sendJson(res, 200, {
      success: true,
      uid: cleanTargetUid,
      deletedDocsCount: uniqueRefs.length,
      message: 'User account and profile records deleted successfully.'
    });
  } catch (cleanupErr: any) {
    console.error('[admin-delete-user] Incomplete deletion - Firestore cleanup failure:', cleanupErr);
    return sendJson(res, 500, {
      success: false,
      error: 'Incomplete deletion: User Auth identity was deleted, but Firestore document cleanup failed.',
      code: 'admin/incomplete-deletion',
      uid: cleanTargetUid
    });
  }
}

export default async function handler(req: any, res: any) {
  return handleAdminDeleteUser(req, res);
}
