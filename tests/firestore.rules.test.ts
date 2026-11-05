import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
  RulesTestContext
} from '@firebase/rules-unit-testing';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  Firestore
} from 'firebase/firestore';

const PROJECT_ID = 'studio-apps-483721';
const DATABASE_ID = 'ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e';
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] || '127.0.0.1';
const EMULATOR_PORT = Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] || '8080');

const APPLICANT_EMAIL = 'applicant@wailtail.com';
const OTHER_USER_EMAIL = 'otheruser@wailtail.com';
const ADMIN_EMAIL = 'jeremygoodmurphy@gmail.com';

const PROTECTED_DEALER_FIELDS = [
  { field: 'sellerType', sampleValue: 'dealer' },
  { field: 'dealerId', sampleValue: 'dealer-id-123' },
  { field: 'dealerSnapshot', sampleValue: { businessName: 'Auto Group Inc.' } },
  { field: 'dealerDocFee', sampleValue: 299 },
  { field: 'taxHandling', sampleValue: 'dealer_collected' },
  { field: 'taxDisclaimerVersion', sampleValue: 'v1.0' },
  { field: 'verifiedAt', sampleValue: 1700000000000 },
  { field: 'verifierUid', sampleValue: 'admin-verifier-uid' },
  { field: 'verificationStatus', sampleValue: 'verified' },
  { field: 'verificationMethod', sampleValue: 'manual_inspection' },
  { field: 'verificationExpiresAt', sampleValue: 1750000000000 },
  { field: 'verificationRecordVersion', sampleValue: 1 }
] as const;

let testEnv: RulesTestEnvironment;

/**
 * Helper to obtain a modular Firestore client targeting the project's named database.
 *
 * RulesTestContext internals analysis:
 * @firebase/rules-unit-testing (v5.0.2) does not expose a public API to configure or
 * connect to named Firestore databases (ctx.firestore() only instantiates compat Firestore
 * on "(default)" and cannot take a databaseId).
 * To access the required named database with mock authentication tokens, we access:
 * - (ctx as any).getApp(): binds the modular Firestore instance to the test context's FirebaseApp
 * - (ctx as any).authToken: forwards the mock user authentication payload to connectFirestoreEmulator
 * These internal properties are required because no public API exists in rules-unit-testing
 * for named Firestore databases, and falling back to the default database is prohibited.
 */
function getNamedDb(ctx: RulesTestContext): Firestore {
  const modularDb = getFirestore((ctx as any).getApp(), DATABASE_ID);
  connectFirestoreEmulator(modularDb, EMULATOR_HOST, EMULATOR_PORT, {
    mockUserToken: (ctx as any).authToken
  });
  return modularDb;
}

