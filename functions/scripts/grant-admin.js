/**
 * Manage admin privileges from the server (US deployment).
 *
 * Custom claims can only be set server-side, so this script exists to
 * bootstrap the system: it creates the first admin, after which the
 * usSyncAdminClaim* triggers keep the claim in step with the `role` field
 * and any admin can promote others from the panel.
 *
 * Usage:
 *   gcloud auth application-default login
 *   cd functions
 *
 *   node scripts/grant-admin.js --sync-all         # everyone already role: 'admin'
 *   node scripts/grant-admin.js user@example.com   # make someone an admin
 *   node scripts/grant-admin.js user@example.com --revoke
 */

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const PROJECT_ID = 'link-app-965dd';
// The US product lives in a named database alongside the Israeli one in the
// same project. getFirestore() with no argument returns the DEFAULT database,
// which is the Israeli data — running this script without the id would grant
// admin against the wrong country's users.
const DB_ID = 'usa';

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const auth = getAuth();
const db = getFirestore(DB_ID);

const args = process.argv.slice(2);
const syncAll = args.includes('--sync-all');
const revoke = args.includes('--revoke');
const email = args.find(a => !a.startsWith('--'));

/**
 * Grant or remove the admin claim. Returns true if anything changed.
 *
 * setCustomUserClaims replaces the entire claims object, so the existing
 * claims are read and spread back in. Writing { admin: true } on its own
 * would drop the user's schoolId claim and lock them out of their school.
 */
async function setAdmin(uid, isAdmin) {
  const user = await auth.getUser(uid);
  const claims = user.customClaims || {};
  if ((claims.admin === true) === isAdmin) return false;

  await auth.setCustomUserClaims(uid, { ...claims, admin: isAdmin });
  if (!isAdmin) await auth.revokeRefreshTokens(uid);
  return true;
}

/** Give the claim to everyone already marked role: 'admin' in Firestore. */
async function syncAllAdmins() {
  const snap = await db.collection('users').where('role', '==', 'admin').get();

  if (snap.empty) {
    console.log('No users with role: "admin" found in Firestore.');
    console.log('Run: node scripts/grant-admin.js <email> to create the first one.');
    return;
  }

  console.log(`Found ${snap.size} admin(s) in Firestore:\n`);
  let changed = 0;

  for (const doc of snap.docs) {
    const label = doc.data().email || doc.id;
    try {
      const didChange = await setAdmin(doc.id, true);
      if (didChange) changed++;
      console.log(`  ${didChange ? '✓ granted    ' : '· already set'}  ${label}`);
    } catch (err) {
      const reason = err.code === 'auth/user-not-found'
        ? 'no matching Auth account'
        : err.message;
      console.log(`  ✗ failed       ${label} — ${reason}`);
    }
  }

  console.log(`\nUpdated ${changed} of ${snap.size}.`);
}

/** Grant or revoke for a single user by email. */
async function grantByEmail(targetEmail) {
  const user = await auth.getUserByEmail(targetEmail);

  await setAdmin(user.uid, !revoke);
  await db
    .collection('users')
    .doc(user.uid)
    .set({ role: revoke ? 'staff' : 'admin' }, { merge: true });

  console.log(
    revoke
      ? `Admin access removed from ${targetEmail} (${user.uid})`
      : `${targetEmail} (${user.uid}) is now an admin`
  );
}

(async () => {
  try {
    if (syncAll) await syncAllAdmins();
    else if (email) await grantByEmail(email);
    else {
      console.error('Usage: node scripts/grant-admin.js [<email> [--revoke] | --sync-all]');
      process.exit(1);
    }
    console.log('Note: the token only picks this up on the next sign-in.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
