/**
 * Vercel Serverless Function: /api/authorize-approved-consignor
 * 
 * Trusted Server-Side Role Authorization Endpoint (Milestone M2.0B).
 * Verifies Firebase Authentication ID token, validates approved consignment applications,
 * atomically updates canonical profile roles across users/{uid} and bidders/{uid},
 * and safely links converted auctions without client-side privilege escalation.
 */

import { getFirebaseAdminServices, FirebaseAdminServices } from './_lib/firebaseAdmin.js';
import { isDesignatedAdminEmail, normalizeEmail } from '../../src/config/adminConfig.js';

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

export interface AuthorizeDependencies {
  adminServices?: Pick<FirebaseAdminServices, 'auth' | 'firestore'>;
}

export async function handleAuthorizeApprovedConsignor(
  req: any,
  res: any,
  deps?: AuthorizeDependencies
) {
  // CORS Preflight
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

  if (req.method && req.method !== 'POST') {
    return sendJson(res, 405, {
      success: false,
      error: 'Method not allowed. Use POST.'
    });
  }

  // 1. Verify Authorization Header
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
    console.error('[authorize-approved-consignor] Firebase Admin initialization failure:', initErr);
    return sendJson(res, 500, {
      success: false,
      error: 'Internal configuration error: Firebase Admin initialization failed.'
    });
  }

  const { auth, firestore } = services;

  // 2. Verify Firebase ID Token with revocation check (Milestone M2.0B Correction C)
  let decodedToken: any;
  try {
    decodedToken = await auth.verifyIdToken(idToken, true);
  } catch (verifyErr: any) {
    console.warn('[authorize-approved-consignor] Token verification rejected:', verifyErr?.message);
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

  // 3. Derive Identity Exclusively from Verified Token
  const verifiedUid = (decodedToken.uid || '').trim();
  const rawEmail = (decodedToken.email || '').trim();
  const verifiedEmail = normalizeEmail(rawEmail);
  const emailVerified = Boolean(decodedToken.email_verified);

  if (!verifiedUid || !verifiedEmail) {
    return sendJson(res, 400, {
      success: false,
      error: 'Invalid token: Verified token must contain valid uid and email claims.'
    });
  }

  // Reject unverified emails for consignor role authorization
  if (!emailVerified) {
    return sendJson(res, 403, {
      success: false,
      error: 'Email verification required before consignor authorization.',
      code: 'auth/unverified-email'
    });
  }

  const isDesignatedAdmin = isDesignatedAdminEmail(verifiedEmail);

  // 4. Query Matching Approved Consignment Applications
  // Note: We ignore any caller-supplied request body parameters (uid, email, role, etc.)
  try {
    const appsRef = firestore.collection('consignment_applications');
    const matchedAppDocs: any[] = [];

    // Primary: Query by normalized verified email
    const normSnap = await appsRef.where('sellerEmail', '==', verifiedEmail).get();
    normSnap.forEach((docSnap) => matchedAppDocs.push(docSnap));

    // Secondary: If raw token email casing differs, query by raw token email
    if (rawEmail !== verifiedEmail) {
      const rawSnap = await appsRef.where('sellerEmail', '==', rawEmail).get();
      rawSnap.forEach((docSnap) => {
        if (!matchedAppDocs.some((d) => d.id === docSnap.id)) {
          matchedAppDocs.push(docSnap);
        }
      });
    }

    // Tertiary: If historical records had un-normalized casing, check approved applications matching normalized email
    const hasApprovedDirectMatch = matchedAppDocs.some((d) => d.data()?.status === 'approved' && d.data()?.applicantType !== 'dealer' && !d.data()?.dealerId);
    if (!hasApprovedDirectMatch) {
      try {
        const approvedSnap = await appsRef.where('status', '==', 'approved').get();
        approvedSnap.forEach((docSnap) => {
          const docData = docSnap.data();
          if (docData && normalizeEmail(docData.sellerEmail) === verifiedEmail) {
            if (!matchedAppDocs.some((d) => d.id === docSnap.id)) {
              matchedAppDocs.push(docSnap);
            }
          }
        });
      } catch {
        // Fallback search is non-fatal
      }
    }

    // Quaternary: Best-effort check on legacy consignments collection
    if (!matchedAppDocs.some((d) => d.data()?.status === 'approved' && d.data()?.applicantType !== 'dealer' && !d.data()?.dealerId)) {
      const legacyRef = firestore.collection('consignments');
      const legNormSnap = await legacyRef.where('sellerEmail', '==', verifiedEmail).get();
      legNormSnap.forEach((docSnap) => {
        if (!matchedAppDocs.some((d) => d.id === docSnap.id)) {
          matchedAppDocs.push(docSnap);
        }
      });
      if (rawEmail !== verifiedEmail) {
        const legRawSnap = await legacyRef.where('sellerEmail', '==', rawEmail).get();
        legRawSnap.forEach((docSnap) => {
          if (!matchedAppDocs.some((d) => d.id === docSnap.id)) {
            matchedAppDocs.push(docSnap);
          }
        });
      }
    }

    const candidateAppRefs: any[] = [];
    const seenAppIds = new Set<string>();
    matchedAppDocs.forEach((docSnap) => {
      const data = docSnap.data();
      if (data && data.applicantType !== 'dealer' && !data.dealerId && data.status === 'approved' && !seenAppIds.has(docSnap.id)) {
        seenAppIds.add(docSnap.id);
        candidateAppRefs.push(docSnap.ref);
      }
    });

    // If no approved applications exist
    if (candidateAppRefs.length === 0) {
      return sendJson(res, 200, {
        success: true,
        authorized: false,
        role: isDesignatedAdmin ? 'admin' : 'bidder',
        uid: verifiedUid,
        reason: 'No approved consignment application found for this account.'
      });
    }

    // 5. Approved Consignor Candidate Identified — Determine Canonical Role
    // Root of Trust: Designated administrators are never downgraded to 'seller' or 'bidder'
    const targetRole: 'admin' | 'seller' = isDesignatedAdmin ? 'admin' : 'seller';

    const tokenDisplayName = (decodedToken.name || '').trim();
    const sellerResolvedName = tokenDisplayName || rawEmail.split('@')[0] || 'Seller';

    const userRef = firestore.collection('users').doc(verifiedUid);
    const bidderRef = firestore.collection('bidders').doc(verifiedUid);

    // 6. Execute Atomic Firestore Transaction with In-Transaction Approval Revalidation (Milestone M2.0B Correction D)
    interface TransactionAuthorizedResult {
      authorized: true;
      linkedAuctions: string[];
      missingAuctions: string[];
      conflicts: Array<{ auctionId: string; existingSellerId: string }>;
    }

    interface TransactionUnauthorizedResult {
      authorized: false;
      reason: string;
    }

    type TransactionResult = TransactionAuthorizedResult | TransactionUnauthorizedResult;

    const txResult: TransactionResult = await firestore.runTransaction(async (transaction: any) => {
      // Fresh transaction-local result collections for retry safety (Milestone M2.0B Correction D)
      const linkedAuctions: string[] = [];
      const missingAuctions: string[] = [];
      const conflicts: Array<{ auctionId: string; existingSellerId: string }> = [];

      // Step A: Revalidate candidate applications inside the transaction
      const eligibleApplications: any[] = [];
      for (const appRef of candidateAppRefs) {
        const appSnap = await transaction.get(appRef);
        if (appSnap.exists) {
          const appData = appSnap.data();
          if (
            appData &&
            appData.applicantType !== 'dealer' && !appData.dealerId &&
            appData.status === 'approved' &&
            normalizeEmail(appData.sellerEmail) === verifiedEmail
          ) {
            eligibleApplications.push({ id: appSnap.id, ...appData });
          }
        }
      }

      // If no eligible application remains, abort authorization inside transaction
      if (eligibleApplications.length === 0) {
        return {
          authorized: false,
          reason: 'No eligible approved consignment application found for this account.'
        };
      }

      // Step B: Derive candidate auction IDs strictly from the freshly revalidated applications
      const candidateAuctionIds = Array.from(
        new Set(
          eligibleApplications
            .map((app) => (app.convertedAuctionId ? String(app.convertedAuctionId).trim() : ''))
            .filter(Boolean)
        )
      );

      // Step C: Read canonical profile documents
      const userSnap = await transaction.get(userRef);
      const bidderSnap = await transaction.get(bidderRef);

      // Step D: Read candidate auction documents
      const auctionSnaps: Array<{ id: string; snap: any }> = [];
      for (const auctionId of candidateAuctionIds) {
        const aRef = firestore.collection('auctions').doc(auctionId);
        const aSnap = await transaction.get(aRef);
        auctionSnaps.push({ id: auctionId, snap: aSnap });
      }

      // Step E: Perform all writes after reads have concluded (Preserve read-before-write ordering)
      const now = Date.now();

      if (userSnap.exists) {
        transaction.set(
          userRef,
          {
            role: targetRole,
            isEmailVerified: true,
            updatedAt: now
          },
          { merge: true }
        );
      } else {
        transaction.set(userRef, {
          uid: verifiedUid,
          email: rawEmail,
          displayName: sellerResolvedName,
          role: targetRole,
          isEmailVerified: true,
          registeredAt: now,
          totalBidsPlaced: 0,
          highestBidPlaced: 0,
          updatedAt: now
        });
      }

      if (bidderSnap.exists) {
        transaction.set(
          bidderRef,
          {
            role: targetRole,
            isEmailVerified: true,
            updatedAt: now
          },
          { merge: true }
        );
      } else {
        transaction.set(bidderRef, {
          uid: verifiedUid,
          email: rawEmail,
          displayName: sellerResolvedName,
          role: targetRole,
          isEmailVerified: true,
          registeredAt: now,
          totalBidsPlaced: 0,
          highestBidPlaced: 0,
          updatedAt: now
        });
      }

      // Step F: Safely link converted auctions
      for (const item of auctionSnaps) {
        if (!item.snap.exists) {
          // Do not create missing auctions
          missingAuctions.push(item.id);
          continue;
        }

        const auctionData = item.snap.data() || {};
        if (auctionData.sellerType === 'dealer' || auctionData.dealerId) {
          conflicts.push({ auctionId: item.id, existingSellerId: auctionData.sellerId || '' });
          continue;
        }
        const existingSellerId = (auctionData.sellerId || '').trim();

        if (!existingSellerId || existingSellerId === verifiedUid) {
          // Safe to link or idempotently re-confirm
          transaction.set(
            item.snap.ref,
            {
              sellerId: verifiedUid,
              sellerName: sellerResolvedName,
              updatedAt: now
            },
            { merge: true }
          );
          linkedAuctions.push(item.id);
        } else {
          // Ownership conflict: auction is assigned to a different UID. Preserve existing assignment!
          conflicts.push({
            auctionId: item.id,
            existingSellerId
          });
        }
      }

      return {
        authorized: true,
        linkedAuctions,
        missingAuctions,
        conflicts
      };
    });

    if (txResult.authorized === false) {
      return sendJson(res, 403, {
        success: false,
        authorized: false,
        role: isDesignatedAdmin ? 'admin' : 'bidder',
        uid: verifiedUid,
        reason: txResult.reason,
        error: txResult.reason
      });
    }

    return sendJson(res, 200, {
      success: true,
      authorized: true,
      role: targetRole,
      uid: verifiedUid,
      linkedAuctions: txResult.linkedAuctions,
      missingAuctions: txResult.missingAuctions,
      conflicts: txResult.conflicts
    });
  } catch (err: any) {
    console.error('[authorize-approved-consignor] Error processing consignor authorization:', err);
    return sendJson(res, 500, {
      success: false,
      error: 'Failed to process consignor authorization.',
      details: err?.message || 'Internal server error'
    });
  }
}

export default async function handler(req: any, res: any) {
  return handleAuthorizeApprovedConsignor(req, res);
}
