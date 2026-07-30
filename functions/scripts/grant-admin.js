/**
 * ניהול הרשאות אדמין מהשרת.
 *
 * custom claims ניתנים להגדרה רק מהשרת, ולכן משתמשים בסקריפט הזה כדי
 * לאתחל את המערכת. בשוטף אין צורך בו: הטריגר syncAdminClaim מסנכרן
 * אוטומטית כל שינוי בשדה role, וכל אדמין יכול לקדם אחרים מהפאנל.
 *
 * הרצה:
 *   gcloud auth application-default login
 *   cd functions
 *
 *   node scripts/grant-admin.js --sync-all         # כל מי שכבר role: 'admin'
 *   node scripts/grant-admin.js user@example.com   # הגדרת אדמין חדש
 *   node scripts/grant-admin.js user@example.com --revoke
 */

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const PROJECT_ID = 'link-app-965dd';

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const auth = getAuth();
const db = getFirestore();

const args = process.argv.slice(2);
const syncAll = args.includes('--sync-all');
const revoke = args.includes('--revoke');
const email = args.find(a => !a.startsWith('--'));

/** מעניק/מסיר claim ומיישר את שדה role. מחזיר true אם היה שינוי. */
async function setAdmin(uid, isAdmin) {
  const user = await auth.getUser(uid);
  if ((user.customClaims?.admin === true) === isAdmin) return false;

  await auth.setCustomUserClaims(uid, { admin: isAdmin });
  if (!isAdmin) await auth.revokeRefreshTokens(uid);
  return true;
}

/** מעניק claim לכל מי שכבר מוגדר role: 'admin' ב-Firestore */
async function syncAllAdmins() {
  const snap = await db.collection('users').where('role', '==', 'admin').get();

  if (snap.empty) {
    console.log('לא נמצאו משתמשים עם role: "admin" ב-Firestore.');
    console.log('הרץ: node scripts/grant-admin.js <email> כדי להגדיר את הראשון.');
    return;
  }

  console.log(`נמצאו ${snap.size} אדמינים ב-Firestore:\n`);
  let changed = 0;

  for (const doc of snap.docs) {
    const label = doc.data().email || doc.id;
    try {
      const didChange = await setAdmin(doc.id, true);
      if (didChange) changed++;
      console.log(`  ${didChange ? '✓ הוענק' : '· כבר היה מסונכרן'}  ${label}`);
    } catch (err) {
      const reason = err.code === 'auth/user-not-found'
        ? 'אין חשבון Auth תואם'
        : err.message;
      console.log(`  ✗ נכשל          ${label} — ${reason}`);
    }
  }

  console.log(`\nעודכנו ${changed} מתוך ${snap.size}.`);
}

/** מעניק/מסיר הרשאה למשתמש בודד לפי אימייל */
async function grantByEmail(targetEmail) {
  const user = await auth.getUserByEmail(targetEmail);

  await setAdmin(user.uid, !revoke);
  await db
    .collection('users')
    .doc(user.uid)
    .set({ role: revoke ? 'staff' : 'admin' }, { merge: true });

  console.log(
    revoke
      ? `הרשאת האדמין הוסרה מ-${targetEmail} (${user.uid})`
      : `${targetEmail} (${user.uid}) הוגדר כאדמין`
  );
}

(async () => {
  try {
    if (syncAll) await syncAllAdmins();
    else if (email) await grantByEmail(email);
    else {
      console.error('שימוש: node scripts/grant-admin.js [<email> [--revoke] | --sync-all]');
      process.exit(1);
    }
    console.log('שים לב: הטוקן מתרענן רק בהתחברות מחדש לפאנל.');
    process.exit(0);
  } catch (err) {
    console.error('שגיאה:', err.message);
    process.exit(1);
  }
})();
