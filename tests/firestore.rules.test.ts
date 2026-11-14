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

// Keep this synthetic project ID aligned with the test:rules command.
const PROJECT_ID = 'demo-wailtail-stage3';
const DATABASE_ID = 'ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e';
const emulatorAddress = process.env.FIRESTORE_EMULATOR_HOST ?? '';
const loopback = /^127\.0\.0\.1:(\d{1,5})$/.exec(emulatorAddress);
if (!loopback || Number(loopback[1]) < 1 || Number(loopback[1]) > 65535) {
  throw new Error('Firestore rules tests require a loopback emulator. Run npm run test:rules.');
}
const EMULATOR_HOST = '127.0.0.1';
const EMULATOR_PORT = Number(loopback[1]);

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
          email: ADMIN_EMAIL,
          email_verified: true
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

  describe('Firestore Security Rules — M2.0B Canonical Profile Role Hardening', () => {
    const PROFILE_COLLECTIONS = ['users', 'bidders'] as const;
    const ADMIN_1_EMAIL = 'jeremygoodmurphy@gmail.com';
    const ADMIN_2_EMAIL = 'jeremy@theinnovativegroup.ca';
    const ORDINARY_USER_UID = 'ordinary-member-1';
    const ORDINARY_USER_EMAIL = 'ordinary@wailtail.com';
    const OTHER_UID = 'ordinary-member-2';
    const OTHER_EMAIL = 'member2@wailtail.com';

    for (const col of PROFILE_COLLECTIONS) {
      describe(`Collection: ${col}`, () => {
        // 1. Owner cannot create their own profile with role: 'admin'
        test(`1. Owner cannot create their own ${col} profile with role: 'admin'`, async () => {
          const userCtx = testEnv.authenticatedContext(ORDINARY_USER_UID, {
            email: ORDINARY_USER_EMAIL,
            email_verified: true
          });
          const db = getNamedDb(userCtx);

          await assertFails(
            setDoc(doc(db, col, ORDINARY_USER_UID), {
              uid: ORDINARY_USER_UID,
              email: ORDINARY_USER_EMAIL,
              role: 'admin'
            })
          );
        });

        // 2. Owner cannot create their own profile with role: 'seller'
        test(`2. Owner cannot create their own ${col} profile with role: 'seller'`, async () => {
          const userCtx = testEnv.authenticatedContext(ORDINARY_USER_UID, {
            email: ORDINARY_USER_EMAIL,
            email_verified: true
          });
          const db = getNamedDb(userCtx);

          await assertFails(
            setDoc(doc(db, col, ORDINARY_USER_UID), {
              uid: ORDINARY_USER_UID,
              email: ORDINARY_USER_EMAIL,
              role: 'seller'
            })
          );
        });

        // Baseline: Owner can create their own profile with baseline role: 'bidder' or omitted role
        test(`Owner can create their own ${col} profile with role: 'bidder' or omitted role`, async () => {
          const userCtx = testEnv.authenticatedContext(ORDINARY_USER_UID, {
            email: ORDINARY_USER_EMAIL,
            email_verified: true
          });
          const db = getNamedDb(userCtx);

          await assertSucceeds(
            setDoc(doc(db, col, ORDINARY_USER_UID), {
              uid: ORDINARY_USER_UID,
              email: ORDINARY_USER_EMAIL,
              displayName: 'Ordinary Member',
              role: 'bidder',
              registeredAt: Date.now()
            })
          );
        });

        // Correction B: Owner cannot create their own profile with isEmailVerified: true when Firebase token is unverified
        test(`Owner cannot create their own ${col} profile with isEmailVerified: true when token is unverified (Correction B)`, async () => {
          const userCtx = testEnv.authenticatedContext(ORDINARY_USER_UID, {
            email: ORDINARY_USER_EMAIL,
            email_verified: false
          });
          const db = getNamedDb(userCtx);

          await assertFails(
            setDoc(doc(db, col, ORDINARY_USER_UID), {
              uid: ORDINARY_USER_UID,
              email: ORDINARY_USER_EMAIL,
              displayName: 'Unverified Member',
              role: 'bidder',
              isEmailVerified: true,
              registeredAt: Date.now()
            })
          );
        });

        // Correction B: Owner CAN create their own profile with isEmailVerified: false when Firebase token is unverified
        test(`Owner can create their own ${col} profile with isEmailVerified: false when token is unverified (Correction B)`, async () => {
          const userCtx = testEnv.authenticatedContext(ORDINARY_USER_UID, {
            email: ORDINARY_USER_EMAIL,
            email_verified: false
          });
          const db = getNamedDb(userCtx);

          await assertSucceeds(
            setDoc(doc(db, col, ORDINARY_USER_UID), {
              uid: ORDINARY_USER_UID,
              email: ORDINARY_USER_EMAIL,
              displayName: 'Unverified Member',
              role: 'bidder',
              isEmailVerified: false,
              registeredAt: Date.now()
            })
          );
        });

        // Correction B: Owner CAN create their own profile with isEmailVerified: true when Firebase token IS verified
        test(`Owner can create their own ${col} profile with isEmailVerified: true when token is verified (Correction B)`, async () => {
          const userCtx = testEnv.authenticatedContext(ORDINARY_USER_UID, {
            email: ORDINARY_USER_EMAIL,
            email_verified: true
          });
          const db = getNamedDb(userCtx);

          await assertSucceeds(
            setDoc(doc(db, col, ORDINARY_USER_UID), {
              uid: ORDINARY_USER_UID,
              email: ORDINARY_USER_EMAIL,
              displayName: 'Verified Member',
              role: 'bidder',
              isEmailVerified: true,
              registeredAt: Date.now()
            })
          );
        });

        // 3. Owner cannot create another UID's profile
        test(`3. Owner cannot create another UID's ${col} profile`, async () => {
          const userCtx = testEnv.authenticatedContext(ORDINARY_USER_UID, {
            email: ORDINARY_USER_EMAIL,
            email_verified: true
          });
          const db = getNamedDb(userCtx);

          await assertFails(
            setDoc(doc(db, col, OTHER_UID), {
              uid: OTHER_UID,
              email: OTHER_EMAIL,
              role: 'bidder'
            })
          );
        });

        // Owner cannot inject protected dealerId or ban status on create
        test(`Owner cannot inject protected dealerId or ban status on ${col} create`, async () => {
          const userCtx = testEnv.authenticatedContext(ORDINARY_USER_UID, {
            email: ORDINARY_USER_EMAIL,
            email_verified: true
          });
          const db = getNamedDb(userCtx);

          await assertFails(
            setDoc(doc(db, col, ORDINARY_USER_UID), {
              uid: ORDINARY_USER_UID,
              dealerId: 'dealer-123',
              role: 'bidder'
            })
          );

          await assertFails(
            setDoc(doc(db, col, ORDINARY_USER_UID), {
              uid: ORDINARY_USER_UID,
              isBanned: false,
              role: 'bidder'
            })
          );
        });

        // Setup existing baseline profile before update tests
        describe('Update Guards', () => {
          beforeEach(async () => {
            await testEnv.withSecurityRulesDisabled(async (context) => {
              const rootDb = getNamedDb(context);
              await setDoc(doc(rootDb, col, ORDINARY_USER_UID), {
                uid: ORDINARY_USER_UID,
                email: ORDINARY_USER_EMAIL,
                displayName: 'Ordinary Member',
                role: 'bidder',
                isEmailVerified: true,
                totalBidsPlaced: 1,
                registeredAt: Date.now()
              });
              await setDoc(doc(rootDb, col, OTHER_UID), {
                uid: OTHER_UID,
                email: OTHER_EMAIL,
                displayName: 'Other Member',
                role: 'bidder',
                isEmailVerified: true,
                totalBidsPlaced: 0,
                registeredAt: Date.now()
              });
            });
          });

          // 4. Owner cannot change their own role to 'admin'
          test(`4. Owner cannot change their own role to 'admin' in ${col}`, async () => {
            const userCtx = testEnv.authenticatedContext(ORDINARY_USER_UID, {
              email: ORDINARY_USER_EMAIL,
              email_verified: true
            });
            const db = getNamedDb(userCtx);

            await assertFails(
              updateDoc(doc(db, col, ORDINARY_USER_UID), {
                role: 'admin'
              })
            );
          });

          // 5. Owner cannot change their own role to 'seller'
          test(`5. Owner cannot change their own role to 'seller' in ${col}`, async () => {
            const userCtx = testEnv.authenticatedContext(ORDINARY_USER_UID, {
              email: ORDINARY_USER_EMAIL,
              email_verified: true
            });
            const db = getNamedDb(userCtx);

            await assertFails(
              updateDoc(doc(db, col, ORDINARY_USER_UID), {
                role: 'seller'
              })
            );
          });

          // 6. Owner cannot change another user's role
          test(`6. Owner cannot change another user's role in ${col}`, async () => {
            const userCtx = testEnv.authenticatedContext(ORDINARY_USER_UID, {
              email: ORDINARY_USER_EMAIL,
              email_verified: true
            });
            const db = getNamedDb(userCtx);

            await assertFails(
              updateDoc(doc(db, col, OTHER_UID), {
                role: 'seller'
              })
            );
          });

          // 7. Owner cannot change protected dealerId
          test(`7. Owner cannot change protected dealerId in ${col}`, async () => {
            const userCtx = testEnv.authenticatedContext(ORDINARY_USER_UID, {
              email: ORDINARY_USER_EMAIL,
              email_verified: true
            });
            const db = getNamedDb(userCtx);

            await assertFails(
              updateDoc(doc(db, col, ORDINARY_USER_UID), {
                dealerId: 'dealer-fraud-1'
              })
            );
          });

          // Owner cannot modify ban flags
          test(`Owner cannot modify ban flags in ${col}`, async () => {
            const userCtx = testEnv.authenticatedContext(ORDINARY_USER_UID, {
              email: ORDINARY_USER_EMAIL,
              email_verified: true
            });
            const db = getNamedDb(userCtx);

            await assertFails(
              updateDoc(doc(db, col, ORDINARY_USER_UID), {
                isBanned: false,
                bannedFromBidding: false
              })
            );
          });

          // 8. Ordinary permitted profile updates continue to work
          test(`8. Ordinary permitted profile updates continue to work in ${col}`, async () => {
            const userCtx = testEnv.authenticatedContext(ORDINARY_USER_UID, {
              email: ORDINARY_USER_EMAIL,
              email_verified: true
            });
            const db = getNamedDb(userCtx);

            await assertSucceeds(
              updateDoc(doc(db, col, ORDINARY_USER_UID), {
                displayName: 'Updated Name',
                phone: '416-555-0199',
                totalBidsPlaced: 2,
                highestBidPlaced: 45000,
                updatedAt: Date.now()
              })
            );
          });

          // Correction B: Owner cannot update their own isEmailVerified to true when token is unverified
          test(`Owner cannot update their own isEmailVerified to true in ${col} when token is unverified (Correction B)`, async () => {
            await testEnv.withSecurityRulesDisabled(async (context) => {
              const rootDb = getNamedDb(context);
              await setDoc(doc(rootDb, col, ORDINARY_USER_UID), {
                uid: ORDINARY_USER_UID,
                email: ORDINARY_USER_EMAIL,
                displayName: 'Ordinary Member',
                role: 'bidder',
                isEmailVerified: false,
                totalBidsPlaced: 1,
                registeredAt: Date.now()
              });
            });

            const unverifiedCtx = testEnv.authenticatedContext(ORDINARY_USER_UID, {
              email: ORDINARY_USER_EMAIL,
              email_verified: false
            });
            const db = getNamedDb(unverifiedCtx);

            await assertFails(
              updateDoc(doc(db, col, ORDINARY_USER_UID), {
                isEmailVerified: true
              })
            );
          });

          // Correction B: Unverified user CAN perform legitimate ordinary profile updates without touching isEmailVerified
          test(`Unverified user can perform legitimate ordinary profile updates in ${col} without modifying isEmailVerified (Correction B)`, async () => {
            await testEnv.withSecurityRulesDisabled(async (context) => {
              const rootDb = getNamedDb(context);
              await setDoc(doc(rootDb, col, ORDINARY_USER_UID), {
                uid: ORDINARY_USER_UID,
                email: ORDINARY_USER_EMAIL,
                displayName: 'Ordinary Member',
                role: 'bidder',
                isEmailVerified: false,
                totalBidsPlaced: 1,
                registeredAt: Date.now()
              });
            });

            const unverifiedCtx = testEnv.authenticatedContext(ORDINARY_USER_UID, {
              email: ORDINARY_USER_EMAIL,
              email_verified: false
            });
            const db = getNamedDb(unverifiedCtx);

            await assertSucceeds(
              updateDoc(doc(db, col, ORDINARY_USER_UID), {
                displayName: 'Updated Unverified Name',
                phone: '416-555-0188',
                updatedAt: Date.now()
              })
            );
          });

          // Correction B: Verified user CAN update their own isEmailVerified to true
          test(`Verified user can update their own isEmailVerified to true in ${col} (Correction B)`, async () => {
            await testEnv.withSecurityRulesDisabled(async (context) => {
              const rootDb = getNamedDb(context);
              await setDoc(doc(rootDb, col, ORDINARY_USER_UID), {
                uid: ORDINARY_USER_UID,
                email: ORDINARY_USER_EMAIL,
                displayName: 'Ordinary Member',
                role: 'bidder',
                isEmailVerified: false,
                totalBidsPlaced: 1,
                registeredAt: Date.now()
              });
            });

            const verifiedCtx = testEnv.authenticatedContext(ORDINARY_USER_UID, {
              email: ORDINARY_USER_EMAIL,
              email_verified: true
            });
            const db = getNamedDb(verifiedCtx);

            await assertSucceeds(
              updateDoc(doc(db, col, ORDINARY_USER_UID), {
                isEmailVerified: true,
                updatedAt: Date.now()
              })
            );
          });

          // 9. Designated administrators retain authorized role-management capability
          test(`9. Designated administrator 1 retains authorized role-management capability in ${col}`, async () => {
            const adminCtx = testEnv.authenticatedContext('admin-uid-1', {
              email: ADMIN_1_EMAIL,
              email_verified: true
            });
            const db = getNamedDb(adminCtx);

            await assertSucceeds(
              updateDoc(doc(db, col, ORDINARY_USER_UID), {
                role: 'seller',
                updatedAt: Date.now()
              })
            );

            await assertSucceeds(
              updateDoc(doc(db, col, ORDINARY_USER_UID), {
                role: 'admin',
                updatedAt: Date.now()
              })
            );
          });

          // 11. Second designated administrator recognized
          test(`11. Second designated administrator (${ADMIN_2_EMAIL}) retains authorized role-management capability in ${col}`, async () => {
            const adminCtx = testEnv.authenticatedContext('admin-uid-2', {
              email: ADMIN_2_EMAIL,
              email_verified: true
            });
            const db = getNamedDb(adminCtx);

            await assertSucceeds(
              updateDoc(doc(db, col, ORDINARY_USER_UID), {
                role: 'seller',
                updatedAt: Date.now()
              })
            );
          });

          // Admin with unverified email cannot modify roles
          test(`Admin with unverified email cannot modify roles in ${col}`, async () => {
            const unverifiedAdminCtx = testEnv.authenticatedContext('admin-uid-unverified', {
              email: ADMIN_1_EMAIL,
              email_verified: false
            });
            const db = getNamedDb(unverifiedAdminCtx);

            await assertFails(
              updateDoc(doc(db, col, ORDINARY_USER_UID), {
                role: 'seller'
              })
            );
          });
        });
      });
    }

    // 10. An unrelated user cannot obtain admin privileges by storing role: 'admin' in a profile
    test('10. An unrelated user cannot obtain admin privileges by having role: "admin" in their profile', async () => {
      const attackerUid = 'attacker-uid';
      const attackerEmail = 'attacker@evil.com';

      // Seed an attacker profile document with role: 'admin' using rules-disabled admin bypass
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const rootDb = getNamedDb(context);
        await setDoc(doc(rootDb, 'users', attackerUid), {
          uid: attackerUid,
          email: attackerEmail,
          role: 'admin',
          isEmailVerified: true
        });
      });

      // Attacker signs in with attackerEmail and valid token
      const attackerCtx = testEnv.authenticatedContext(attackerUid, {
        email: attackerEmail,
        email_verified: true
      });
      const db = getNamedDb(attackerCtx);

      // Attempt to access administrative dealer_profiles collection (protected by isAdmin())
      await assertFails(
        setDoc(doc(db, 'dealer_profiles', 'rogue-dealer'), {
          legalBusinessName: 'Rogue Dealership Inc.',
          dealerLicenseNumber: 'ROGUE-999'
        })
      );

      // Attempt to update another user's role
      await assertFails(
        updateDoc(doc(db, 'users', OTHER_UID), {
          role: 'admin'
        })
      );
    });

    // Correction A & B: User cannot use isEmailVerified in users or bidders to gain administrator authority
    test('Correction A & B: User cannot use isEmailVerified in users or bidders to gain administrator authority', async () => {
      const nonAdminUid = 'non-admin-verified-uid';
      const nonAdminEmail = 'user.with.verified.profile@wailtail.com';

      // Seed profile with isEmailVerified: true and role: 'bidder'
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const rootDb = getNamedDb(context);
        await setDoc(doc(rootDb, 'users', nonAdminUid), {
          uid: nonAdminUid,
          email: nonAdminEmail,
          role: 'bidder',
          isEmailVerified: true
        });
        await setDoc(doc(rootDb, 'bidders', nonAdminUid), {
          uid: nonAdminUid,
          email: nonAdminEmail,
          role: 'bidder',
          isEmailVerified: true
        });
      });

      const userCtx = testEnv.authenticatedContext(nonAdminUid, {
        email: nonAdminEmail,
        email_verified: true
      });
      const db = getNamedDb(userCtx);

      // Attempt to access admin collections (must fail because email is not designated admin)
      await assertFails(
        setDoc(doc(db, 'dealer_profiles', 'dealer-bypass-attempt'), {
          legalBusinessName: 'Bypass Inc.'
        })
      );

      // Attempt to update another user's role (must fail)
      await assertFails(
        updateDoc(doc(db, 'users', OTHER_UID), {
          role: 'admin'
        })
      );
    });

    // Allowlisted admin identity with unverified token cannot exercise administrator authority
    test('Allowlisted admin with unverified Firebase token cannot exercise administrative authority', async () => {
      const unverifiedAdminCtx = testEnv.authenticatedContext('admin-unverified-uid', {
        email: ADMIN_1_EMAIL,
        email_verified: false
      });
      const db = getNamedDb(unverifiedAdminCtx);

      // Attempt to write to admin-only collection
      await assertFails(
        setDoc(doc(db, 'dealer_profiles', 'unverified-admin-dealer'), {
          legalBusinessName: 'Unverified Admin Corp.'
        })
      );

      // Attempt to modify another user's role
      await assertFails(
        updateDoc(doc(db, 'users', OTHER_UID), {
          role: 'seller'
        })
      );
    });
  });
});


