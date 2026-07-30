/**
 * מיגרציה לשכבת בתי הספר — הרצה חד-פעמית.
 *
 * מה זה עושה:
 *   1. יוצר בית ספר ברירת מחדל (אם לא קיים) + קוד צוות
 *   2. מצמיד אליו כל חבר צוות וכל מתנדב שאין להם schoolId
 *   3. מצמיד אליו כל כיתה שאין לה schoolId
 *   4. מציב claim schoolId לכל חברי הצוות
 *   5. מסיר schoolId מתלמידים (תלמיד אינו משויך לבית ספר)
 *   6. משלים schoolId על רשומות mentoringHours / mentorSessions לפי המתנדב
 *
 * הרצה (מתיקיית functions):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json \
 *   node scripts/migrate-schools.js --dry-run
 *   node scripts/migrate-schools.js
 *
 * אידמפוטנטי — אפשר להריץ שוב בבטחה.
 */

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const crypto = require('crypto');

const DRY_RUN = process.argv.includes('--dry-run');
const DEFAULT_SCHOOL_NAME = process.env.DEFAULT_SCHOOL_NAME || 'בית הספר הראשי';

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCode() {
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

function log(...args) {
  console.log(DRY_RUN ? '[dry-run]' : '[migrate]', ...args);
}

async function commitInChunks(ops) {
  if (DRY_RUN) return;
  const CHUNK = 400;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + CHUNK)) batch.set(op.ref, op.data, { merge: true });
    await batch.commit();
  }
}

/** מחזיר את בית הספר הקיים היחיד, או יוצר אחד חדש עם קוד. */
async function ensureDefaultSchool() {
  const existing = await db.collection('schools').limit(1).get();
  if (!existing.empty) {
    const doc = existing.docs[0];
    log(`בית ספר קיים: ${doc.id} (${doc.data().name})`);
    return { id: doc.id, name: doc.data().name || DEFAULT_SCHOOL_NAME };
  }

  const code = generateCode();
  const ref = db.collection('schools').doc();
  log(`יוצר בית ספר "${DEFAULT_SCHOOL_NAME}" (${ref.id}) עם קוד ${code}`);

  if (!DRY_RUN) {
    const batch = db.batch();
    batch.set(ref, {
      name: DEFAULT_SCHOOL_NAME,
      city: null,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: 'migrate-schools',
    });
    batch.set(ref.collection('private').doc('code'), {
      code,
      rotatedAt: FieldValue.serverTimestamp(),
    });
    batch.set(db.collection('schoolCodes').doc(code), {
      schoolId: ref.id,
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
  }

  console.log(`\n>>> קוד הצוות של בית הספר: ${code}\n`);
  return { id: ref.id, name: DEFAULT_SCHOOL_NAME };
}

async function migrateUsers(school) {
  const snap = await db.collection('users').get();
  const ops = [];
  const staffUids = [];
  let students = 0;

  snap.forEach(d => {
    const data = d.data();
    const role = data.role;

    if (role === 'student') {
      // תלמיד אינו משויך לבית ספר — מתנדב מכל בית ספר יכול ללוות אותו
      if (data.schoolId || data.schoolName) {
        ops.push({ ref: d.ref, data: {
          schoolId: FieldValue.delete(),
          schoolName: FieldValue.delete(),
        }});
        students++;
      }
      return;
    }

    if (role === 'staff') staffUids.push(d.id);

    if ((role === 'staff' || role === 'mentor') && !data.schoolId) {
      ops.push({ ref: d.ref, data: { schoolId: school.id, schoolName: school.name } });
    }
  });

  log(`משתמשים: ${ops.length - students} משויכים לבית הספר, ${students} תלמידים נוקו`);
  await commitInChunks(ops);
  return staffUids;
}

async function migrateClasses(school) {
  const snap = await db.collection('classes').get();
  const ops = [];
  snap.forEach(d => {
    if (!d.data().schoolId) {
      ops.push({ ref: d.ref, data: { schoolId: school.id } });
    }
  });
  log(`כיתות: ${ops.length} שויכו לבית הספר`);
  await commitInChunks(ops);
}

/** ממלא schoolId על רשומות שעות/סשנים לפי בית הספר של המתנדב. */
async function backfillCollection(name, mentorField, school) {
  const snap = await db.collection(name).get();
  if (snap.empty) {
    log(`${name}: אין רשומות`);
    return;
  }

  const uids = [...new Set(snap.docs.map(d => d.data()[mentorField]).filter(Boolean))];
  const schoolByUid = {};
  for (let i = 0; i < uids.length; i += 300) {
    const chunk = uids.slice(i, i + 300);
    const userSnaps = await db.getAll(...chunk.map(uid => db.collection('users').doc(uid)));
    userSnaps.forEach((s, idx) => { schoolByUid[chunk[idx]] = s.data()?.schoolId || school.id; });
  }

  const ops = [];
  snap.forEach(d => {
    if (d.data().schoolId) return;
    const uid = d.data()[mentorField];
    ops.push({ ref: d.ref, data: { schoolId: schoolByUid[uid] || school.id } });
  });

  log(`${name}: ${ops.length} רשומות קיבלו schoolId`);
  await commitInChunks(ops);
}

/**
 * מציב claim schoolId לחברי הצוות. בלי זה החוקים נופלים ל-get() על
 * מסמך המשתמש בכל הערכה — עובד, אבל עלות קריאה מיותרת.
 */
async function setStaffClaims(staffUids, school) {
  let updated = 0;
  for (const uid of staffUids) {
    try {
      const user = await getAuth().getUser(uid);
      if (user.customClaims?.schoolId === school.id) continue;
      if (!DRY_RUN) {
        await getAuth().setCustomUserClaims(uid, {
          ...(user.customClaims || {}),
          schoolId: school.id,
        });
      }
      updated++;
    } catch (err) {
      if (err.code !== 'auth/user-not-found') throw err;
    }
  }
  log(`claims: ${updated} חברי צוות עודכנו`);
}

async function main() {
  const school = await ensureDefaultSchool();
  const staffUids = await migrateUsers(school);
  await migrateClasses(school);
  await backfillCollection('mentoringHours', 'mentorUid', school);
  await backfillCollection('mentorSessions', 'uid', school);
  await setStaffClaims(staffUids, school);

  log('הסתיים.');
  if (DRY_RUN) log('לא נכתב דבר — הרץ בלי --dry-run כדי לבצע.');
  else log('חברי הצוות צריכים להתחבר מחדש כדי לקבל את ה-claim החדש.');
}

main().catch(err => {
  console.error('המיגרציה נכשלה:', err);
  process.exit(1);
});
