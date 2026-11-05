import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { handleAuthorizeApprovedConsignor } from '../api/authorize-approved-consignor';
import { evaluateAdminAuthority, isDesignatedAdminEmail } from '../src/config/adminConfig';

interface MockDocData {
  [key: string]: any;
}

function createMockResponse() {
  const res: any = {
    statusCode: 200,
    headers: {},
    data: null,
    setHeader(key: string, value: string) {
      this.headers[key] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.data = payload;
      return this;
    },
    end(payload?: any) {
      if (payload && !this.data) {
        try {
          this.data = JSON.parse(payload);
        } catch {
          this.data = payload;
        }
      }
      return this;
    }
  };
  return res;
}

function createMockFirestore() {
  const store = new Map<string, MockDocData>();

  function makeDocRef(colName: string, docId: string) {
    const fullPath = `${colName}/${docId}`;
    return {
      id: docId,
      path: fullPath,
      parent: { id: colName }
    };
  }

  function getDoc(colName: string, docId: string) {
    const fullPath = `${colName}/${docId}`;
    const data = store.get(fullPath);
    return {
      id: docId,
      exists: data !== undefined,
      data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
      ref: makeDocRef(colName, docId)
    };
  }

  const firestore: any = {
    _store: store,
    _retryCount: 0,
    _attemptCount: 0,
    _beforeTransaction: null,
    _beforeRetry: null,
    collection(colName: string) {
      return {
        doc(docId: string) {
          return makeDocRef(colName, docId);
        },
        where(field: string, op: string, value: any) {
          return {
            async get() {
              const matchedDocs: any[] = [];
              for (const [key, data] of store.entries()) {
                if (key.startsWith(`${colName}/`)) {
                  const docId = key.split('/')[1];
                  if (op === '==' && data[field] === value) {
                    matchedDocs.push({
                      id: docId,
                      data: () => JSON.parse(JSON.stringify(data)),
                      ref: makeDocRef(colName, docId)
                    });
                  }
                }
              }
              return {
                empty: matchedDocs.length === 0,
                docs: matchedDocs,
                forEach(cb: (doc: any) => void) {
                  matchedDocs.forEach(cb);
                }
              };
            }
          };
        }
      };
    },
    async runTransaction(updateFunction: (transaction: any) => Promise<any>) {
      if (firestore._beforeTransaction) {
        await firestore._beforeTransaction(store);
      }

      let attempt = 0;
      const retryCount = firestore._retryCount || 0;

      while (true) {
        attempt++;
        firestore._attemptCount = attempt;
        const stagedWrites = new Map<string, MockDocData>();

        const transaction = {
          async get(docRef: any) {
            const colName = docRef.parent.id;
            const docId = docRef.id;
            const fullPath = `${colName}/${docId}`;
            if (stagedWrites.has(fullPath)) {
              const data = stagedWrites.get(fullPath);
              return {
                id: docId,
                exists: data !== undefined,
                data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
                ref: docRef
              };
            }
            return getDoc(colName, docId);
          },
          set(docRef: any, data: any, options?: { merge?: boolean }) {
            const fullPath = `${docRef.parent.id}/${docRef.id}`;
            if (options?.merge && store.has(fullPath)) {
              const existing = store.get(fullPath) || {};
              stagedWrites.set(fullPath, { ...existing, ...data });
            } else {
              stagedWrites.set(fullPath, { ...data });
            }
          }
        };

        const result = await updateFunction(transaction);

        if (attempt <= retryCount) {
          if (firestore._beforeRetry) {
            await firestore._beforeRetry(attempt, store);
          }
          continue;
        }

        // Commit staged writes
        for (const [key, value] of stagedWrites.entries()) {
          store.set(key, value);
        }

        return result;
      }
    }
  };

  return firestore;
}

function createMockAuth(validTokens: Record<string, any> = {}) {
  const verifyCalls: Array<{ token: string; checkRevoked?: boolean }> = [];
  return {
    verifyCalls,
    async verifyIdToken(token: string, checkRevoked?: boolean) {
      verifyCalls.push({ token, checkRevoked });
      if (token === 'revoked-token') {
        const err: any = new Error('Firebase ID token has been revoked.');
        err.code = 'auth/id-token-revoked';
        throw err;
      }
      if (token === 'expired-token') {
        const err: any = new Error('Firebase ID token has expired.');
        err.code = 'auth/id-token-expired';
        throw err;
      }
      if (token === 'invalid-token') {
        const err: any = new Error('Firebase ID token is invalid.');
        err.code = 'auth/argument-error';
        throw err;
      }
      if (validTokens[token]) {
        return validTokens[token];
      }
      throw new Error(`Token "${token}" not recognized by mock auth.`);
    }
  };
}