async function clearNamedDatabase(): Promise<void> {
  const url = `http://${EMULATOR_HOST}:${EMULATOR_PORT}/emulator/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error(`Failed to clear named database ${DATABASE_ID}: ${res.statusText}`);
  }
}

describe('Firestore Security Rules — M2.0A Consignment Hardening', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        host: EMULATOR_HOST,
        port: EMULATOR_PORT,
        rules: fs.readFileSync('firestore.rules', 'utf8')
      }
    });
  });

  after(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await clearNamedDatabase();
  });

  const targetCollections = ['consignment_applications', 'consignments'] as const;

  for (const collectionName of targetCollections) {
    describe(`Collection: ${collectionName}`, () => {
      // 1. Guest can create a pending application without administrative metadata
      test('1. Guest can create a pending application without administrative metadata', async () => {
        const guestCtx = testEnv.unauthenticatedContext();
        const db = getNamedDb(guestCtx);
        const appRef = doc(db, collectionName, 'app-guest-1');

        await assertSucceeds(
          setDoc(appRef, {
            year: '1997',
            make: 'Toyota',
            model: 'Supra',
            sellerEmail: 'guest@wailtail.com',
            status: 'pending',
            submittedAt: Date.now()
          })
        );
      });

      // 2. Authenticated applicant can create a pending application
      test('2. Authenticated applicant can create a pending application', async () => {
        const applicantCtx = testEnv.authenticatedContext('applicant-uid-1', {
          email: APPLICANT_EMAIL
        });
        const db = getNamedDb(applicantCtx);
        const appRef = doc(db, collectionName, 'app-auth-1');

        await assertSucceeds(
          setDoc(appRef, {
            year: '2002',
            make: 'Mazda',
            model: 'RX-7',
            sellerEmail: APPLICANT_EMAIL,
            status: 'pending',
            submittedAt: Date.now()
          })
        );
      });

      // 3. Guest cannot create an application with status: 'approved'
      test('3. Guest cannot create an application with status: "approved"', async () => {
        const guestCtx = testEnv.unauthenticatedContext();
        const db = getNamedDb(guestCtx);
        const appRef = doc(db, collectionName, 'app-guest-approved');

        await assertFails(
          setDoc(appRef, {
            year: '1997',
            make: 'Toyota',
            model: 'Supra',
            sellerEmail: 'guest@wailtail.com',
            status: 'approved',
            submittedAt: Date.now()
          })
        );
      });

      // 4. Authenticated applicant cannot create an application with status: 'approved'
      test('4. Authenticated applicant cannot create an application with status: "approved"', async () => {
        const applicantCtx = testEnv.authenticatedContext('applicant-uid-1', {
          email: APPLICANT_EMAIL
        });
        const db = getNamedDb(applicantCtx);
        const appRef = doc(db, collectionName, 'app-auth-approved');

        await assertFails(
          setDoc(appRef, {
            year: '2002',
            make: 'Mazda',
            model: 'RX-7',
            sellerEmail: APPLICANT_EMAIL,
            status: 'approved',
            submittedAt: Date.now()
          })
        );
      });

      // 5. Non-admin cannot inject reviewedAt
      test('5. Non-admin cannot inject reviewedAt', async () => {
        const applicantCtx = testEnv.authenticatedContext('applicant-uid-1', {
          email: APPLICANT_EMAIL
        });
        const db = getNamedDb(applicantCtx);
        const appRef = doc(db, collectionName, 'app-inject-reviewedAt');

        await assertFails(
          setDoc(appRef, {
            year: '2002',
            make: 'Mazda',
            model: 'RX-7',
            sellerEmail: APPLICANT_EMAIL,
            status: 'pending',
            reviewedAt: Date.now()
          })
        );
      });

      // 6. Non-admin cannot inject reviewedBy
      test('6. Non-admin cannot inject reviewedBy', async () => {
        const applicantCtx = testEnv.authenticatedContext('applicant-uid-1', {
          email: APPLICANT_EMAIL
        });
        const db = getNamedDb(applicantCtx);
        const appRef = doc(db, collectionName, 'app-inject-reviewedBy');

        await assertFails(
          setDoc(appRef, {
            year: '2002',
            make: 'Mazda',
            model: 'RX-7',
            sellerEmail: APPLICANT_EMAIL,
            status: 'pending',
            reviewedBy: 'admin-id'
          })
        );
      });

      // 7. Non-admin cannot inject convertedAuctionId
      test('7. Non-admin cannot inject convertedAuctionId', async () => {
        const applicantCtx = testEnv.authenticatedContext('applicant-uid-1', {
          email: APPLICANT_EMAIL
        });
        const db = getNamedDb(applicantCtx);
        const appRef = doc(db, collectionName, 'app-inject-convertedAuctionId');

        await assertFails(
          setDoc(appRef, {
            year: '2002',
            make: 'Mazda',
            model: 'RX-7',
            sellerEmail: APPLICANT_EMAIL,
            status: 'pending',
            convertedAuctionId: 'auction-123'
          })
        );
      });

      // 8. Non-admin cannot inject updatedAt
      test('8. Non-admin cannot inject updatedAt', async () => {
        const applicantCtx = testEnv.authenticatedContext('applicant-uid-1', {
          email: APPLICANT_EMAIL
        });
        const db = getNamedDb(applicantCtx);
        const appRef = doc(db, collectionName, 'app-inject-updatedAt');

        await assertFails(
          setDoc(appRef, {
            year: '2002',
            make: 'Mazda',
            model: 'RX-7',
            sellerEmail: APPLICANT_EMAIL,
            status: 'pending',
            updatedAt: Date.now()
          })
        );
      });

      // 9. Non-admin cannot inject registeredUserId
      test('9. Non-admin cannot inject registeredUserId', async () => {
        const applicantCtx = testEnv.authenticatedContext('applicant-uid-1', {
          email: APPLICANT_EMAIL
        });
        const db = getNamedDb(applicantCtx);
        const appRef = doc(db, collectionName, 'app-inject-registeredUserId');

        await assertFails(
          setDoc(appRef, {
            year: '2002',
            make: 'Mazda',
            model: 'RX-7',
            sellerEmail: APPLICANT_EMAIL,
            status: 'pending',
            registeredUserId: 'applicant-uid-1'
          })
        );
      });

      // 10. Non-admin cannot inject isRegisteredUser
      test('10. Non-admin cannot inject isRegisteredUser', async () => {
        const applicantCtx = testEnv.authenticatedContext('applicant-uid-1', {
          email: APPLICANT_EMAIL
        });
        const db = getNamedDb(applicantCtx);
        const appRef = doc(db, collectionName, 'app-inject-isRegisteredUser');

        await assertFails(
          setDoc(appRef, {
            year: '2002',
            make: 'Mazda',
            model: 'RX-7',
            sellerEmail: APPLICANT_EMAIL,
            status: 'pending',
            isRegisteredUser: true
          })
        );
      });

      // 11. Non-admin cannot inject registeredUserRole
      test('11. Non-admin cannot inject registeredUserRole', async () => {
        const applicantCtx = testEnv.authenticatedContext('applicant-uid-1', {
          email: APPLICANT_EMAIL
        });
        const db = getNamedDb(applicantCtx);
        const appRef = doc(db, collectionName, 'app-inject-registeredUserRole');

        await assertFails(
          setDoc(appRef, {
            year: '2002',
            make: 'Mazda',
            model: 'RX-7',
            sellerEmail: APPLICANT_EMAIL,
            status: 'pending',
            registeredUserRole: 'SELLER'
          })
        );
      });

      // 12. Applicant can read their own application when authenticated email matches normalized sellerEmail
      test('12. Applicant can read their own application when authenticated email matches normalized sellerEmail', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
          const adminDb = getNamedDb(adminCtx);
          await setDoc(doc(adminDb, collectionName, 'app-own-1'), {
            year: '1998',
            make: 'Nissan',
            model: 'Skyline',
            sellerEmail: APPLICANT_EMAIL,
            status: 'pending'
          });
        });

        // Test with exact lowercase and mixed-case auth token email to verify case-insensitivity
        const applicantCtx = testEnv.authenticatedContext('applicant-uid-1', {
          email: 'APPLICANT@WAILTAIL.COM',
          email_verified: true
        });
        const db = getNamedDb(applicantCtx);
        const appSnap = await assertSucceeds(getDoc(doc(db, collectionName, 'app-own-1')));
        assert.strictEqual(appSnap.exists(), true);
        assert.strictEqual(appSnap.data()?.sellerEmail, APPLICANT_EMAIL);
      });

      // M2.0A: 1. Authenticated applicant with verified matching email can read their application
      test('M2.0A: 1. Authenticated applicant with verified matching email can read their application', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
          const adminDb = getNamedDb(adminCtx);
          await setDoc(doc(adminDb, collectionName, 'app-verified-read-1'), {
            year: '2020',
            make: 'Toyota',
            model: 'GR Yaris',
            sellerEmail: APPLICANT_EMAIL,
            status: 'pending'
          });
        });

        const applicantCtx = testEnv.authenticatedContext('applicant-uid-1', {
          email: APPLICANT_EMAIL,
          email_verified: true
        });
        const db = getNamedDb(applicantCtx);
        const snap = await assertSucceeds(getDoc(doc(db, collectionName, 'app-verified-read-1')));
        assert.strictEqual(snap.exists(), true);
        assert.strictEqual(snap.data()?.sellerEmail, APPLICANT_EMAIL);
      });

      // M2.0A: 2. Authenticated applicant with matching but unverified email cannot read
      test('M2.0A: 2. Authenticated applicant with matching but unverified email cannot read', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
          const adminDb = getNamedDb(adminCtx);
          await setDoc(doc(adminDb, collectionName, 'app-unverified-read-1'), {
            year: '2020',
            make: 'Toyota',
            model: 'GR Yaris',
            sellerEmail: APPLICANT_EMAIL,
            status: 'pending'
          });
        });

        const unverifiedCtx = testEnv.authenticatedContext('applicant-uid-1', {
          email: APPLICANT_EMAIL,
          email_verified: false
        });
        const db = getNamedDb(unverifiedCtx);
        await assertFails(getDoc(doc(db, collectionName, 'app-unverified-read-1')));
      });

      // M2.0A: 3. Authenticated user without an email claim cannot read
      test('M2.0A: 3. Authenticated user without an email claim cannot read', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
          const adminDb = getNamedDb(adminCtx);
          await setDoc(doc(adminDb, collectionName, 'app-no-email-read-1'), {
            year: '2020',
            make: 'Toyota',
            model: 'GR Yaris',
            sellerEmail: APPLICANT_EMAIL,
            status: 'pending'
          });
        });

        const noEmailCtx = testEnv.authenticatedContext('user-without-email-uid');
        const db = getNamedDb(noEmailCtx);
        await assertFails(getDoc(doc(db, collectionName, 'app-no-email-read-1')));
      });

      // M2.0A: 4. Authenticated applicant with verified but unrelated email cannot read
      test('M2.0A: 4. Authenticated applicant with verified but unrelated email cannot read', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
          const adminDb = getNamedDb(adminCtx);
          await setDoc(doc(adminDb, collectionName, 'app-unrelated-verified-1'), {
            year: '2020',
            make: 'Toyota',
            model: 'GR Yaris',
            sellerEmail: APPLICANT_EMAIL,
            status: 'pending'
          });
        });

        const unrelatedVerifiedCtx = testEnv.authenticatedContext('unrelated-uid', {
          email: OTHER_USER_EMAIL,
          email_verified: true
        });
        const db = getNamedDb(unrelatedVerifiedCtx);
        await assertFails(getDoc(doc(db, collectionName, 'app-unrelated-verified-1')));
      });

      // M2.0A: 5. Administrator can still read collection-wide application queries and individual documents
      test('M2.0A: 5. Administrator can still read collection-wide application queries and individual documents', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
          const adminDb = getNamedDb(adminCtx);
          await setDoc(doc(adminDb, collectionName, 'app-admin-read-indiv-1'), {
            sellerEmail: APPLICANT_EMAIL,
            status: 'pending'
          });
        });

        const adminCtx = testEnv.authenticatedContext('admin-uid', {
          email: ADMIN_EMAIL,
          email_verified: true
        });
        const db = getNamedDb(adminCtx);

        // Individual document read
        const docSnap = await assertSucceeds(getDoc(doc(db, collectionName, 'app-admin-read-indiv-1')));
        assert.strictEqual(docSnap.exists(), true);

        // Collection-wide query read
        const unscopedQ = query(collection(db, collectionName));
        const snap = await assertSucceeds(getDocs(unscopedQ));
        assert.strictEqual(snap.docs.length >= 1, true);
      });

      // 13. Applicant cannot read another applicant's application
      test('13. Applicant cannot read another applicant\'s application', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
          const adminDb = getNamedDb(adminCtx);
          await setDoc(doc(adminDb, collectionName, 'app-other-1'), {
            year: '1998',
            make: 'Nissan',
            model: 'Skyline',
            sellerEmail: 'someoneelse@wailtail.com',
            status: 'pending'
          });
        });

        const applicantCtx = testEnv.authenticatedContext('applicant-uid-1', {
          email: APPLICANT_EMAIL,
          email_verified: true
        });
        const db = getNamedDb(applicantCtx);
        await assertFails(getDoc(doc(db, collectionName, 'app-other-1')));
      });

      // 14. Unrelated authenticated users cannot read applicant documents
      test('14. Unrelated authenticated users cannot read applicant documents', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
          const adminDb = getNamedDb(adminCtx);
          await setDoc(doc(adminDb, collectionName, 'app-secret-1'), {
            year: '2005',
            make: 'Porsche',
            model: '911 GT3',
            sellerEmail: APPLICANT_EMAIL,
            status: 'pending'
          });
        });

        const unrelatedCtx = testEnv.authenticatedContext('unrelated-uid', {
          email: OTHER_USER_EMAIL,
          email_verified: true
        });
        const db = getNamedDb(unrelatedCtx);
        await assertFails(getDoc(doc(db, collectionName, 'app-secret-1')));
      });

      // 15. Unauthenticated users cannot read application documents
      test('15. Unauthenticated users cannot read application documents', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
          const adminDb = getNamedDb(adminCtx);
          await setDoc(doc(adminDb, collectionName, 'app-anon-1'), {
            year: '1995',
            make: 'Honda',
            model: 'NSX',
            sellerEmail: APPLICANT_EMAIL,
            status: 'pending'
          });
        });

        const guestCtx = testEnv.unauthenticatedContext();
        const db = getNamedDb(guestCtx);
        await assertFails(getDoc(doc(db, collectionName, 'app-anon-1')));
      });

      // 16. Applicant email-scoped collection queries succeed
      test('16. Applicant email-scoped collection queries succeed', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
          const adminDb = getNamedDb(adminCtx);
          await setDoc(doc(adminDb, collectionName, 'app-query-1'), {
            sellerEmail: APPLICANT_EMAIL,
            status: 'pending',
            make: 'Subaru'
          });
        });

        const applicantCtx = testEnv.authenticatedContext('applicant-uid-1', {
          email: APPLICANT_EMAIL,
          email_verified: true
        });
        const db = getNamedDb(applicantCtx);
        const q = query(collection(db, collectionName), where('sellerEmail', '==', APPLICANT_EMAIL));
        const snap = await assertSucceeds(getDocs(q));
        assert.strictEqual(snap.docs.length, 1);
      });

      // 17. Unscoped applicant collection queries are rejected
      test('17. Unscoped applicant collection queries are rejected', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
          const adminDb = getNamedDb(adminCtx);
          await setDoc(doc(adminDb, collectionName, 'app-unscoped-1'), {
            sellerEmail: APPLICANT_EMAIL,
            status: 'pending'
          });
        });

        const applicantCtx = testEnv.authenticatedContext('applicant-uid-1', {
          email: APPLICANT_EMAIL,
          email_verified: true
        });
        const db = getNamedDb(applicantCtx);
        const unscopedQ = query(collection(db, collectionName));
        await assertFails(getDocs(unscopedQ));
      });

      // 18. Administrator can read collection-wide application queries
      test('18. Administrator can read collection-wide application queries', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
          const adminDb = getNamedDb(adminCtx);
          await setDoc(doc(adminDb, collectionName, 'app-admin-read-1'), {
            sellerEmail: APPLICANT_EMAIL,
            status: 'pending'
          });
        });

        const adminCtx = testEnv.authenticatedContext('admin-uid', {
          email: ADMIN_EMAIL,
          email_verified: true
        });
        const db = getNamedDb(adminCtx);
        const unscopedQ = query(collection(db, collectionName));
        const snap = await assertSucceeds(getDocs(unscopedQ));
        assert.strictEqual(snap.docs.length, 1);
      });

      // 19. Non-admin cannot update an existing application
      test('19. Non-admin cannot update an existing application', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
          const adminDb = getNamedDb(adminCtx);
          await setDoc(doc(adminDb, collectionName, 'app-update-1'), {
            sellerEmail: APPLICANT_EMAIL,
            status: 'pending',
            make: 'Toyota'
          });
        });

        const applicantCtx = testEnv.authenticatedContext('applicant-uid-1', {
          email: APPLICANT_EMAIL
        });
        const db = getNamedDb(applicantCtx);
        await assertFails(
          updateDoc(doc(db, collectionName, 'app-update-1'), {
            status: 'approved'
          })
        );
        await assertFails(
          updateDoc(doc(db, collectionName, 'app-update-1'), {
            notes: 'Updated notes from applicant'
          })
        );
      });

      // 20. Non-admin cannot delete an existing application
      test('20. Non-admin cannot delete an existing application', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
          const adminDb = getNamedDb(adminCtx);
          await setDoc(doc(adminDb, collectionName, 'app-delete-1'), {
            sellerEmail: APPLICANT_EMAIL,
            status: 'pending'
          });
        });

        const applicantCtx = testEnv.authenticatedContext('applicant-uid-1', {
          email: APPLICANT_EMAIL
        });
        const db = getNamedDb(applicantCtx);
        await assertFails(deleteDoc(doc(db, collectionName, 'app-delete-1')));
      });

      // 21. Administrator retains authorized update and delete capabilities
      test('21. Administrator retains authorized update and delete capabilities', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
          const adminDb = getNamedDb(adminCtx);
          await setDoc(doc(adminDb, collectionName, 'app-admin-modify-1'), {
            sellerEmail: APPLICANT_EMAIL,
            status: 'pending'
          });
        });

        const adminCtx = testEnv.authenticatedContext('admin-uid', {
          email: ADMIN_EMAIL
        });
        const db = getNamedDb(adminCtx);

        // Update capability
        await assertSucceeds(
          updateDoc(doc(db, collectionName, 'app-admin-modify-1'), {
            status: 'approved',
            reviewedAt: Date.now(),
            reviewedBy: 'admin-uid'
          })
        );

        // Delete capability
        await assertSucceeds(deleteDoc(doc(db, collectionName, 'app-admin-modify-1')));
      });

      // 22. Existing M1/M1.1 dealer declaration and verification protections remain enforced
      test('22. Existing M1/M1.1 dealer declaration and verification protections remain enforced on create (all 12 fields)', async () => {
        const applicantCtx = testEnv.authenticatedContext('applicant-uid-1', {
          email: APPLICANT_EMAIL
        });
        const db = getNamedDb(applicantCtx);

        // Exercise all twelve protected dealer declaration and verification fields
        for (const { field, sampleValue } of PROTECTED_DEALER_FIELDS) {
          await assertFails(
            setDoc(doc(db, collectionName, `app-m1-batch-${field}`), {
              year: '2002',
              make: 'Mazda',
              model: 'RX-7',
              sellerEmail: APPLICANT_EMAIL,
              status: 'pending',
              submittedAt: Date.now(),
              [field]: sampleValue
            })
          );
        }
      });

      // Individual tests for each of the twelve protected dealer and verification fields
      for (const { field, sampleValue } of PROTECTED_DEALER_FIELDS) {
        test(`22. Non-admin applicant cannot inject protected dealer field "${field}" on create`, async () => {
          const applicantCtx = testEnv.authenticatedContext('applicant-uid-1', {
            email: APPLICANT_EMAIL
          });
          const db = getNamedDb(applicantCtx);
          const docRef = doc(db, collectionName, `app-m1-indiv-${field}`);

          await assertFails(
            setDoc(docRef, {
              year: '2002',
              make: 'Mazda',
              model: 'RX-7',
              sellerEmail: APPLICANT_EMAIL,
              status: 'pending',
              submittedAt: Date.now(),
              [field]: sampleValue
            })
          );
        });
      }

      // 23 & 24. Existing historical documents without newly introduced metadata remain readable by authorized applicant and administrator
      test('24. Existing historical documents without newly introduced metadata remain readable by authorized applicant and administrator', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
          const adminDb = getNamedDb(adminCtx);
          // Legacy format document without any registeredUser* metadata
          await setDoc(doc(adminDb, collectionName, 'app-legacy-hist-1'), {
            sellerName: 'Historical Consignor',
            sellerEmail: APPLICANT_EMAIL,
            year: '1970',
            make: 'Dodge',
            model: 'Challenger',
            status: 'pending',
            submittedAt: 1600000000000
          });
        });

        // Readable by authorized applicant
        const applicantCtx = testEnv.authenticatedContext('applicant-uid-1', {
          email: APPLICANT_EMAIL,
          email_verified: true
        });
        const applicantDb = getNamedDb(applicantCtx);
        const snap = await assertSucceeds(getDoc(doc(applicantDb, collectionName, 'app-legacy-hist-1')));
        assert.strictEqual(snap.exists(), true);
        assert.strictEqual(snap.data()?.make, 'Dodge');

        // Readable by administrator
        const adminCtx = testEnv.authenticatedContext('admin-uid', {
          email: ADMIN_EMAIL,
          email_verified: true
        });
        const adminDb = getNamedDb(adminCtx);
        const adminSnap = await assertSucceeds(getDoc(doc(adminDb, collectionName, 'app-legacy-hist-1')));
        assert.strictEqual(adminSnap.exists(), true);
      });

      // Authorization relationship verification: security model does NOT depend on client-supplied registeredUserId
      test('Security model does not depend on client-supplied registeredUserId', async () => {
        await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
          const adminDb = getNamedDb(adminCtx);
          // Historical document where registeredUserId points to someone else or dummy value
          await setDoc(doc(adminDb, collectionName, 'app-id-test-1'), {
            sellerEmail: APPLICANT_EMAIL,
            registeredUserId: 'unrelated-dummy-id',
            status: 'pending'
          });
        });

        // The applicant with matching sellerEmail can read even if registeredUserId doesn't match applicant uid
        const applicantCtx = testEnv.authenticatedContext('applicant-uid-1', {
          email: APPLICANT_EMAIL,
          email_verified: true
        });
        const applicantDb = getNamedDb(applicantCtx);
        const snap = await assertSucceeds(getDoc(doc(applicantDb, collectionName, 'app-id-test-1')));
        assert.strictEqual(snap.exists(), true);

        // A user whose uid matches registeredUserId but whose email does NOT match cannot read
        const dummyCtx = testEnv.authenticatedContext('unrelated-dummy-id', {
          email: 'imposter@wailtail.com',
          email_verified: true
        });
        const dummyDb = getNamedDb(dummyCtx);
        await assertFails(getDoc(doc(dummyDb, collectionName, 'app-id-test-1')));
      });
    });
  }

  describe('Named Database Isolation & Configuration', () => {
    test('Named database is demonstrably tested and isolated from the default database', async () => {
      const adminCtx = testEnv.authenticatedContext('admin-uid', {
        email: ADMIN_EMAIL
      });
      const db = getNamedDb(adminCtx);
      assert.strictEqual((db as any)._databaseId?.database, DATABASE_ID);

      const testDocRef = doc(db, 'consignment_applications', 'db-isolation-check');
      await setDoc(testDocRef, {
        status: 'pending',
        sellerEmail: 'db-test@wailtail.com',
        year: '2024',
        make: 'NamedDb',
        model: 'Verification'
      });

      // Verify presence in named database via emulator REST API
      const namedRes = await fetch(
        `http://${EMULATOR_HOST}:${EMULATOR_PORT}/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/consignment_applications/db-isolation-check`,
        { headers: { Authorization: 'Bearer owner' } }
      );
      assert.strictEqual(namedRes.status, 200, 'Document must exist in named database');

      // Verify absence in default database via emulator REST API
      const defaultRes = await fetch(
        `http://${EMULATOR_HOST}:${EMULATOR_PORT}/v1/projects/${PROJECT_ID}/databases/(default)/documents/consignment_applications/db-isolation-check`,
        { headers: { Authorization: 'Bearer owner' } }
      );
      assert.strictEqual(defaultRes.status, 404, 'Document must not exist in default database');
    });
  });
});