describe('Firestore Security Rules — Auction Security Gate Stage 2', () => {
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
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await clearNamedDatabase();
    await testEnv.withSecurityRulesDisabled(async ctx => {
      const db = getNamedDb(ctx);
      await Promise.all([
        setDoc(doc(db, 'auctions/lot'), { sellerId: 'seller', status: 'draft', reserveAmount: 10000 }),
        setDoc(doc(db, 'auctions/lot/bids/bid'), { bidderEmail: 'bidder@example.com' }),
        setDoc(doc(db, 'auctions/lot/media/hero'), { private: true }),
        setDoc(doc(db, 'auctionPublic/published'), { title: 'Published lot' }),
        setDoc(doc(db, 'auctionPublic/published/media/hero'), { assetId: 'hero' }),
        setDoc(doc(db, 'auctionPublic/unpublished/media/hero'), { assetId: 'hero' }),
        setDoc(doc(db, 'auctionPublic/published/internal/item'), { private: true }),
        setDoc(doc(db, 'users/seller'), { uid: 'seller', role: 'seller' }),
        setDoc(doc(db, 'bidders/seller'), { uid: 'seller', role: 'seller' }),
        setDoc(doc(db, 'auctionNotificationOutbox/private'), { to: ['private@example.test'], status: 'queued' }),
        setDoc(doc(db, 'settings/promotions'), { enabled: true })
      ]);
    });
  });

  for (const uid of ['guest', 'seller', 'other']) {
    test(`${uid} cannot mutate canonical auctions or protected feeds`, async () => {
      const ctx = uid === 'guest' ? testEnv.unauthenticatedContext() : testEnv.authenticatedContext(uid);
      const db = getNamedDb(ctx);
      await assertFails(setDoc(doc(db, 'auctions/new'), { sellerId: uid }));
      await assertFails(updateDoc(doc(db, 'auctions/lot'), { sellerId: uid, reserveAmount: 1 }));
      await assertFails(deleteDoc(doc(db, 'auctions/lot')));
      for (const path of ['auctions/lot/bids/new', 'auctions/lot/media/new', 'auctions/lot/unknown/new',
        'bids/new', 'comments/new', 'auctionPublic/new', 'settings/promotions', 'settings/media-lot',
        'promo_analytics/new', 'inquiries/new', 'auctionNotificationOutbox/new', 'mail/new', 'emails/new', 'emailLogs/new']) {
        await assertFails(setDoc(doc(db, path), { actor: uid }));
      }
    });
  }

  test('public reads are limited to published projections and explicit feeds', async () => {
    const db = getNamedDb(testEnv.unauthenticatedContext());
    await assertSucceeds(getDoc(doc(db, 'auctionPublic/published')));
    await assertSucceeds(getDoc(doc(db, 'auctionPublic/published/media/hero')));
    await assertSucceeds(getDoc(doc(db, 'settings/promotions')));
    for (const path of ['auctions/lot', 'auctions/lot/bids/bid', 'auctions/lot/media/hero',
      'auctionPublic/unpublished/media/hero', 'auctionPublic/published/internal/item', 'auctionNotificationOutbox/private']) {
      await assertFails(getDoc(doc(db, path)));
    }
  });

  test('profile reads are self-scoped and clients cannot delete their own moderation records', async () => {
    const self = getNamedDb(testEnv.authenticatedContext('seller'));
    const other = getNamedDb(testEnv.authenticatedContext('other'));
    for (const name of ['users', 'bidders']) {
      await assertSucceeds(getDoc(doc(self, name, 'seller')));
      await assertFails(getDoc(doc(other, name, 'seller')));
      await assertFails(getDocs(collection(self, name)));
      await assertFails(deleteDoc(doc(self, name, 'seller')));
    }
  });

  for (const email of [ADMIN_EMAIL, 'jeremy@theinnovativegroup.ca']) {
    test(`verified designated administrator retains privileged reads (${email})`, async () => {
      const db = getNamedDb(testEnv.authenticatedContext('admin', { email, email_verified: true }));
      const unverified = getNamedDb(testEnv.authenticatedContext('unverified', { email, email_verified: false }));
      await assertSucceeds(getDoc(doc(db, 'auctions/lot')));
      await assertSucceeds(getDoc(doc(db, 'auctionNotificationOutbox/private')));
      await assertFails(setDoc(doc(db, 'auctionNotificationOutbox/direct'), { status: 'queued' }));
      await assertSucceeds(getDoc(doc(db, 'auctions/lot/bids/bid')));
      await assertSucceeds(getDocs(collection(db, 'users')));
      await assertSucceeds(updateDoc(doc(db, 'settings/promotions'), { enabled: false }));
      await assertFails(getDoc(doc(unverified, 'auctions/lot')));
      await assertFails(updateDoc(doc(db, 'auctions/lot'), { sellerId: 'other' }));
    });
  }
  test('member administration, branding and promotions remain administrator-scoped', async () => {
    const admin = getNamedDb(testEnv.authenticatedContext('admin', { email: ADMIN_EMAIL, email_verified: true }));
    const member = getNamedDb(testEnv.authenticatedContext('seller', { email: APPLICANT_EMAIL, email_verified: true }));
    const guest = getNamedDb(testEnv.unauthenticatedContext());
    for (const name of ['users', 'bidders']) {
      await assertSucceeds(updateDoc(doc(admin, name, 'seller'), { role: 'bidder', isBanned: true, bannedFromBidding: true }));
      await assertFails(updateDoc(doc(member, name, 'seller'), { isBanned: false }));
      await assertFails(updateDoc(doc(member, name, 'seller'), { role: 'admin' }));
      await assertFails(updateDoc(doc(member, name, 'seller'), { watchlist: ['lot'] }));
      await assertSucceeds(updateDoc(doc(member, name, 'seller'), { displayName: 'My display name' }));
    }
    await assertSucceeds(setDoc(doc(admin, 'settings/global'), { siteName: 'Test brand', privateAdminField: 'private' }));
    await assertFails(getDoc(doc(guest, 'settings/global')));
    await assertFails(updateDoc(doc(member, 'settings/global'), { siteName: 'Spoofed' }));
    await assertSucceeds(updateDoc(doc(admin, 'settings/promotions'), { enabled: false, cards: [{ imageUrl: 'https://example.test/promo.jpg' }] }));
    await assertSucceeds(getDoc(doc(guest, 'settings/promotions')));
    await assertFails(updateDoc(doc(member, 'settings/promotions'), { enabled: true }));
    for (const context of [admin, member, guest]) {
      await assertFails(setDoc(doc(context, 'inquiries/client-spoof'), { senderId: 'seller' }));
      await assertFails(setDoc(doc(context, 'memberActionLimits/seller'), { lastInquiryAt: 0 }));
      await assertFails(deleteDoc(doc(context, 'auctions/lot')));
    }
  });

  test('M2.1 internal review and history are private and cannot be forged by any client', async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = getNamedDb(context);
      await setDoc(doc(db, 'consignmentReviews/application'), { revision: 1, assigneeEmail: ADMIN_EMAIL });
      await setDoc(doc(db, 'consignmentReviews/application/events/event'), { value: 'PRIVATE', revision: 1 });
      await setDoc(doc(db, 'consignment_applications/applicant-record'), { sellerEmail: APPLICANT_EMAIL, status: 'pending' });
    });
    const actors = [
      testEnv.unauthenticatedContext(),
      testEnv.authenticatedContext('applicant', { email: APPLICANT_EMAIL, email_verified: true }),
      testEnv.authenticatedContext('other', { email: OTHER_USER_EMAIL, email_verified: true, role: 'admin' }),
      testEnv.authenticatedContext('unverified', { email: ADMIN_EMAIL, email_verified: false })
    ];
    for (const actor of actors) {
      const db = getNamedDb(actor);
      for (const path of ['consignmentReviews/application', 'consignmentReviews/application/events/event']) {
        await assertFails(getDoc(doc(db, path)));
        await assertFails(setDoc(doc(db, path), { value: 'forged' }));
      }
    }
    const applicant = getNamedDb(testEnv.authenticatedContext('owner', { email: APPLICANT_EMAIL, email_verified: true }));
    await assertSucceeds(getDoc(doc(applicant, 'consignment_applications/applicant-record')));
    for (const email of [ADMIN_EMAIL, 'jeremy@theinnovativegroup.ca']) {
      const db = getNamedDb(testEnv.authenticatedContext(email, { email, email_verified: true }));
      for (const path of ['consignmentReviews/application', 'consignmentReviews/application/events/event']) {
        await assertSucceeds(getDoc(doc(db, path)));
        await assertFails(setDoc(doc(db, path), { value: 'forged' }));
        await assertFails(updateDoc(doc(db, path), { value: 'changed' }));
        await assertFails(deleteDoc(doc(db, path)));
      }
    }
  });

  test('M2.2 dealer intake and idempotency records cannot bypass trusted submission', async () => {
    for (const email of [undefined, APPLICANT_EMAIL]) {
      const db = getNamedDb(email ? testEnv.authenticatedContext('applicant', { email, email_verified: true }) : testEnv.unauthenticatedContext());
      for (const name of ['consignment_applications', 'consignments']) {
        const legacy = { status: 'pending', sellerEmail: APPLICANT_EMAIL, year: 2000, make: 'Test', model: 'Vehicle' };
        await assertSucceeds(setDoc(doc(db, name, `old-private-${email ? 'auth' : 'guest'}`), legacy));
        await assertSucceeds(setDoc(doc(db, name, `explicit-private-${email ? 'auth' : 'guest'}`), { ...legacy, applicantType: 'private' }));
        for (const extra of [{ applicantType: 'dealer' }, { applicantType: 'other' },
          { submittedDealershipName: 'Bypass' }, { submittedDbaName: 'Bypass' }, { submittedDealerLicenseNumber: '123' },
          { submittedLicensingJurisdiction: 'ON' }, { dealershipOwnershipDeclaration: true }, { legalSellerOfRecordDeclaration: true },
          { noBrokeredInventoryDeclaration: true }, { declarationVersion: 'forged' }, { declarationAcceptedAt: 1 }]) {
          await assertFails(setDoc(doc(db, name, 'bypass'), { ...legacy, ...extra }));
        }
      }
      await assertFails(setDoc(doc(db, 'consignmentIntakeCommands/forged'), { hash: 'forged' }));
      await assertFails(getDoc(doc(db, 'consignmentIntakeCommands/forged')));
    }
    const admin = getNamedDb(testEnv.authenticatedContext('admin', { email: ADMIN_EMAIL, email_verified: true }));
    await assertFails(setDoc(doc(admin, 'consignmentIntakeCommands/forged'), { hash: 'forged' }));
    await assertFails(getDoc(doc(admin, 'consignmentIntakeCommands/forged')));
  });

  test('M2.3 profiles, cases, claims and immutable audit history require trusted server mutations', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      const db = getNamedDb(ctx);
      for (const collection of ['dealer_profiles', 'dealerVerificationCases', 'dealerIdentityClaims', 'dealer_verification_audits', 'dealerListingCommands', 'dealerListingAudits']) {
        await setDoc(doc(db, collection, 'm23-record'), { dealerId: 'dealer', verificationStatus: 'verified', revision: 1 });
      }
    });
    for (const actor of [testEnv.unauthenticatedContext(),
      testEnv.authenticatedContext('rep', { email: 'rep@example.test', email_verified: true }),
      testEnv.authenticatedContext('admin', { email: ADMIN_EMAIL, email_verified: true })]) {
      const db = getNamedDb(actor);
      for (const collection of ['dealer_profiles', 'dealerVerificationCases', 'dealerIdentityClaims', 'dealer_verification_audits', 'dealerListingCommands', 'dealerListingAudits']) {
        await assertFails(setDoc(doc(db, collection, 'new'), { verificationStatus: 'verified' }));
        await assertFails(updateDoc(doc(db, collection, 'm23-record'), { verificationStatus: 'verified', reason: 'rewrite' }));
        await assertFails(deleteDoc(doc(db, collection, 'm23-record')));
      }
    }
    const admin = getNamedDb(testEnv.authenticatedContext('admin', { email: ADMIN_EMAIL, email_verified: true }));
    for (const collection of ['dealer_profiles', 'dealerVerificationCases', 'dealer_verification_audits', 'dealerListingAudits']) await assertSucceeds(getDoc(doc(admin, collection, 'm23-record')));
    await assertFails(getDoc(doc(admin, 'dealerIdentityClaims', 'm23-record')));
    await assertFails(getDoc(doc(admin, 'dealerListingCommands', 'm23-record')));
  });

});