describe('M2.0B — /api/authorize-approved-consignor Endpoint Tests', () => {
  let mockStore: any;
  let mockAuth: any;
  const SELLER_EMAIL = 'approved.consignor@wailtail.com';
  const SELLER_UID = 'seller-user-uid-123';
  const VALID_TOKEN = 'token-approved-consignor';
  const ADMIN_EMAIL = 'jeremygoodmurphy@gmail.com';
  const ADMIN_UID = 'admin-user-uid-456';
  const ADMIN_TOKEN = 'token-admin';

  beforeEach(() => {
    mockStore = createMockFirestore();
    mockAuth = createMockAuth({
      [VALID_TOKEN]: {
        uid: SELLER_UID,
        email: SELLER_EMAIL,
        email_verified: true,
        name: 'Approved Consignor'
      },
      [ADMIN_TOKEN]: {
        uid: ADMIN_UID,
        email: ADMIN_EMAIL,
        email_verified: true,
        name: 'Jeremy Admin'
      },
      'token-unverified': {
        uid: 'unverified-uid',
        email: 'unverified@wailtail.com',
        email_verified: false
      },
      'token-no-email': {
        uid: 'no-email-uid',
        email_verified: true
      },
      'token-ordinary': {
        uid: 'ordinary-bidder-uid',
        email: 'ordinary@wailtail.com',
        email_verified: true
      }
    });
  });

  // 9.1 Endpoint authentication tests
  describe('9.1 Endpoint Authentication', () => {
    test('Rejects request with missing Authorization header', async () => {
      const req = { method: 'POST', headers: {} };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(res.data?.code, 'auth/missing-token');
    });

    test('Rejects request with malformed Bearer token', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: 'Basic some-credentials' }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(res.data?.code, 'auth/malformed-token');
    });

    test('Rejects invalid token', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer invalid-token' }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(res.data?.code, 'auth/invalid-token');
    });

    test('Rejects expired token', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer expired-token' }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(res.data?.code, 'auth/invalid-token');
    });

    test('Rejects revoked token (Correction C)', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer revoked-token' }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(res.data?.code, 'auth/id-token-revoked');
      assert.match(res.data?.error, /revoked/i);
    });

    test('Passes checkRevoked: true to verifyIdToken (Correction C)', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${VALID_TOKEN}` }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(mockAuth.verifyCalls.length, 1);
      assert.strictEqual(mockAuth.verifyCalls[0].token, VALID_TOKEN);
      assert.strictEqual(mockAuth.verifyCalls[0].checkRevoked, true);
    });

    test('Failed token verification produces no Firestore writes', async () => {
      // Seed an approved application in store
      mockStore._store.set('consignment_applications/app-revoked-test', {
        sellerEmail: SELLER_EMAIL,
        status: 'approved',
        convertedAuctionId: 'auction-revoked-test'
      });
      mockStore._store.set('auctions/auction-revoked-test', {
        id: 'auction-revoked-test',
        title: 'Revoked Test Lot'
      });

      const initialStoreSize = mockStore._store.size;

      // 1. Try with revoked token
      const resRevoked = createMockResponse();
      await handleAuthorizeApprovedConsignor(
        { method: 'POST', headers: { authorization: 'Bearer revoked-token' } },
        resRevoked,
        { adminServices: { auth: mockAuth, firestore: mockStore } }
      );
      assert.strictEqual(resRevoked.statusCode, 401);
      assert.strictEqual(mockStore._store.size, initialStoreSize);
      assert.strictEqual(mockStore._store.has(`users/${SELLER_UID}`), false);
      assert.strictEqual(mockStore._store.get('auctions/auction-revoked-test').sellerId, undefined);

      // 2. Try with expired token
      const resExpired = createMockResponse();
      await handleAuthorizeApprovedConsignor(
        { method: 'POST', headers: { authorization: 'Bearer expired-token' } },
        resExpired,
        { adminServices: { auth: mockAuth, firestore: mockStore } }
      );
      assert.strictEqual(resExpired.statusCode, 401);
      assert.strictEqual(mockStore._store.size, initialStoreSize);
      assert.strictEqual(mockStore._store.has(`users/${SELLER_UID}`), false);

      // 3. Try with unverified email token
      const resUnverified = createMockResponse();
      await handleAuthorizeApprovedConsignor(
        { method: 'POST', headers: { authorization: 'Bearer token-unverified' } },
        resUnverified,
        { adminServices: { auth: mockAuth, firestore: mockStore } }
      );
      assert.strictEqual(resUnverified.statusCode, 403);
      assert.strictEqual(mockStore._store.size, initialStoreSize);
      assert.strictEqual(mockStore._store.has('users/unverified-uid'), false);
    });

    test('Rejects token with missing email claim', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer token-no-email' }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.data?.success, false);
    });

    test('Rejects token with unverified email', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer token-unverified' }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(res.data?.code, 'auth/unverified-email');
    });

    test('OPTIONS request returns 200 with CORS headers', async () => {
      const req = { method: 'OPTIONS', headers: {} };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['Access-Control-Allow-Origin'], '*');
    });

    test('Rejects non-POST methods with 405', async () => {
      const req = { method: 'GET', headers: {} };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 405);
      assert.strictEqual(res.data?.success, false);
    });
  });

  // 9.2 Consignor authorization tests
  describe('9.2 Consignor Authorization Decisions', () => {
    test('Promotes user when matching application has status: "approved"', async () => {
      mockStore._store.set('consignment_applications/app-1', {
        sellerEmail: SELLER_EMAIL,
        status: 'approved',
        convertedAuctionId: 'auction-123'
      });
      mockStore._store.set('auctions/auction-123', {
        id: 'auction-123',
        title: '1988 Porsche 928 S4'
      });

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${VALID_TOKEN}` }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data?.success, true);
      assert.strictEqual(res.data?.authorized, true);
      assert.strictEqual(res.data?.role, 'seller');
      assert.strictEqual(res.data?.uid, SELLER_UID);
      assert.deepStrictEqual(res.data?.linkedAuctions, ['auction-123']);
    });

    test('Does not promote user when application has status: "pending"', async () => {
      mockStore._store.set('consignment_applications/app-pending', {
        sellerEmail: 'ordinary@wailtail.com',
        status: 'pending'
      });

      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer token-ordinary' }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data?.success, true);
      assert.strictEqual(res.data?.authorized, false);
      assert.strictEqual(res.data?.role, 'bidder');
    });

    test('Does not promote user when application has status: "rejected"', async () => {
      mockStore._store.set('consignment_applications/app-rejected', {
        sellerEmail: 'ordinary@wailtail.com',
        status: 'rejected'
      });

      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer token-ordinary' }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data?.success, true);
      assert.strictEqual(res.data?.authorized, false);
      assert.strictEqual(res.data?.role, 'bidder');
    });

    test('Does not promote user when no application exists', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer token-ordinary' }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data?.success, true);
      assert.strictEqual(res.data?.authorized, false);
      assert.strictEqual(res.data?.role, 'bidder');
    });

    test('Handles historical mixed-case email matching safely', async () => {
      mockStore._store.set('consignment_applications/app-casing', {
        sellerEmail: 'Approved.Consignor@WailTail.COM',
        status: 'approved',
        convertedAuctionId: 'auction-case-test'
      });
      mockStore._store.set('auctions/auction-case-test', {
        id: 'auction-case-test',
        title: 'Chassis Test Lot'
      });

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${VALID_TOKEN}` }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data?.authorized, true);
      assert.strictEqual(res.data?.role, 'seller');
    });

    test('Strictly ignores request body fields (uid, email, role, registeredUserId)', async () => {
      mockStore._store.set('consignment_applications/app-target', {
        sellerEmail: SELLER_EMAIL,
        status: 'approved',
        registeredUserId: 'historical-stale-uid'
      });

      // Rogue body attempts to forge identity and role
      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
        body: {
          uid: 'forged-uid',
          email: 'forged@admin.com',
          role: 'admin',
          registeredUserId: 'forged-reg-id'
        }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data?.authorized, true);
      assert.strictEqual(res.data?.uid, SELLER_UID); // Derived strictly from verified token!
      assert.strictEqual(res.data?.role, 'seller'); // Caller cannot inject admin role!
    });

    test('Strictly ignores request body field role: "seller"', async () => {
      // Ordinary user with no approved applications attempts to supply role: 'seller' in body
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer token-ordinary' },
        body: {
          role: 'seller',
          email: 'ordinary@wailtail.com'
        }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data?.authorized, false);
      assert.strictEqual(res.data?.role, 'bidder');
    });
  });

  // 9.3 Profile update tests
  describe('9.3 Profile Updates & Idempotency', () => {
    test('Both users/{uid} and bidders/{uid} canonical profiles receive seller role', async () => {
      mockStore._store.set(`users/${SELLER_UID}`, {
        uid: SELLER_UID,
        email: SELLER_EMAIL,
        role: 'bidder',
        displayName: 'Consignor Member',
        totalBidsPlaced: 5
      });
      mockStore._store.set(`bidders/${SELLER_UID}`, {
        uid: SELLER_UID,
        email: SELLER_EMAIL,
        role: 'bidder',
        displayName: 'Consignor Member',
        totalBidsPlaced: 5
      });
      mockStore._store.set('consignment_applications/app-profile-test', {
        sellerEmail: SELLER_EMAIL,
        status: 'approved'
      });

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${VALID_TOKEN}` }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data?.authorized, true);

      const updatedUser = mockStore._store.get(`users/${SELLER_UID}`);
      const updatedBidder = mockStore._store.get(`bidders/${SELLER_UID}`);

      assert.strictEqual(updatedUser.role, 'seller');
      assert.strictEqual(updatedBidder.role, 'seller');
      // Existing fields preserved
      assert.strictEqual(updatedUser.totalBidsPlaced, 5);
      assert.strictEqual(updatedBidder.totalBidsPlaced, 5);
    });

    test('Creates missing canonical user and bidder documents if missing', async () => {
      mockStore._store.set('consignment_applications/app-create-test', {
        sellerEmail: SELLER_EMAIL,
        status: 'approved'
      });

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${VALID_TOKEN}` }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 200);
      const createdUser = mockStore._store.get(`users/${SELLER_UID}`);
      const createdBidder = mockStore._store.get(`bidders/${SELLER_UID}`);

      assert.ok(createdUser, 'users/{uid} document must be created');
      assert.ok(createdBidder, 'bidders/{uid} document must be created');
      assert.strictEqual(createdUser.role, 'seller');
      assert.strictEqual(createdBidder.role, 'seller');
      assert.strictEqual(createdUser.email, SELLER_EMAIL);
    });

    test('Designated administrator is NEVER downgraded to seller or bidder', async () => {
      mockStore._store.set('consignment_applications/app-admin-lot', {
        sellerEmail: ADMIN_EMAIL,
        status: 'approved',
        convertedAuctionId: 'admin-lot-1'
      });
      mockStore._store.set('auctions/admin-lot-1', {
        id: 'admin-lot-1',
        title: 'Admin Curated Lot'
      });

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data?.authorized, true);
      assert.strictEqual(res.data?.role, 'admin'); // Admin role preserved!

      const adminUser = mockStore._store.get(`users/${ADMIN_UID}`);
      assert.strictEqual(adminUser?.role, 'admin');
    });

    test('Repeated requests are safe and idempotent', async () => {
      mockStore._store.set('consignment_applications/app-idempotent', {
        sellerEmail: SELLER_EMAIL,
        status: 'approved',
        convertedAuctionId: 'idempotent-auction'
      });
      mockStore._store.set('auctions/idempotent-auction', {
        id: 'idempotent-auction',
        title: 'Idempotency Lot'
      });

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${VALID_TOKEN}` }
      };

      // Call 1
      const res1 = createMockResponse();
      await handleAuthorizeApprovedConsignor(req, res1, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });
      assert.strictEqual(res1.data?.authorized, true);

      // Call 2
      const res2 = createMockResponse();
      await handleAuthorizeApprovedConsignor(req, res2, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });
      assert.strictEqual(res2.data?.authorized, true);
      assert.strictEqual(res2.data?.role, 'seller');
      assert.deepStrictEqual(res2.data?.linkedAuctions, ['idempotent-auction']);
    });

    test('Transaction write failure returns 500 and does not report success', async () => {
      mockStore._store.set('consignment_applications/app-fail', {
        sellerEmail: SELLER_EMAIL,
        status: 'approved'
      });

      // Inject transaction failure
      const failingStore = {
        ...mockStore,
        async runTransaction() {
          throw new Error('Simulated atomic transaction write failure');
        }
      };

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${VALID_TOKEN}` }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: failingStore }
      });

      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(res.data?.authorized, undefined);
    });
  });

  // 9.4 Auction linkage tests
  describe('9.4 Seller-to-Auction Linkage', () => {
    test('Links converted auction referenced by approved application', async () => {
      mockStore._store.set('consignment_applications/app-link', {
        sellerEmail: SELLER_EMAIL,
        status: 'approved',
        convertedAuctionId: 'converted-lot-101'
      });
      mockStore._store.set('auctions/converted-lot-101', {
        id: 'converted-lot-101',
        title: '2004 Porsche 911 GT3',
        location: 'Toronto, ON, Canada'
      });

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${VALID_TOKEN}` }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.data?.linkedAuctions, ['converted-lot-101']);

      const auction = mockStore._store.get('auctions/converted-lot-101');
      assert.strictEqual(auction.sellerId, SELLER_UID);
      assert.strictEqual(auction.sellerName, 'Approved Consignor');
      assert.strictEqual(auction.location, 'Toronto, ON, Canada'); // existing field preserved
    });

    test('Does not overwrite an auction already assigned to another seller UID', async () => {
      const OTHER_SELLER_UID = 'original-owner-uid';
      mockStore._store.set('consignment_applications/app-conflict', {
        sellerEmail: SELLER_EMAIL,
        status: 'approved',
        convertedAuctionId: 'auction-conflict-lot'
      });
      mockStore._store.set('auctions/auction-conflict-lot', {
        id: 'auction-conflict-lot',
        title: 'Conflict Lot',
        sellerId: OTHER_SELLER_UID,
        sellerName: 'Original Seller'
      });

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${VALID_TOKEN}` }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data?.authorized, true);
      assert.strictEqual(res.data?.linkedAuctions.length, 0);
      assert.strictEqual(res.data?.conflicts.length, 1);
      assert.strictEqual(res.data?.conflicts[0].auctionId, 'auction-conflict-lot');
      assert.strictEqual(res.data?.conflicts[0].existingSellerId, OTHER_SELLER_UID);

      // Ownership in Firestore was preserved
      const auction = mockStore._store.get('auctions/auction-conflict-lot');
      assert.strictEqual(auction.sellerId, OTHER_SELLER_UID);
      assert.strictEqual(auction.sellerName, 'Original Seller');
    });

    test('Does not create a missing auction document', async () => {
      mockStore._store.set('consignment_applications/app-missing-lot', {
        sellerEmail: SELLER_EMAIL,
        status: 'approved',
        convertedAuctionId: 'non-existent-auction-lot'
      });

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${VALID_TOKEN}` }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.data?.missingAuctions, ['non-existent-auction-lot']);
      assert.strictEqual(mockStore._store.has('auctions/non-existent-auction-lot'), false);
    });

    test('Handles multiple approved applications safely', async () => {
      mockStore._store.set('consignment_applications/app-multi-1', {
        sellerEmail: SELLER_EMAIL,
        status: 'approved',
        convertedAuctionId: 'auction-lot-1'
      });
      mockStore._store.set('consignment_applications/app-multi-2', {
        sellerEmail: SELLER_EMAIL,
        status: 'approved',
        convertedAuctionId: 'auction-lot-2'
      });
      mockStore._store.set('auctions/auction-lot-1', { id: 'auction-lot-1', title: 'Lot 1' });
      mockStore._store.set('auctions/auction-lot-2', { id: 'auction-lot-2', title: 'Lot 2' });

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${VALID_TOKEN}` }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.data?.linkedAuctions.sort(), ['auction-lot-1', 'auction-lot-2'].sort());
      assert.strictEqual(mockStore._store.get('auctions/auction-lot-1').sellerId, SELLER_UID);
      assert.strictEqual(mockStore._store.get('auctions/auction-lot-2').sellerId, SELLER_UID);
    });

    test('Unrelated applications for different email do not link auctions', async () => {
      mockStore._store.set('consignment_applications/app-unrelated', {
        sellerEmail: 'unrelated@wailtail.com',
        status: 'approved',
        convertedAuctionId: 'unrelated-auction-lot'
      });
      mockStore._store.set('auctions/unrelated-auction-lot', {
        id: 'unrelated-auction-lot',
        title: 'Unrelated Lot'
      });

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${VALID_TOKEN}` } // SELLER_EMAIL != unrelated@wailtail.com
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data?.authorized, false);
      assert.strictEqual(res.data?.role, 'bidder');
      assert.strictEqual(mockStore._store.get('auctions/unrelated-auction-lot').sellerId, undefined);
    });
  });

  // 9.5 Administrative root of trust and email verification authority tests (Correction A)
  describe('9.5 Administrative Root of Trust & Email Verification Authority (Correction A)', () => {
    test('Allowlisted but unverified account is not an administrator', () => {
      // Primary designated admin unverified
      const isAdmin1 = evaluateAdminAuthority({
        email: 'jeremygoodmurphy@gmail.com',
        emailVerified: false
      });
      assert.strictEqual(isAdmin1, false);

      // Secondary designated admin unverified
      const isAdmin2 = evaluateAdminAuthority({
        email: 'jeremy@theinnovativegroup.ca',
        emailVerified: false
      });
      assert.strictEqual(isAdmin2, false);
    });

    test('Verified non-allowlisted account is not an administrator', () => {
      const isOrdinaryAdmin = evaluateAdminAuthority({
        email: 'ordinary.bidder@example.com',
        emailVerified: true
      });
      assert.strictEqual(isOrdinaryAdmin, false);

      const isConsignorAdmin = evaluateAdminAuthority({
        email: 'seller@wailtail.com',
        emailVerified: true
      });
      assert.strictEqual(isConsignorAdmin, false);
    });

    test('Verified allowlisted account is an administrator', () => {
      const isAdmin1 = evaluateAdminAuthority({
        email: 'jeremygoodmurphy@gmail.com',
        emailVerified: true
      });
      assert.strictEqual(isAdmin1, true);

      const isAdmin2 = evaluateAdminAuthority({
        email: 'jeremy@theinnovativegroup.ca',
        emailVerified: true
      });
      assert.strictEqual(isAdmin2, true);

      // Mixed-case normalization check
      const isAdminMixed = evaluateAdminAuthority({
        email: 'JeremyGoodMurphy@Gmail.COM',
        emailVerified: true
      });
      assert.strictEqual(isAdminMixed, true);
    });

    test('Firestore isEmailVerified: true field cannot override user.emailVerified === false', () => {
      // Allowlisted email with Firestore isEmailVerified: true but Firebase Auth user.emailVerified: false
      const isAdmin = evaluateAdminAuthority(
        { email: 'jeremygoodmurphy@gmail.com', emailVerified: false },
        { isEmailVerified: true, role: 'admin' }
      );
      assert.strictEqual(isAdmin, false, 'Firestore profile isEmailVerified: true must NOT bypass unverified Firebase Auth state');
    });

    test('Firestore role: "admin" cannot establish administrator privileges for non-allowlisted user', () => {
      const isAdmin = evaluateAdminAuthority(
        { email: 'attacker@evil.com', emailVerified: true },
        { role: 'admin', isEmailVerified: true }
      );
      assert.strictEqual(isAdmin, false, 'Mutable Firestore profile role must NOT establish admin authority');
    });

    test('Unauthenticated or missing user cannot be an administrator', () => {
      assert.strictEqual(evaluateAdminAuthority(null), false);
      assert.strictEqual(evaluateAdminAuthority(undefined), false);
      assert.strictEqual(evaluateAdminAuthority({ email: null, emailVerified: true }), false);
      assert.strictEqual(evaluateAdminAuthority({ email: '', emailVerified: true }), false);
    });
  });

  // 9.6 Transactional approval revalidation and retry-safe results (Correction D)
  describe('9.6 Transactional Approval Revalidation & Retry-Safe Results (Correction D)', () => {
    test('Test 1 — Application approval revoked before transaction authorization', async () => {
      // 1. Initial application is approved and returned by pre-transaction query
      mockStore._store.set('consignment_applications/app-revoked-before-tx', {
        sellerEmail: SELLER_EMAIL,
        status: 'approved',
        convertedAuctionId: 'auction-revoked-before-tx'
      });
      mockStore._store.set('auctions/auction-revoked-before-tx', {
        id: 'auction-revoked-before-tx',
        title: 'Revoked Before TX Lot'
      });

      // 2. Before the transaction performs its authoritative application read, change status to 'revoked'
      mockStore._beforeTransaction = (store: Map<string, any>) => {
        store.set('consignment_applications/app-revoked-before-tx', {
          sellerEmail: SELLER_EMAIL,
          status: 'revoked',
          convertedAuctionId: 'auction-revoked-before-tx'
        });
      };

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${VALID_TOKEN}` }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      // Assertions
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.data?.authorized, false);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(mockStore._store.has(`users/${SELLER_UID}`), false, 'No user profile promotion');
      assert.strictEqual(mockStore._store.has(`bidders/${SELLER_UID}`), false, 'No bidder profile promotion');
      const auction = mockStore._store.get('auctions/auction-revoked-before-tx');
      assert.strictEqual(auction.sellerId, undefined, 'No auction seller assignment');
      assert.strictEqual(auction.sellerName, undefined);
    });

    test('Test 2 — Application approval remains valid', async () => {
      mockStore._store.set('consignment_applications/app-remains-valid', {
        sellerEmail: SELLER_EMAIL,
        status: 'approved',
        convertedAuctionId: 'auction-remains-valid'
      });
      mockStore._store.set('auctions/auction-remains-valid', {
        id: 'auction-remains-valid',
        title: 'Remains Valid Lot'
      });

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${VALID_TOKEN}` }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      // Assertions
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data?.success, true);
      assert.strictEqual(res.data?.authorized, true);
      assert.strictEqual(res.data?.role, 'seller');
      assert.strictEqual(res.data?.uid, SELLER_UID);
      assert.deepStrictEqual(res.data?.linkedAuctions, ['auction-remains-valid']);
      assert.deepStrictEqual(res.data?.missingAuctions, []);
      assert.deepStrictEqual(res.data?.conflicts, []);

      // Verify user and bidder profile promotion
      const user = mockStore._store.get(`users/${SELLER_UID}`);
      const bidder = mockStore._store.get(`bidders/${SELLER_UID}`);
      assert.ok(user, 'User document must exist');
      assert.ok(bidder, 'Bidder document must exist');
      assert.strictEqual(user.role, 'seller');
      assert.strictEqual(bidder.role, 'seller');

      // Verify auction linkage
      const auction = mockStore._store.get('auctions/auction-remains-valid');
      assert.strictEqual(auction.sellerId, SELLER_UID);
      assert.strictEqual(auction.sellerName, 'Approved Consignor');
    });

    test('Test 3 — Transaction callback retry does not contaminate results', async () => {
      mockStore._store.set('consignment_applications/app-retry-clean', {
        sellerEmail: SELLER_EMAIL,
        status: 'approved',
        convertedAuctionId: 'auction-retry-clean'
      });
      mockStore._store.set('auctions/auction-retry-clean', {
        id: 'auction-retry-clean',
        title: 'Retry Clean Lot'
      });

      // Configure mock to execute callback once, abort it, then re-execute
      mockStore._retryCount = 1;

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${VALID_TOKEN}` }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      // Assert mock executed transaction callback multiple times
      assert.strictEqual(mockStore._attemptCount, 2, 'Mock must invoke callback twice');

      // Assert final response contains no duplicate auction IDs and reflects only successful attempt
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data?.success, true);
      assert.strictEqual(res.data?.authorized, true);
      assert.strictEqual(res.data?.linkedAuctions?.length, 1, 'No duplicate entries');
      assert.deepStrictEqual(res.data?.linkedAuctions, ['auction-retry-clean']);
      assert.deepStrictEqual(res.data?.missingAuctions, []);
      assert.deepStrictEqual(res.data?.conflicts, []);

      // Committed state is correct
      const auction = mockStore._store.get('auctions/auction-retry-clean');
      assert.strictEqual(auction.sellerId, SELLER_UID);
    });

    test('Test 4 — Retry with changed application approval', async () => {
      mockStore._store.set('consignment_applications/app-retry-revoked', {
        sellerEmail: SELLER_EMAIL,
        status: 'approved',
        convertedAuctionId: 'auction-retry-revoked'
      });
      mockStore._store.set('auctions/auction-retry-revoked', {
        id: 'auction-retry-revoked',
        title: 'Retry Revoked Lot'
      });

      // Configure mock to execute callback once, abort, revoke approval before attempt 2, then re-execute
      mockStore._retryCount = 1;
      let capturedStoreState: Map<string, any> | null = null;
      mockStore._beforeRetry = (_attempt: number, store: Map<string, any>) => {
        store.set('consignment_applications/app-retry-revoked', {
          sellerEmail: SELLER_EMAIL,
          status: 'revoked',
          convertedAuctionId: 'auction-retry-revoked'
        });
        // Capture complete Firestore mock store state after revocation and before attempt 2 executes
        capturedStoreState = new Map(
          Array.from(store.entries()).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))])
        );
      };

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${VALID_TOKEN}` }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      // Callback executed twice
      assert.strictEqual(mockStore._attemptCount, 2, 'Mock must invoke callback twice');

      // Authorization denied on second attempt
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.data?.authorized, false);
      assert.strictEqual(res.data?.success, false);

      // Verify no writes occurred and store remains identical to captured state after revocation
      assert.ok(capturedStoreState, 'Store state must be captured after revocation');
      assert.strictEqual(mockStore._store.size, (capturedStoreState as Map<string, any>).size);
      assert.deepStrictEqual(
        Object.fromEntries(mockStore._store),
        Object.fromEntries(capturedStoreState as Map<string, any>)
      );
      assert.strictEqual(mockStore._store.has(`users/${SELLER_UID}`), false, 'No user profile promotion');
      assert.strictEqual(mockStore._store.has(`bidders/${SELLER_UID}`), false, 'No bidder profile promotion');
      const auction = mockStore._store.get('auctions/auction-retry-revoked');
      assert.strictEqual(auction.sellerId, undefined, 'No auction seller assignment');
      assert.strictEqual(auction.sellerName, undefined);

      // Response does not contain stale results from attempt 1
      assert.strictEqual(res.data?.linkedAuctions, undefined);
    });

    test('Test 5 — Existing auction assignment conflict remains protected', async () => {
      const OTHER_SELLER_UID = 'competing-seller-uid';
      mockStore._store.set('consignment_applications/app-conflict-prot', {
        sellerEmail: SELLER_EMAIL,
        status: 'approved',
        convertedAuctionId: 'auction-conflict-prot'
      });
      mockStore._store.set('auctions/auction-conflict-prot', {
        id: 'auction-conflict-prot',
        title: 'Protected Conflict Lot',
        sellerId: OTHER_SELLER_UID,
        sellerName: 'Other Seller'
      });

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${VALID_TOKEN}` }
      };
      const res = createMockResponse();

      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data?.authorized, true);
      assert.strictEqual(res.data?.linkedAuctions?.length, 0);
      assert.strictEqual(res.data?.conflicts?.length, 1);
      assert.strictEqual(res.data?.conflicts[0].auctionId, 'auction-conflict-prot');
      assert.strictEqual(res.data?.conflicts[0].existingSellerId, OTHER_SELLER_UID);

      // Auction in store remained untouched
      const auction = mockStore._store.get('auctions/auction-conflict-prot');
      assert.strictEqual(auction.sellerId, OTHER_SELLER_UID);
      assert.strictEqual(auction.sellerName, 'Other Seller');
    });

    test('Test 6 — Idempotent successful authorization', async () => {
      mockStore._store.set('consignment_applications/app-idem-test', {
        sellerEmail: SELLER_EMAIL,
        status: 'approved',
        convertedAuctionId: 'auction-idem-test'
      });
      mockStore._store.set('auctions/auction-idem-test', {
        id: 'auction-idem-test',
        title: 'Idempotency Lot'
      });

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${VALID_TOKEN}` }
      };

      // Call 1
      const res1 = createMockResponse();
      await handleAuthorizeApprovedConsignor(req, res1, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res1.statusCode, 200);
      assert.strictEqual(res1.data?.authorized, true);
      assert.deepStrictEqual(res1.data?.linkedAuctions, ['auction-idem-test']);

      // Call 2
      const res2 = createMockResponse();
      await handleAuthorizeApprovedConsignor(req, res2, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res2.statusCode, 200);
      assert.strictEqual(res2.data?.authorized, true);
      assert.deepStrictEqual(res2.data?.linkedAuctions, ['auction-idem-test']);
      assert.strictEqual(res2.data?.linkedAuctions?.length, 1);

      // Verify consistency of user and bidder documents
      const user = mockStore._store.get(`users/${SELLER_UID}`);
      const bidder = mockStore._store.get(`bidders/${SELLER_UID}`);
      assert.strictEqual(user.role, 'seller');
      assert.strictEqual(bidder.role, 'seller');
      assert.strictEqual(user.uid, SELLER_UID);
      assert.strictEqual(bidder.uid, SELLER_UID);

      // Verify auction assignment
      const auction = mockStore._store.get('auctions/auction-idem-test');
      assert.strictEqual(auction.sellerId, SELLER_UID);
    });

    test('Test 7 — Legacy consignments approval revoked before transaction authorization', async () => {
      // 1. Initial approved legacy consignments document returned by lookup
      mockStore._store.set('consignments/legacy-app-revoked-before-tx', {
        sellerEmail: SELLER_EMAIL,
        status: 'approved',
        convertedAuctionId: 'auction-legacy-revoked-before-tx'
      });
      mockStore._store.set('auctions/auction-legacy-revoked-before-tx', {
        id: 'auction-legacy-revoked-before-tx',
        title: 'Legacy Revoked Before TX Lot'
      });

      // 2. Change status to revoked immediately before the transaction's authoritative read
      let capturedStoreState: Map<string, any> | null = null;
      mockStore._beforeTransaction = (store: Map<string, any>) => {
        store.set('consignments/legacy-app-revoked-before-tx', {
          sellerEmail: SELLER_EMAIL,
          status: 'revoked',
          convertedAuctionId: 'auction-legacy-revoked-before-tx'
        });
        // Capture complete Firestore mock store state after revocation and before transaction read
        capturedStoreState = new Map(
          Array.from(store.entries()).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))])
        );
      };

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${VALID_TOKEN}` }
      };
      const res = createMockResponse();

      // 3. Exercise real endpoint handler and existing mock transaction implementation
      await handleAuthorizeApprovedConsignor(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      // 4. Assert HTTP 403 and authorized === false
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.data?.authorized, false);
      assert.strictEqual(res.data?.success, false);

      // 5. Assert no user or bidder profile promotion
      assert.strictEqual(mockStore._store.has(`users/${SELLER_UID}`), false, 'No user profile promotion');
      assert.strictEqual(mockStore._store.has(`bidders/${SELLER_UID}`), false, 'No bidder profile promotion');

      // 6. Assert no auction assignment
      const auction = mockStore._store.get('auctions/auction-legacy-revoked-before-tx');
      assert.strictEqual(auction.sellerId, undefined, 'No auction seller assignment');
      assert.strictEqual(auction.sellerName, undefined);

      // 7. Assert no authorization-related writes occurred (store identical to state captured after revocation)
      assert.ok(capturedStoreState, 'Store state must be captured after revocation');
      assert.strictEqual(mockStore._store.size, (capturedStoreState as Map<string, any>).size);
      assert.deepStrictEqual(
        Object.fromEntries(mockStore._store),
        Object.fromEntries(capturedStoreState as Map<string, any>)
      );
    });
  });
});
