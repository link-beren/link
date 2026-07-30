/**
 * סיווג שיחות היסטוריות — הרצה חד-פעמית.
 *
 * הבעיה: המובייל בנה מזהי שיחה בלי תחילית (`uidA_uidB`) בעוד הווב בנה
 * `mentoring_uidA_uidB` / `staff_uidA_uidB`, ומסמך ה-DM נכתב עם
 * type: 'dm' גם כשמדובר בליווי. התוצאה: שאילתות
 * where('type','==','mentoring') לא החזירו את השיחות האלה בכלל.
 *
 * מה זה עושה:
 *   1. גוזר type מהתחילית של מזהה המסמך, ואם אין תחילית — לפי תפקידי
 *      המשתתפים (mentor+student → mentoring, staff+student → staff)
 *   2. משלים mentorUid / studentUid על שיחות ליווי (נדרש לניתוב מצוקות)
 *   3. מעתיק chatNames → participantNames (participantNames הוא הקנוני)
 *   4. מדווח על זוגות שיש להם גם מסמך עם תחילית וגם בלעדיה
 *
 * הרצה (מתיקיית functions):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json \
 *   node scripts/classify-mentoring-chats.js --dry-run
 *   node scripts/classify-mentoring-chats.js
 *
 * אידמפוטנטי.
 */

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const DRY_RUN = process.argv.includes('--dry-run');

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

function log(...args) {
  console.log(DRY_RUN ? '[dry-run]' : '[classify]', ...args);
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

/** מזהה חתום בתחילית → הסיווג ודאי. */
function typeFromId(id, isGroup) {
  if (isGroup) return 'group';
  if (id.startsWith('mentoring_')) return 'mentoring';
  if (id.startsWith('staff_')) return 'staff';
  return null;
}

/** בלי תחילית — נגזר מתפקידי שני המשתתפים. */
function typeFromRoles(roles) {
  if (roles.length !== 2) return null;
  const set = new Set(roles);
  if (set.has('mentor') && set.has('student')) return 'mentoring';
  if (set.has('staff') && set.has('student')) return 'staff';
  return 'dm';
}

async function loadRoles(uids) {
  const roles = {};
  const list = [...uids];
  for (let i = 0; i < list.length; i += 300) {
    const chunk = list.slice(i, i + 300);
    const snaps = await db.getAll(...chunk.map(uid => db.collection('users').doc(uid)));
    snaps.forEach((s, idx) => { roles[chunk[idx]] = s.data()?.role || null; });
  }
  return roles;
}

async function main() {
  const chats = await db.collection('chats').get();
  log(`נסרקו ${chats.size} שיחות`);

  const allUids = new Set();
  chats.forEach(c => (c.data().participants || []).forEach(uid => uid && allUids.add(uid)));
  const roles = await loadRoles(allUids);

  const ops = [];
  const stats = { mentoring: 0, staff: 0, dm: 0, group: 0, skipped: 0, names: 0 };
  const pairIndex = new Map(); // "uidA|uidB" -> מזהי המסמכים

  chats.forEach(chat => {
    const data = chat.data();
    const isGroup = data.isGroup === true || data.type === 'group';
    const participants = (data.participants || []).filter(Boolean);

    const derived = typeFromId(chat.id, isGroup) ||
      typeFromRoles(participants.map(uid => roles[uid]).filter(Boolean));

    if (!derived) {
      stats.skipped++;
      return;
    }

    const patch = {};
    if (data.type !== derived) patch.type = derived;

    if (derived === 'mentoring' && participants.length === 2) {
      const mentorUid = participants.find(uid => roles[uid] === 'mentor');
      const studentUid = participants.find(uid => roles[uid] === 'student');
      if (mentorUid && !data.mentorUid) patch.mentorUid = mentorUid;
      if (studentUid && !data.studentUid) patch.studentUid = studentUid;
    }

    // participantNames הוא הקנוני לכותרת השיחה; chatNames נשאר לתאימות
    if (!data.participantNames && data.chatNames) {
      patch.participantNames = data.chatNames;
      stats.names++;
    }

    if (Object.keys(patch).length) {
      ops.push({ ref: chat.ref, data: patch });
      stats[derived]++;
    }

    if (!isGroup && participants.length === 2) {
      const key = [...participants].sort().join('|');
      if (!pairIndex.has(key)) pairIndex.set(key, []);
      pairIndex.get(key).push(chat.id);
    }
  });

  await commitInChunks(ops);

  log('סווגו:', stats);

  // מסמכים כפולים לאותה זוגיות — נוצרו כשהמובייל והווב בנו מזהים שונים.
  // לא ממזגים אוטומטית (איחוד היסטוריית הודעות הוא הרסני) — רק מדווחים.
  const dupes = [...pairIndex.entries()].filter(([, ids]) => ids.length > 1);
  if (dupes.length) {
    console.log(`\n⚠️  ${dupes.length} זוגות עם יותר ממסמך שיחה אחד:`);
    dupes.forEach(([key, ids]) => console.log(`   ${key} → ${ids.join(', ')}`));
    console.log('   מיזוג ידני נדרש; הסקריפט לא נוגע בהודעות.\n');
  }

  if (DRY_RUN) log('לא נכתב דבר — הרץ בלי --dry-run כדי לבצע.');
}

main().catch(err => {
  console.error('הסיווג נכשל:', err);
  process.exit(1);
});
