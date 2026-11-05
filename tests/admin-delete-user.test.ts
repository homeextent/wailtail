import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { handleAdminDeleteUser } from '../api/admin-delete-user';
import { isDesignatedAdminEmail } from '../src/config/adminConfig';
import { deleteUserRecord } from '../src/services/auctionService';

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
  const writeLog: Array<{ type: string; path: string }> = [];

  function makeDocRef(colName: string, docId: string) {
    const fullPath = `${colName}/${docId}`;
    return {
      id: docId,
      path: fullPath,
      parent: { id: colName }
    };
  }

  const firestore: any = {
    _store: store,
    _writeLog: writeLog,
    _shouldFailBatch: false,
    _shouldFailUsersQuery: false,
    _shouldFailBiddersQuery: false,
    collection(colName: string) {
      return {
        doc(docId: string) {
          return makeDocRef(colName, docId);
        },
        where(field: string, op: string, value: any) {
          return {
            async get() {
              if (colName === 'users' && firestore._shouldFailUsersQuery) {
                throw new Error('Simulated users exact-UID query failure');
              }
              if (colName === 'bidders' && firestore._shouldFailBiddersQuery) {
                throw new Error('Simulated bidders exact-UID query failure');
              }
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
    batch() {
      const stagedDeletions: any[] = [];
      return {
        delete(docRef: any) {
          stagedDeletions.push(docRef);
        },
        async commit() {
          if (firestore._shouldFailBatch) {
            throw new Error('Simulated atomic Firestore batch failure');
          }
          for (const ref of stagedDeletions) {
            writeLog.push({ type: 'delete', path: ref.path });
            store.delete(ref.path);
          }
        }
      };
    }
  };

  return firestore;
}

interface MockAuthUser {
  uid: string;
  email: string;
  email_verified?: boolean;
  emailVerified?: boolean;
}

function createMockAuth(
  validTokens: Record<string, any> = {},
  initialUsers: Record<string, MockAuthUser> = {}
) {
  const users = new Map<string, MockAuthUser>();
  for (const [uid, u] of Object.entries(initialUsers)) {
    users.set(uid, { ...u });
  }

  const verifyCalls: Array<{ token: string; checkRevoked?: boolean }> = [];
  const deleteCalls: string[] = [];
  const getUserCalls: string[] = [];
  const getUserByEmailCalls: string[] = [];

  return {
    _users: users,
    verifyCalls,
    deleteCalls,
    getUserCalls,
    getUserByEmailCalls,
    _shouldFailGetUser: false,
    _shouldFailGetUserByEmail: false,
    _shouldFailDeleteUser: false,
    _userNotFoundForGetUser: new Set<string>(),
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
    },
    async getUser(uid: string) {
      getUserCalls.push(uid);
      if (this._shouldFailGetUser) {
        throw new Error('Internal Firebase Auth failure on getUser');
      }
      if (this._userNotFoundForGetUser.has(uid)) {
        const err: any = new Error(`User not found: ${uid}`);
        err.code = 'auth/user-not-found';
        throw err;
      }
      if (users.has(uid)) {
        return users.get(uid);
      }
      const err: any = new Error(`User not found: ${uid}`);
      err.code = 'auth/user-not-found';
      throw err;
    },
    async getUserByEmail(email: string) {
      getUserByEmailCalls.push(email);
      if (this._shouldFailGetUserByEmail) {
        const err: any = new Error('Simulated administrator lookup failure on getUserByEmail');
        err.code = 'auth/internal-error';
        throw err;
      }
      const normalized = (email || '').trim().toLowerCase();
      for (const user of users.values()) {
        if ((user.email || '').trim().toLowerCase() === normalized) {
          return { ...user };
        }
      }
      const err: any = new Error(`User not found for email: ${email}`);
      err.code = 'auth/user-not-found';
      throw err;
    },
    async deleteUser(uid: string) {
      deleteCalls.push(uid);
      if (this._shouldFailDeleteUser) {
        throw new Error('Internal Firebase Auth failure on deleteUser');
      }
      if (!users.has(uid)) {
        const err: any = new Error(`User not found: ${uid}`);
        err.code = 'auth/user-not-found';
        throw err;
      }
      users.delete(uid);
    }
  };
}

describe('Server-Side Administrator Account Deletion — /api/admin-delete-user', () => {
  let mockStore: any;
  let mockAuth: any;

  const ADMIN_1_EMAIL = 'jeremygoodmurphy@gmail.com';
  const ADMIN_1_UID = 'admin-uid-jeremy-1';
  const ADMIN_1_TOKEN = 'token-admin-1';

  const ADMIN_2_EMAIL = 'jeremy@theinnovativegroup.ca';
  const ADMIN_2_UID = 'admin-uid-jeremy-2';
  const ADMIN_2_TOKEN = 'token-admin-2';

  const TARGET_USER_UID = 'ordinary-target-uid-999';
  const TARGET_USER_EMAIL = 'target.user@example.com';

  beforeEach(() => {
    mockStore = createMockFirestore();
    mockAuth = createMockAuth(
      {
        [ADMIN_1_TOKEN]: {
          uid: ADMIN_1_UID,
          email: ADMIN_1_EMAIL,
          email_verified: true,
          name: 'Jeremy Admin 1'
        },
        [ADMIN_2_TOKEN]: {
          uid: ADMIN_2_UID,
          email: ADMIN_2_EMAIL,
          email_verified: true,
          name: 'Jeremy Admin 2'
        },
        'token-unverified-admin': {
          uid: 'admin-unverified-uid',
          email: ADMIN_1_EMAIL,
          email_verified: false
        },
        'token-non-admin': {
          uid: 'ordinary-bidder-uid',
          email: 'ordinary.bidder@example.com',
          email_verified: true
        },
        'token-no-email': {
          uid: 'no-email-uid',
          email_verified: true
        }
      },
      {
        [ADMIN_1_UID]: {
          uid: ADMIN_1_UID,
          email: ADMIN_1_EMAIL,
          emailVerified: true
        },
        [ADMIN_2_UID]: {
          uid: ADMIN_2_UID,
          email: ADMIN_2_EMAIL,
          emailVerified: true
        },
        [TARGET_USER_UID]: {
          uid: TARGET_USER_UID,
          email: TARGET_USER_EMAIL,
          emailVerified: true
        }
      }
    );

    // Seed target user profile in Firestore
    mockStore._store.set(`users/${TARGET_USER_UID}`, {
      uid: TARGET_USER_UID,
      email: TARGET_USER_EMAIL,
      displayName: 'Target User',
      role: 'bidder'
    });
    mockStore._store.set(`bidders/${TARGET_USER_UID}`, {
      uid: TARGET_USER_UID,
      email: TARGET_USER_EMAIL,
      displayName: 'Target User',
      role: 'bidder'
    });

    // Seed protected admin profiles in Firestore
    mockStore._store.set(`users/${ADMIN_1_UID}`, {
      uid: ADMIN_1_UID,
      email: ADMIN_1_EMAIL,
      role: 'admin'
    });
    mockStore._store.set(`bidders/${ADMIN_1_UID}`, {
      uid: ADMIN_1_UID,
      email: ADMIN_1_EMAIL,
      role: 'admin'
    });
    mockStore._store.set(`users/${ADMIN_2_UID}`, {
      uid: ADMIN_2_UID,
      email: ADMIN_2_EMAIL,
      role: 'admin'
    });
    mockStore._store.set(`bidders/${ADMIN_2_UID}`, {
      uid: ADMIN_2_UID,
      email: ADMIN_2_EMAIL,
      role: 'admin'
    });
  });

  // 1. Authentication and Authorization Tests
  describe('1. Authentication and Authorization', () => {
    test('Rejects request with missing Authorization header with 401', async () => {
      const req = { method: 'POST', headers: {}, body: { uid: TARGET_USER_UID } };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(res.data?.code, 'auth/missing-token');
      assert.strictEqual(mockAuth.deleteCalls.length, 0);
      assert.strictEqual(mockStore._writeLog.length, 0);
    });

    test('Rejects request with malformed Bearer header with 401', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: 'Basic some-secret' },
        body: { uid: TARGET_USER_UID }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(res.data?.code, 'auth/malformed-token');
      assert.strictEqual(mockAuth.deleteCalls.length, 0);
      assert.strictEqual(mockStore._writeLog.length, 0);
    });

    test('Rejects request with empty Bearer token with 401', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer   ' },
        body: { uid: TARGET_USER_UID }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(res.data?.code, 'auth/malformed-token');
    });

    test('Rejects invalid token with 401', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer invalid-token' },
        body: { uid: TARGET_USER_UID }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(res.data?.code, 'auth/invalid-token');
      assert.strictEqual(mockAuth.deleteCalls.length, 0);
      assert.strictEqual(mockStore._writeLog.length, 0);
    });

    test('Rejects expired token with 401', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer expired-token' },
        body: { uid: TARGET_USER_UID }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(res.data?.code, 'auth/invalid-token');
    });

    test('Rejects revoked token with 401 and code auth/id-token-revoked', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer revoked-token' },
        body: { uid: TARGET_USER_UID }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(res.data?.code, 'auth/id-token-revoked');
    });

    test('Passes checkRevoked: true to verifyIdToken', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_1_TOKEN}` },
        body: { uid: TARGET_USER_UID }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(mockAuth.verifyCalls.length, 1);
      assert.strictEqual(mockAuth.verifyCalls[0].token, ADMIN_1_TOKEN);
      assert.strictEqual(mockAuth.verifyCalls[0].checkRevoked, true);
    });

    test('Rejects authenticated token with unverified email with 403', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer token-unverified-admin' },
        body: { uid: TARGET_USER_UID }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(res.data?.code, 'auth/unverified-email');
      assert.strictEqual(mockAuth.deleteCalls.length, 0);
      assert.strictEqual(mockStore._writeLog.length, 0);
    });

    test('Rejects authenticated user not on administrator allowlist with 403', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer token-non-admin' },
        body: { uid: TARGET_USER_UID }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(res.data?.code, 'auth/not-admin');
      assert.strictEqual(mockAuth.deleteCalls.length, 0);
      assert.strictEqual(mockStore._writeLog.length, 0);
    });

    test('Rejects token missing email claim with 401', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer token-no-email' },
        body: { uid: TARGET_USER_UID }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(res.data?.code, 'auth/invalid-token');
    });

    test('OPTIONS request returns 200 with CORS headers', async () => {
      const req = { method: 'OPTIONS', headers: {} };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['Access-Control-Allow-Origin'], '*');
      assert.match(res.headers['Access-Control-Allow-Methods'], /POST/);
    });

    test('Rejects non-POST methods with 405', async () => {
      const req = { method: 'GET', headers: {} };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 405);
      assert.strictEqual(res.data?.success, false);
    });

    test('Rejects request with missing or undefined method with 405', async () => {
      const req = { headers: {} };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 405);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(res.data?.code, 'auth/method-not-allowed');
    });

    test('Rejects caller-supplied adminUid in request body: identity is derived strictly from verified token', async () => {
      // Attacker attempts to provide valid adminUid in body with non-admin token
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer token-non-admin' },
        body: {
          uid: TARGET_USER_UID,
          adminUid: ADMIN_1_UID
        }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.data?.code, 'auth/not-admin');
      assert.strictEqual(mockAuth.deleteCalls.length, 0);
    });

    test('Accepts valid designated administrator 1 and 2', async () => {
      // Admin 1
      assert.strictEqual(isDesignatedAdminEmail(ADMIN_1_EMAIL), true);
      // Admin 2
      assert.strictEqual(isDesignatedAdminEmail(ADMIN_2_EMAIL), true);
    });
  });

  // 2. Target Protection Tests
  describe('2. Target Protection', () => {
    test('Rejects request with missing target UID with 400', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_1_TOKEN}` },
        body: {}
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(res.data?.code, 'admin/invalid-target-uid');
      assert.strictEqual(mockAuth.deleteCalls.length, 0);
      assert.strictEqual(mockStore._writeLog.length, 0);
    });

    test('Rejects request with invalid target UID type (number or boolean) with 400', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_1_TOKEN}` },
        body: { uid: 12345 }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.data?.code, 'admin/invalid-target-uid');
    });

    test('Rejects request with empty whitespace target UID with 400', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_1_TOKEN}` },
        body: { uid: '   ' }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.data?.code, 'admin/invalid-target-uid');
    });

    test('Rejects self-deletion attempt with 400', async () => {
      // Admin 1 attempts to delete their own account
      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_1_TOKEN}` },
        body: { uid: ADMIN_1_UID }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(res.data?.code, 'admin/self-deletion-forbidden');
      assert.strictEqual(mockAuth.deleteCalls.length, 0);
      assert.strictEqual(mockStore._writeLog.length, 0);
      assert.strictEqual(mockStore._store.has(`users/${ADMIN_1_UID}`), true);
      assert.strictEqual(mockStore._store.has(`bidders/${ADMIN_1_UID}`), true);
    });

    test('Rejects attempt to delete the first designated administrator with 403', async () => {
      // Admin 2 attempts to delete Admin 1
      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_2_TOKEN}` },
        body: { uid: ADMIN_1_UID }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(res.data?.code, 'admin/protected-account');
      assert.strictEqual(mockAuth.deleteCalls.length, 0);
      assert.strictEqual(mockStore._writeLog.length, 0);
      assert.strictEqual(mockStore._store.has(`users/${ADMIN_1_UID}`), true);
      assert.strictEqual(mockStore._store.has(`bidders/${ADMIN_1_UID}`), true);
    });

    test('Rejects attempt to delete the second designated administrator with 403', async () => {
      // Admin 1 attempts to delete Admin 2
      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_1_TOKEN}` },
        body: { uid: ADMIN_2_UID }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(res.data?.code, 'admin/protected-account');
      assert.strictEqual(mockAuth.deleteCalls.length, 0);
      assert.strictEqual(mockStore._writeLog.length, 0);
      assert.strictEqual(mockStore._store.has(`users/${ADMIN_2_UID}`), true);
      assert.strictEqual(mockStore._store.has(`bidders/${ADMIN_2_UID}`), true);
    });

    test('Protected administrator check uses authoritative Auth email, ignoring mutable Firestore profile', async () => {
      // Suppose an admin account had role: "bidder" in Firestore profile due to tampering
      mockStore._store.set(`users/${ADMIN_1_UID}`, {
        uid: ADMIN_1_UID,
        email: ADMIN_1_EMAIL,
        role: 'bidder' // Tampered profile
      });

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_2_TOKEN}` },
        body: { uid: ADMIN_1_UID }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      // Still rejected because Auth record is authoritative!
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.data?.code, 'admin/protected-account');
      assert.strictEqual(mockAuth.deleteCalls.length, 0);
      assert.strictEqual(mockStore._writeLog.length, 0);
    });

    test('Rejects attempt to delete the first designated administrator when auth.getUser(targetUid) returns auth/user-not-found', async () => {
      // Admin 2 attempts to delete Admin 1, but auth.getUser(targetUid) returns auth/user-not-found
      mockAuth._userNotFoundForGetUser.add(ADMIN_1_UID);

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_2_TOKEN}` },
        body: { uid: ADMIN_1_UID }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(res.data?.code, 'admin/protected-account');
      assert.strictEqual(mockAuth.getUserCalls.includes(ADMIN_1_UID), true);
      assert.strictEqual(mockAuth.deleteCalls.length, 0);
      assert.strictEqual(mockStore._writeLog.length, 0);
      assert.strictEqual(mockStore._store.has(`users/${ADMIN_1_UID}`), true);
      assert.strictEqual(mockStore._store.has(`bidders/${ADMIN_1_UID}`), true);
    });

    test('Rejects attempt to delete the second designated administrator when auth.getUser(targetUid) returns auth/user-not-found', async () => {
      // Admin 1 attempts to delete Admin 2, but auth.getUser(targetUid) returns auth/user-not-found
      mockAuth._userNotFoundForGetUser.add(ADMIN_2_UID);

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_1_TOKEN}` },
        body: { uid: ADMIN_2_UID }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(res.data?.code, 'admin/protected-account');
      assert.strictEqual(mockAuth.getUserCalls.includes(ADMIN_2_UID), true);
      assert.strictEqual(mockAuth.deleteCalls.length, 0);
      assert.strictEqual(mockStore._writeLog.length, 0);
      assert.strictEqual(mockStore._store.has(`users/${ADMIN_2_UID}`), true);
      assert.strictEqual(mockStore._store.has(`bidders/${ADMIN_2_UID}`), true);
    });

    test('Administrator lookup failure fails closed with 500 and prevents all deletion operations', async () => {
      mockAuth._shouldFailGetUserByEmail = true;

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_1_TOKEN}` },
        body: { uid: TARGET_USER_UID }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(res.data?.code, 'admin/auth-error');
      // No deletion operations performed
      assert.strictEqual(mockAuth.deleteCalls.length, 0);
      assert.strictEqual(mockStore._writeLog.length, 0);
      assert.strictEqual(mockAuth._users.has(TARGET_USER_UID), true);
      assert.strictEqual(mockStore._store.has(`users/${TARGET_USER_UID}`), true);
      assert.strictEqual(mockStore._store.has(`bidders/${TARGET_USER_UID}`), true);
    });
  });

  // 3. Deletion Behaviour Tests
  describe('3. Deletion Behaviour', () => {
    test('Successful Auth and Firestore deletion', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_1_TOKEN}` },
        body: { uid: TARGET_USER_UID }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data?.success, true);
      assert.strictEqual(res.data?.uid, TARGET_USER_UID);

      // Auth deleted
      assert.strictEqual(mockAuth.deleteCalls.includes(TARGET_USER_UID), true);
      assert.strictEqual(mockAuth._users.has(TARGET_USER_UID), false);

      // Firestore documents deleted
      assert.strictEqual(mockStore._store.has(`users/${TARGET_USER_UID}`), false);
      assert.strictEqual(mockStore._store.has(`bidders/${TARGET_USER_UID}`), false);
    });

    test('Auth identity already absent (user-not-found), followed by successful Firestore cleanup', async () => {
      // Remove target from mockAuth to simulate user already removed from Auth
      mockAuth._users.delete(TARGET_USER_UID);

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_1_TOKEN}` },
        body: { uid: TARGET_USER_UID }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data?.success, true);
      assert.strictEqual(res.data?.uid, TARGET_USER_UID);

      // Firestore documents still purged safely
      assert.strictEqual(mockStore._store.has(`users/${TARGET_USER_UID}`), false);
      assert.strictEqual(mockStore._store.has(`bidders/${TARGET_USER_UID}`), false);
    });

    test('Firestore cleanup failure after Auth deletion returns 500 incomplete-deletion error', async () => {
      // Configure batch failure
      mockStore._shouldFailBatch = true;

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_1_TOKEN}` },
        body: { uid: TARGET_USER_UID }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(res.data?.success, false);
      assert.strictEqual(res.data?.code, 'admin/incomplete-deletion');
      assert.match(res.data?.error, /incomplete deletion/i);

      // Auth was deleted
      assert.strictEqual(mockAuth._users.has(TARGET_USER_UID), false);
    });

    test('Retry after partial deletion completes successfully', async () => {
      // Step 1: Simulated partial failure (batch fails)
      mockStore._shouldFailBatch = true;
      const req1 = {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_1_TOKEN}` },
        body: { uid: TARGET_USER_UID }
      };
      const res1 = createMockResponse();
      await handleAdminDeleteUser(req1, res1, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res1.statusCode, 500);
      assert.strictEqual(res1.data?.code, 'admin/incomplete-deletion');
      // Auth deleted, Firestore docs still present
      assert.strictEqual(mockAuth._users.has(TARGET_USER_UID), false);
      assert.strictEqual(mockStore._store.has(`users/${TARGET_USER_UID}`), true);

      // Step 2: Retry with working Firestore
      mockStore._shouldFailBatch = false;
      const req2 = {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_1_TOKEN}` },
        body: { uid: TARGET_USER_UID }
      };
      const res2 = createMockResponse();
      await handleAdminDeleteUser(req2, res2, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res2.statusCode, 200);
      assert.strictEqual(res2.data?.success, true);
      assert.strictEqual(mockStore._store.has(`users/${TARGET_USER_UID}`), false);
      assert.strictEqual(mockStore._store.has(`bidders/${TARGET_USER_UID}`), false);
    });

    test('Failure of users exact-UID query causes deletion to fail with 500 incomplete-deletion error and not success', async () => {
      // Step 1: Simulated failure of users exact-UID query
      mockStore._shouldFailUsersQuery = true;

      const req1 = {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_1_TOKEN}` },
        body: { uid: TARGET_USER_UID }
      };
      const res1 = createMockResponse();
      await handleAdminDeleteUser(req1, res1, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      // Must fail and must NOT produce an HTTP success response
      assert.strictEqual(res1.statusCode, 500);
      assert.strictEqual(res1.data?.success, false);
      assert.notStrictEqual(res1.statusCode, 200);
      assert.strictEqual(res1.data?.code, 'admin/incomplete-deletion');
      assert.match(res1.data?.error, /incomplete deletion/i);

      // Auth deletion already completed
      assert.strictEqual(mockAuth._users.has(TARGET_USER_UID), false);
      // Firestore documents remain for retry
      assert.strictEqual(mockStore._store.has(`users/${TARGET_USER_UID}`), true);

      // Step 2: Retry completes successfully when query succeeds
      mockStore._shouldFailUsersQuery = false;
      const req2 = {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_1_TOKEN}` },
        body: { uid: TARGET_USER_UID }
      };
      const res2 = createMockResponse();
      await handleAdminDeleteUser(req2, res2, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res2.statusCode, 200);
      assert.strictEqual(res2.data?.success, true);
      assert.strictEqual(mockStore._store.has(`users/${TARGET_USER_UID}`), false);
      assert.strictEqual(mockStore._store.has(`bidders/${TARGET_USER_UID}`), false);
    });

    test('Failure of bidders exact-UID query causes deletion to fail with 500 incomplete-deletion error and not success', async () => {
      // Step 1: Simulated failure of bidders exact-UID query
      mockStore._shouldFailBiddersQuery = true;

      const req1 = {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_1_TOKEN}` },
        body: { uid: TARGET_USER_UID }
      };
      const res1 = createMockResponse();
      await handleAdminDeleteUser(req1, res1, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      // Must fail and must NOT produce an HTTP success response
      assert.strictEqual(res1.statusCode, 500);
      assert.strictEqual(res1.data?.success, false);
      assert.notStrictEqual(res1.statusCode, 200);
      assert.strictEqual(res1.data?.code, 'admin/incomplete-deletion');
      assert.match(res1.data?.error, /incomplete deletion/i);

      // Auth deletion already completed
      assert.strictEqual(mockAuth._users.has(TARGET_USER_UID), false);
      // Firestore documents remain for retry
      assert.strictEqual(mockStore._store.has(`bidders/${TARGET_USER_UID}`), true);

      // Step 2: Retry completes successfully when query succeeds
      mockStore._shouldFailBiddersQuery = false;
      const req2 = {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_1_TOKEN}` },
        body: { uid: TARGET_USER_UID }
      };
      const res2 = createMockResponse();
      await handleAdminDeleteUser(req2, res2, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res2.statusCode, 200);
      assert.strictEqual(res2.data?.success, true);
      assert.strictEqual(mockStore._store.has(`users/${TARGET_USER_UID}`), false);
      assert.strictEqual(mockStore._store.has(`bidders/${TARGET_USER_UID}`), false);
    });

    test('Resolves legacy documents with matching exact target UID field', async () => {
      const LEGACY_USER_DOC_ID = 'legacy-doc-12345';
      const LEGACY_BIDDER_DOC_ID = 'legacy-bidder-67890';

      mockStore._store.set(`users/${LEGACY_USER_DOC_ID}`, {
        uid: TARGET_USER_UID,
        email: TARGET_USER_EMAIL,
        note: 'legacy doc with non-uid docId'
      });
      mockStore._store.set(`bidders/${LEGACY_BIDDER_DOC_ID}`, {
        uid: TARGET_USER_UID,
        email: TARGET_USER_EMAIL,
        note: 'legacy bidder doc with non-uid docId'
      });

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_1_TOKEN}` },
        body: { uid: TARGET_USER_UID }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(mockStore._store.has(`users/${LEGACY_USER_DOC_ID}`), false);
      assert.strictEqual(mockStore._store.has(`bidders/${LEGACY_BIDDER_DOC_ID}`), false);
    });

    test('Deduplicates document references so exact-match docs are not deleted repeatedly', async () => {
      const initialWriteCount = mockStore._writeLog.length;

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_1_TOKEN}` },
        body: { uid: TARGET_USER_UID }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 200);
      // Both users/{uid} and bidders/{uid} exist; exact queries also return them.
      // Total deleted paths must equal 2 (deduplicated), not 4.
      const deletedPaths = mockStore._writeLog.slice(initialWriteCount).map((w: any) => w.path);
      const uniquePaths = Array.from(new Set(deletedPaths));
      assert.strictEqual(deletedPaths.length, uniquePaths.length);
      assert.strictEqual(uniquePaths.length, 2);
    });

    test('No email-only deletion of unrelated records with different UID', async () => {
      const UNRELATED_UID = 'unrelated-user-with-same-email';
      mockStore._store.set(`users/${UNRELATED_UID}`, {
        uid: UNRELATED_UID,
        email: TARGET_USER_EMAIL // Shared or stale email, but DIFFERENT UID
      });

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_1_TOKEN}` },
        body: { uid: TARGET_USER_UID }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 200);
      // Unrelated document with different UID remains intact!
      assert.strictEqual(mockStore._store.has(`users/${UNRELATED_UID}`), true);
    });

    test('Auth deletion failure stops workflow before any Firestore writes', async () => {
      mockAuth._shouldFailDeleteUser = true;

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_1_TOKEN}` },
        body: { uid: TARGET_USER_UID }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(res.data?.code, 'admin/auth-deletion-failed');
      assert.strictEqual(mockStore._writeLog.length, 0);
      assert.strictEqual(mockStore._store.has(`users/${TARGET_USER_UID}`), true);
    });

    test('Unauthorized requests cause zero Auth deletion and zero Firestore writes', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer token-non-admin' },
        body: { uid: TARGET_USER_UID }
      };
      const res = createMockResponse();

      await handleAdminDeleteUser(req, res, {
        adminServices: { auth: mockAuth, firestore: mockStore }
      });

      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(mockAuth.deleteCalls.length, 0);
      assert.strictEqual(mockStore._writeLog.length, 0);
      assert.strictEqual(mockAuth._users.has(TARGET_USER_UID), true);
      assert.strictEqual(mockStore._store.has(`users/${TARGET_USER_UID}`), true);
      assert.strictEqual(mockStore._store.has(`bidders/${TARGET_USER_UID}`), true);
    });
  });

  // 4. Client Service Behaviour Tests
  describe('4. Client Service Behaviour', () => {
    test('Client sends POST /api/admin-delete-user with Bearer token and only target uid in request body (no adminUid)', async () => {
      let capturedUrl = '';
      let capturedMethod = '';
      let capturedHeaders: Record<string, string> = {};
      let capturedBody: any = null;

      const mockFetch: any = async (url: string, init: any) => {
        capturedUrl = url;
        capturedMethod = init.method;
        capturedHeaders = init.headers;
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, uid: TARGET_USER_UID })
        };
      };

      const mockClientAuth: any = {
        currentUser: {
          getIdToken: async () => 'test-id-token-abc'
        }
      };

      await deleteUserRecord(TARGET_USER_UID, {
        auth: mockClientAuth,
        fetch: mockFetch
      });

      assert.strictEqual(capturedUrl, '/api/admin-delete-user');
      assert.strictEqual(capturedMethod, 'POST');
      assert.strictEqual(capturedHeaders['Authorization'], 'Bearer test-id-token-abc');
      assert.strictEqual(capturedHeaders['Content-Type'], 'application/json');
      assert.deepStrictEqual(capturedBody, { uid: TARGET_USER_UID });
      assert.strictEqual((capturedBody as any).adminUid, undefined, 'adminUid must NOT be sent');
    });

    test('Client rejects calls when no authenticated user exists', async () => {
      let fetchCalled = false;
      const mockFetch: any = async () => {
        fetchCalled = true;
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      };

      const mockClientAuth: any = { currentUser: null };

      await assert.rejects(
        () => deleteUserRecord(TARGET_USER_UID, { auth: mockClientAuth, fetch: mockFetch }),
        /Authentication required: No active administrator session/
      );
      assert.strictEqual(fetchCalled, false);
    });

    test('Client propagates server-side HTTP errors', async () => {
      const mockFetch: any = async () => ({
        ok: false,
        status: 403,
        json: async () => ({
          success: false,
          error: 'Forbidden: Authenticated caller is not a verified designated administrator.'
        })
      });

      const mockClientAuth: any = {
        currentUser: {
          getIdToken: async () => 'some-token'
        }
      };

      await assert.rejects(
        () => deleteUserRecord(TARGET_USER_UID, { auth: mockClientAuth, fetch: mockFetch }),
        /Forbidden: Authenticated caller is not a verified designated administrator/
      );
    });

    test('Client propagates network errors to caller', async () => {
      const mockFetch: any = async () => {
        throw new Error('Connection reset by peer');
      };

      const mockClientAuth: any = {
        currentUser: {
          getIdToken: async () => 'some-token'
        }
      };

      await assert.rejects(
        () => deleteUserRecord(TARGET_USER_UID, { auth: mockClientAuth, fetch: mockFetch }),
        /Network failure.*Connection reset by peer/
      );
    });

    test('Client propagates timeout failures to caller', async () => {
      const mockFetch: any = async () => {
        const timeoutErr: any = new Error('The operation was aborted');
        timeoutErr.name = 'AbortError';
        throw timeoutErr;
      };

      const mockClientAuth: any = {
        currentUser: {
          getIdToken: async () => 'some-token'
        }
      };

      await assert.rejects(
        () => deleteUserRecord(TARGET_USER_UID, { auth: mockClientAuth, fetch: mockFetch }),
        /Deletion request timed out\. Please try again\./
      );
    });

    test('Client rejects malformed or non-JSON responses', async () => {
      const mockFetch: any = async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        }
      });

      const mockClientAuth: any = {
        currentUser: {
          getIdToken: async () => 'some-token'
        }
      };

      await assert.rejects(
        () => deleteUserRecord(TARGET_USER_UID, { auth: mockClientAuth, fetch: mockFetch }),
        /Server returned status 200 with non-JSON response\./
      );
    });

    test('Client requires both HTTP-success response and explicit data.success === true', async () => {
      const mockClientAuth: any = {
        currentUser: {
          getIdToken: async () => 'some-token'
        }
      };

      // Case 1: HTTP error (ok: false) with data.success === true
      const mockFetchHttpError: any = async () => ({
        ok: false,
        status: 500,
        json: async () => ({ success: true })
      });

      await assert.rejects(
        () => deleteUserRecord(TARGET_USER_UID, { auth: mockClientAuth, fetch: mockFetchHttpError }),
        /Server returned error status 500/
      );

      // Case 2: HTTP success (ok: true) with data.success !== true
      const mockFetchExplicitFail: any = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ success: false, error: 'Partial processing failure' })
      });

      await assert.rejects(
        () => deleteUserRecord(TARGET_USER_UID, { auth: mockClientAuth, fetch: mockFetchExplicitFail }),
        /Partial processing failure/
      );
    });

    test('Client never performs client-side Firestore deletion or fallback processing after a failed request', async () => {
      let fetchCallCount = 0;

      const mockFetch: any = async () => {
        fetchCallCount++;
        return {
          ok: false,
          status: 500,
          json: async () => ({
            success: false,
            error: 'Server error'
          })
        };
      };

      const mockClientAuth: any = {
        currentUser: {
          getIdToken: async () => 'some-token'
        }
      };

      await assert.rejects(
        () => deleteUserRecord(TARGET_USER_UID, { auth: mockClientAuth, fetch: mockFetch }),
        /Server error/
      );

      assert.strictEqual(fetchCallCount, 1, 'Client must issue exactly one request without fallback processing');
    });
  });
});
