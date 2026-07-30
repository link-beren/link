const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { Expo } = require('expo-server-sdk');
const { GRADE_VALUES } = require('./market');

initializeApp();
// US market: named Firestore database, separate from the Israeli default DB.
const DB_ID = 'usa';
const REGION = 'us-central1';
const db = getFirestore(DB_ID);
const expo = new Expo();

async function sendExpoPushNotifications(messages) {
  const validMessages = messages.filter(m => Expo.isExpoPushToken(m.to));
  if (validMessages.length === 0) return;
  const chunks = expo.chunkPushNotifications(validMessages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      console.error('Expo push send error:', err);
    }
  }
}

// התראה על הודעת צ'אט חדשה (DM, קבוצה, או מעורבות חברתית) — לכל המשתתפים חוץ מהשולח
exports.usSendChatNotification = onDocumentCreated(
  { document: 'chats/{chatId}/messages/{messageId}', region: REGION, database: DB_ID },
  async event => {
    const message = event.data.data();
    const { chatId } = event.params;

    const chatSnap = await db.collection('chats').doc(chatId).get();
    if (!chatSnap.exists) return;
    const chat = chatSnap.data();

    const recipientUids = (chat.participants || []).filter(uid => uid && uid !== message.senderId);
    if (recipientUids.length === 0) return;

    const userSnaps = await db.getAll(...recipientUids.map(uid => db.collection('users').doc(uid)));
    const tokens = userSnaps.map(s => s.data()?.expoPushToken).filter(Boolean);
    if (tokens.length === 0) return;

    const title = chat.isGroup ? (chat.groupName || 'קבוצה') : (message.senderName || 'הודעה חדשה');
    const body = chat.isGroup ? `${message.senderName}: ${message.text}` : message.text;

    await sendExpoPushNotifications(tokens.map(to => ({
      to,
      sound: 'default',
      title,
      body,
      data: { chatId, isGroup: !!chat.isGroup },
    })));
  }
);

/**
 * Resolve the school that should handle a student's distress alert.
 *
 * In the Israeli product a student carries no school, so routing had to be
 * derived by walking every mentoring chat the student was in, out to the
 * mentor, out to the mentor's school. Here a US student carries schoolId
 * directly, and a peer mentor is by definition at the same school — so that
 * whole layer collapses into one field read.
 *
 * The alert document is trusted only as a hint: the schoolId is re-read from
 * the student's user document, because a client that could set schoolId on an
 * alert could route its own emergency to the wrong school's staff.
 */
async function resolveAlertSchoolId(alert, studentUid) {
  if (!studentUid) return String(alert?.schoolId || '');
  const snap = await db.collection('users').doc(studentUid).get();
  return String(snap.data()?.schoolId || alert?.schoolId || '');
}

// New distress alert → every staff member at that student's own school.
// schoolId is written back onto the document because the rules and the staff
// portal filter on it, and the client's value is not trusted.
exports.usSendDistressAlertNotification = onDocumentCreated(
  { document: 'distressAlerts/{alertId}', region: REGION, database: DB_ID },
  async event => {
    const alert = event.data.data();
    const { alertId } = event.params;
    const studentUid = alert.uid || alert.studentUid || alert.userId || '';

    const schoolId = await resolveAlertSchoolId(alert, studentUid);

    // No school means nobody is watching. Flag it so it surfaces in the admin
    // panel instead of disappearing silently — this is the one alert type
    // where a dropped message matters.
    const unrouted = !schoolId;
    await event.data.ref.set({ schoolId: schoolId || null, unrouted }, { merge: true });

    const staffQuery = unrouted
      ? db.collection('users').where('role', '==', 'admin')
      : db.collection('users').where('role', '==', 'staff')
          .where('schoolId', '==', schoolId);

    const staffSnap = await staffQuery.get();
    const tokens = staffSnap.docs.map(d => d.data()?.expoPushToken).filter(Boolean);

    console.log(`distress alert ${alertId} routed`, {
      studentUid,
      schoolId,
      unrouted,
      recipients: tokens.length,
    });

    if (tokens.length === 0) return;

    await sendExpoPushNotifications(tokens.map(to => ({
      to,
      sound: 'default',
      title: unrouted ? '🆘 Distress alert with no school' : '🆘 New distress alert',
      body: `${alert.nickname || 'A student'}: ${alert.reasonText || ''}`,
      data: { alertId },
    })));
  }
);

// ══════════════════════════════════════════════════════════════════════
//  Admin callables
//
//  מחיקת משתמש ושינוי תפקיד חייבים לרוץ בשרת:
//  1. חוקי Firestore חוסמים מחיקת /users לחלוטין (allow delete: if false)
//  2. רק ה-Admin SDK יכול למחוק את חשבון ה-Auth עצמו
//  3. ההרשאה נבדקת מול custom claim, שהלקוח לא יכול לזייף
// ══════════════════════════════════════════════════════════════════════

const ALLOWED_ROLES = ['student', 'mentor', 'staff', 'admin'];

/** זורק שגיאה אם הקורא אינו אדמין מאומת. מחזיר את ה-uid שלו. */
function requireAdmin(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'נדרשת התחברות');
  }
  if (request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'הפעולה מותרת לאדמינים בלבד');
  }
  return request.auth.uid;
}

/**
 * מריץ מחיקות/עדכונים בקבוצות של 400 (מגבלת batch היא 500).
 * op.data  → update (המסמך חייב להתקיים)
 * op.merge → set/merge (בטוח גם אם המסמך כבר נמחק)
 * אחרת    → delete
 * @param {Array<{ref: FirebaseFirestore.DocumentReference, data?: object, merge?: object}>} ops
 */
async function commitInChunks(ops) {
  const CHUNK = 400;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + CHUNK)) {
      if (op.data) batch.update(op.ref, op.data);
      else if (op.merge) batch.set(op.ref, op.merge, { merge: true });
      else batch.delete(op.ref);
    }
    await batch.commit();
  }
}

/**
 * מסנכרן אוטומטית את ה-custom claim עם השדה role.
 *
 * המשמעות: כל משתמש שמוגדר role: 'admin' מקבל הרשאה מלאה — לא משנה
 * אם קודם ידנית, מהפאנל, או ישירות בקונסולה של Firebase. אין "אימייל
 * מיוחד" אחד; השדה role הוא מקור האמת וה-claim פשוט עוקב אחריו.
 *
 * בטוח מבחינה אבטחתית כי role לא ניתן לכתיבה מהלקוח:
 * חוק ה-create חוסם role == 'admin', וחוק ה-update מחייב ש-role
 * יישאר ללא שינוי בעדכון עצמי ומתיר לזרים רק mentorStatus/friends.
 */
async function applyAdminClaim(uid, beforeRole, afterRole) {
  console.log(`syncAdminClaim fired for ${uid}`, { beforeRole, afterRole });

  if (beforeRole === afterRole) return;
  const shouldBeAdmin = afterRole === 'admin';

  try {
    const user = await getAuth().getUser(uid);
    if ((user.customClaims?.admin === true) === shouldBeAdmin) return; // כבר מסונכרן

    // setCustomUserClaims מחליף את כל אובייקט ה-claims. בלי המיזוג הזה
    // כל שינוי role היה מוחק את claim ה-schoolId, והצוות היה מאבד את
    // הגישה לבית הספר שלו (החוקים נופלים ל-get() אבל זה עלות מיותרת).
    await getAuth().setCustomUserClaims(uid, {
      ...(user.customClaims || {}),
      admin: shouldBeAdmin,
    });

    // בהורדת הרשאה — מבטלים טוקנים קיימים, אחרת ה-claim הישן
    // ממשיך להיות תקף עד שעה
    if (!shouldBeAdmin) await getAuth().revokeRefreshTokens(uid);

    console.log(`synced admin claim for ${uid}: ${shouldBeAdmin}`);
  } catch (err) {
    if (err.code === 'auth/user-not-found') return;
    throw err;
  }
}

// הטריגר פוצל ל-created/updated במקום written: טריגר ה-written על
// users/{uid} לא הפיק ולו לוג ריצה אחד, בעוד ש-created (sendChatNotification)
// עובד באותו פרויקט ואותו region. מחיקה לא מטופלת כאן ממילא —
// adminDeleteUser מוחק גם את חשבון ה-Auth ואיתו ה-claim.
exports.usSyncAdminClaimOnCreate = onDocumentCreated(
  { document: 'users/{uid}', region: REGION, database: DB_ID },
  async event =>
    applyAdminClaim(event.params.uid, null, event.data?.data()?.role ?? null)
);

exports.usSyncAdminClaimOnUpdate = onDocumentUpdated(
  { document: 'users/{uid}', region: REGION, database: DB_ID },
  async event =>
    applyAdminClaim(
      event.params.uid,
      event.data?.before?.data()?.role ?? null,
      event.data?.after?.data()?.role ?? null
    )
);

/**
 * מחיקת משתמש: מסמך Firestore + חשבון Auth + כל ההפניות היתומות.
 * data: { uid: string }
 */
exports.usAdminDeleteUser = onCall({ region: REGION }, async request => {
  const callerUid = requireAdmin(request);
  const uid = request.data?.uid;

  if (typeof uid !== 'string' || !uid.trim()) {
    throw new HttpsError('invalid-argument', 'חסר מזהה משתמש');
  }
  if (uid === callerUid) {
    throw new HttpsError('failed-precondition', 'לא ניתן למחוק את החשבון שלך');
  }

  const targetSnap = await db.collection('users').doc(uid).get();
  const targetRole = targetSnap.data()?.role;

  // הגנה: לא משאירים את המערכת בלי אדמין אחרון
  if (targetRole === 'admin') {
    const admins = await db.collection('users').where('role', '==', 'admin').get();
    if (admins.size <= 1) {
      throw new HttpsError('failed-precondition', 'לא ניתן למחוק את האדמין האחרון');
    }
  }

  const cleanup = [];

  // 1. הסרה מרשימות החברים של אחרים
  const friendsOf = await db.collection('users').where('friends', 'array-contains', uid).get();
  friendsOf.forEach(d => cleanup.push({
    ref: d.ref,
    data: { friends: FieldValue.arrayRemove(uid) },
  }));

  // 2. בקשות חברות בשני הכיוונים
  const [sent, received] = await Promise.all([
    db.collection('friendRequests').where('fromUid', '==', uid).get(),
    db.collection('friendRequests').where('toUid', '==', uid).get(),
  ]);
  [...sent.docs, ...received.docs].forEach(d => cleanup.push({ ref: d.ref }));

  // 3. חברות בקבוצות (+ עדכון מונה החברים).
  //    מסמכי members לא מכילים שדה uid — ה-uid הוא מזהה המסמך עצמו
  //    (ראה src/groups.js), ולכן מסתמכים על joinedGroupIds שבמסמך המשתמש.
  const joinedGroupIds = targetSnap.data()?.joinedGroupIds || [];
  if (joinedGroupIds.length) {
    const groupRefs = joinedGroupIds.map(id => db.collection('groups').doc(id));
    const groupSnaps = await db.getAll(...groupRefs);
    groupSnaps.forEach(g => {
      if (!g.exists) return; // הקבוצה כבר נמחקה — אין מה לעדכן
      cleanup.push({ ref: g.ref.collection('members').doc(uid) });
      cleanup.push({ ref: g.ref, data: { memberCount: FieldValue.increment(-1) } });
    });
  }

  // 4. רשומות אישיות שאין להן משמעות בלי המשתמש
  const [alerts, hours, sessions] = await Promise.all([
    db.collection('distressAlerts').where('uid', '==', uid).get(),
    db.collection('mentoringHours').where('mentorUid', '==', uid).get(),
    db.collection('mentorSessions').where('uid', '==', uid).get(),
  ]);
  [...alerts.docs, ...hours.docs, ...sessions.docs].forEach(d => cleanup.push({ ref: d.ref }));

  cleanup.push({ ref: db.collection('users').doc(uid) });
  await commitInChunks(cleanup);

  // 5. צ'אטים — שיחה אישית נמחקת כולה (כולל תת-אוסף ההודעות),
  //    מקבוצה רק מסירים את המשתתף
  const chats = await db.collection('chats').where('participants', 'array-contains', uid).get();
  let chatsDeleted = 0;
  for (const chat of chats.docs) {
    const isGroup = chat.data().type === 'group' || chat.data().isGroup === true;
    if (isGroup) {
      await chat.ref.update({ participants: FieldValue.arrayRemove(uid) });
    } else {
      await db.recursiveDelete(chat.ref); // מוחק גם את messages/
      chatsDeleted++;
    }
  }

  // 6. חשבון ה-Auth — בלעדיו המשתמש פשוט מתחבר שוב ונרשם מחדש
  let authDeleted = true;
  try {
    await getAuth().deleteUser(uid);
  } catch (err) {
    if (err.code === 'auth/user-not-found') authDeleted = false;
    else throw new HttpsError('internal', `מחיקת חשבון ההזדהות נכשלה: ${err.message}`);
  }

  console.log(`admin ${callerUid} deleted user ${uid}`, {
    authDeleted,
    docsCleaned: cleanup.length,
    chatsDeleted,
  });

  return { ok: true, authDeleted, docsCleaned: cleanup.length, chatsDeleted };
});

/**
 * מחיקת קבוצה: המסמך + תת-אוסף החברים + שיחת הקבוצה וכל ההודעות שבה,
 * וניקוי joinedGroupIds אצל כל חבר.
 * רץ בשרת כי מחיקת תת-אוספים אפשרית רק ב-Admin SDK (recursiveDelete).
 * data: { groupId: string }
 */
exports.usAdminDeleteGroup = onCall({ region: REGION }, async request => {
  const callerUid = requireAdmin(request);
  const groupId = request.data?.groupId;

  if (typeof groupId !== 'string' || !groupId.trim()) {
    throw new HttpsError('invalid-argument', 'חסר מזהה קבוצה');
  }

  const groupRef = db.collection('groups').doc(groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) {
    throw new HttpsError('not-found', 'הקבוצה לא נמצאה');
  }

  // מסמכי members לא מכילים שדה uid — ה-uid הוא מזהה המסמך
  const membersSnap = await groupRef.collection('members').get();
  const memberUids = membersSnap.docs.map(d => d.id);

  // ניקוי ההפניה אצל המשתמשים לפני מחיקת הקבוצה: אם נמחק קודם
  // ונכשל אחר כך, המשתמשים נשארים עם מזהה קבוצה יתום ברשימה
  if (memberUids.length) {
    await commitInChunks(memberUids.map(uid => ({
      ref: db.collection('users').doc(uid),
      merge: { joinedGroupIds: FieldValue.arrayRemove(groupId) },
    })));
  }

  // מסמך השיחה של הקבוצה נושא את אותו מזהה (ראה יצירת הקבוצה בלקוח)
  await db.recursiveDelete(db.collection('chats').doc(groupId));
  await db.recursiveDelete(groupRef);

  console.log(`admin ${callerUid} deleted group ${groupId}`, {
    membersRemoved: memberUids.length,
  });

  return { ok: true, membersRemoved: memberUids.length };
});

/**
 * שינוי תפקיד. חוקי Firestore מתירים לזרים לעדכן רק mentorStatus,
 * ולכן שינוי role חייב לעבור כאן.
 * data: { uid: string, role: 'student'|'mentor'|'staff'|'admin' }
 */
exports.usAdminSetUserRole = onCall({ region: REGION }, async request => {
  const callerUid = requireAdmin(request);
  const { uid, role } = request.data || {};

  if (typeof uid !== 'string' || !uid.trim()) {
    throw new HttpsError('invalid-argument', 'חסר מזהה משתמש');
  }
  if (!ALLOWED_ROLES.includes(role)) {
    throw new HttpsError('invalid-argument', `תפקיד לא חוקי: ${role}`);
  }

  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'המשתמש לא נמצא');
  }

  // הורדת אדמין מעצמו תנעל אותו מחוץ לפאנל
  if (uid === callerUid && role !== 'admin') {
    throw new HttpsError('failed-precondition', 'לא ניתן להוריד לעצמך הרשאות אדמין');
  }

  await userRef.update({ role });
  // ה-claim הוא מקור האמת להרשאות — חייב להישאר מסונכרן עם השדה.
  // מיזוג ולא החלפה, כדי לא למחוק את claim ה-schoolId.
  const existingClaims = (await getAuth().getUser(uid)).customClaims || {};
  await getAuth().setCustomUserClaims(uid, {
    ...existingClaims,
    admin: role === 'admin',
  });
  // בלי זה טוקן קיים ממשיך לשאת admin:true עד שעה אחרי ההורדה,
  // ומשתמש שהורד יכול להמשיך למחוק משתמשים בינתיים
  await getAuth().revokeRefreshTokens(uid);

  console.log(`admin ${callerUid} set role of ${uid} to ${role}`);
  return { ok: true, role };
});

// Firebase עצמו דורש 6 תווים. כאן הסף גבוה יותר כי את הסיסמה בוחר אדמין
// עבור מישהו אחר, והיא עוברת בערוץ לא מוצפן (טלפון, וואטסאפ) עד שתוחלף.
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

/**
 * קביעת סיסמה חדשה למשתמש, ישירות ע"י אדמין.
 * data: { uid: string, password: string }
 *
 * זו הדרך היחידה לשנות סיסמה בלי מעורבות המשתמש: את הסיסמה הקיימת אי
 * אפשר לקרוא (Firebase שומר גיבוב scrypt חד-כיווני), אבל Admin SDK כן
 * יכול לדרוס אותה. הפעולה שקולה לאיפוס — הסיסמה הישנה מפסיקה לעבוד מייד.
 *
 * למה זה עובר בשרת: ה-Auth REST API שזמין ללקוח מאפשר לשנות סיסמה רק
 * של המשתמש המחובר עצמו. updateUser קיים אך ורק ב-Admin SDK.
 */
exports.usAdminSetUserPassword = onCall({ region: REGION }, async request => {
  const callerUid = requireAdmin(request);
  const { uid, password } = request.data || {};

  if (typeof uid !== 'string' || !uid.trim()) {
    throw new HttpsError('invalid-argument', 'חסר מזהה משתמש');
  }
  // שינוי הסיסמה של עצמך דרך כאן היה מנתק אותך מהפאנל באמצע (ביטול
  // הטוקנים חל גם על הקורא). לאדמין יש את מסלול "שכחתי סיסמה" הרגיל.
  if (uid === callerUid) {
    throw new HttpsError(
      'failed-precondition',
      'לשינוי הסיסמה שלך השתמש ב"שכחתי סיסמה" במסך ההתחברות'
    );
  }
  if (typeof password !== 'string') {
    throw new HttpsError('invalid-argument', 'חסרה סיסמה');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `הסיסמה חייבת להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים`
    );
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `הסיסמה ארוכה מדי (מקסימום ${MAX_PASSWORD_LENGTH} תווים)`
    );
  }

  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'המשתמש לא נמצא');
  }

  try {
    await getAuth().updateUser(uid, { password });
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      throw new HttpsError('not-found', 'למשתמש אין חשבון הזדהות פעיל');
    }
    if (err.code === 'auth/invalid-password') {
      throw new HttpsError('invalid-argument', 'הסיסמה נדחתה ע"י Firebase');
    }
    throw err;
  }

  // updateUser לבדו לא מפיל סשנים קיימים. אם מאפסים סיסמה בגלל חשבון
  // שנפרץ, המכשיר של התוקף היה ממשיך לעבוד — ולכן מבטלים את הטוקנים.
  await getAuth().revokeRefreshTokens(uid);

  // אין טבלת audit בפרויקט, אז העקבות נשמרות על מסמך המשתמש עצמו.
  // זו אינדיקציה לתצוגה בלבד ולא ראיה: חוק העדכון העצמי ב-Firestore
  // מתיר למשתמש לכתוב מפתחות חופשיים במסמך שלו, ולכן הוא יכול לזייף
  // את שני השדות האלה. הרישום המחייב הוא הלוג של הפונקציה.
  await userRef.set(
    {
      passwordSetByAdminAt: FieldValue.serverTimestamp(),
      passwordSetByAdminUid: callerUid,
    },
    { merge: true }
  );

  console.log(`admin ${callerUid} set password for ${uid}`);
  return { ok: true, email: snap.data()?.email || null };
});

// ══════════════════════════════════════════════════════════════════════
//  School layer (US)
//
//  Data model:
//    schools/{schoolId}                 — public document (name, active, ...)
//    schools/{schoolId}/private/code    — { staffCode, studentCode }
//                                         readable by admins and by staff of
//                                         that school only
//    schoolCodes/{CODE}                 — { schoolId, audience } — reverse
//                                         lookup, fully blocked from clients
//                                         so codes cannot be enumerated
//
//  Two codes per school, not one. A single code would mean every student who
//  can register also holds the string that grants staff privileges, and staff
//  can read every student's distress alerts. The student code is handed out
//  in a classroom; the staff code is not.
//
//  Codes are only ever verified here, through the Admin SDK, so guessing one
//  requires going through this function.
// ══════════════════════════════════════════════════════════════════════

// No 0/O/1/I/L — these codes are read off a board and typed by hand
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

/** Roles a given code may be used to register as. */
const AUDIENCE_ROLES = {
  staff: ['staff'],
  // A peer mentor is a student of the same school who applied and is waiting
  // for staff approval, so both roles come from the same classroom code.
  student: ['student', 'mentor'],
};

function generateCode() {
  const bytes = require('crypto').randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

/** מגריל קוד שלא בשימוש. 31^8 אפשרויות — התנגשות מעשית לא צפויה. */
async function generateUniqueCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode();
    const existing = await db.collection('schoolCodes').doc(code).get();
    if (!existing.exists) return code;
  }
  throw new HttpsError('internal', 'הגרלת קוד ייחודי נכשלה');
}

/** מיזוג claims (setCustomUserClaims מחליף את האובייקט כולו). */
async function mergeClaims(uid, patch) {
  const existing = (await getAuth().getUser(uid)).customClaims || {};
  await getAuth().setCustomUserClaims(uid, { ...existing, ...patch });
}

/**
 * Registration for every role, with a school code.
 *
 * This is the only way to get a user document in the US product.
 * firestore.usa.rules denies client-side creation of /users/{uid} outright:
 * if a client could write its own document it could type any schoolId into
 * DevTools and land inside another school, and school membership is the only
 * thing separating one school's students from another's.
 *
 * The client calls this immediately after createUserWithEmailAndPassword and
 * deletes the Auth account if it throws — otherwise the user is left signed in
 * with no profile and no way to retry.
 *
 * data: { code, role, nickname?, gradeLevel? }
 */
exports.usRegisterWithSchoolCode = onCall({ region: REGION }, async request => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const uid = request.auth.uid;
  const code = String(request.data?.code || '').trim().toUpperCase();
  const role = String(request.data?.role || '').trim();
  const nickname = String(request.data?.nickname || '').trim();
  const gradeLevel = String(request.data?.gradeLevel || '').trim();

  if (!code) {
    throw new HttpsError('invalid-argument', 'School code is required.');
  }
  if (!role) {
    throw new HttpsError('invalid-argument', 'Role is required.');
  }

  // Already registered? Refuse. Otherwise a student who later obtains the
  // staff code could re-run this and promote their own account.
  const userRef = db.collection('users').doc(uid);
  const existing = await userRef.get();
  if (existing.exists && existing.data()?.role) {
    throw new HttpsError('already-exists', 'This account already has a role.');
  }

  const codeSnap = await db.collection('schoolCodes').doc(code).get();
  if (!codeSnap.exists) {
    throw new HttpsError('permission-denied', 'That school code is not valid.');
  }
  const { schoolId, audience } = codeSnap.data() || {};

  // The code decides which roles are on the table, never the client.
  const allowedRoles = AUDIENCE_ROLES[audience] || [];
  if (!allowedRoles.includes(role)) {
    throw new HttpsError('permission-denied', 'That code cannot be used for this role.');
  }

  if ((role === 'student' || role === 'mentor') && !GRADE_VALUES.includes(gradeLevel)) {
    throw new HttpsError('invalid-argument', 'A valid grade level is required.');
  }

  const schoolSnap = await db.collection('schools').doc(schoolId).get();
  if (!schoolSnap.exists) {
    throw new HttpsError('not-found', 'School not found.');
  }
  if (schoolSnap.data()?.active === false) {
    throw new HttpsError('failed-precondition', 'This school is not active.');
  }
  const schoolName = schoolSnap.data()?.name || '';

  const fallbackName = request.auth.token.email?.split('@')[0] || 'New user';
  const profile = {
    nickname: nickname || fallbackName,
    email: request.auth.token.email || null,
    role,
    schoolId,
    schoolName,
    createdAt: new Date().toISOString(),
  };
  // Grade level is the US grouping axis; homerooms are optional on top of it.
  if (role === 'student' || role === 'mentor') {
    profile.gradeLevel = gradeLevel;
  }
  // A peer mentor is not a mentor until a staff member says so.
  if (role === 'mentor') {
    profile.mentorStatus = 'pending';
  }

  await userRef.set(profile, { merge: true });

  // The rules check the claim first. The client must call getIdToken(true)
  // after this returns, or its token still carries no schoolId and every rule
  // falls back to a get() on the user document.
  await mergeClaims(uid, { schoolId });

  console.log(`${role} ${uid} registered to school ${schoolId}`);
  return { ok: true, schoolId, schoolName, role };
});

/**
 * Create a school and issue its two registration codes.
 * data: { name: string, city?: string, state?: string }
 */
exports.usAdminCreateSchool = onCall({ region: REGION }, async request => {
  const callerUid = requireAdmin(request);
  const name = String(request.data?.name || '').trim();
  const city = String(request.data?.city || '').trim();
  const state = String(request.data?.state || '').trim().toUpperCase();

  if (!name) {
    throw new HttpsError('invalid-argument', 'School name is required.');
  }

  const staffCode = await generateUniqueCode();
  const studentCode = await generateUniqueCode();
  const schoolRef = db.collection('schools').doc();

  const batch = db.batch();
  batch.set(schoolRef, {
    name,
    city: city || null,
    state: state || null,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: callerUid,
  });
  // Codes never sit on the public school document — that document is read
  // before sign-in, so anything on it is effectively public.
  batch.set(schoolRef.collection('private').doc('code'), {
    staffCode,
    studentCode,
    rotatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(db.collection('schoolCodes').doc(staffCode), {
    schoolId: schoolRef.id,
    audience: 'staff',
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.set(db.collection('schoolCodes').doc(studentCode), {
    schoolId: schoolRef.id,
    audience: 'student',
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  console.log(`admin ${callerUid} created school ${schoolRef.id}`);
  return { ok: true, schoolId: schoolRef.id, staffCode, studentCode };
});

/**
 * Shared rotation. The old code is deleted from schoolCodes, so it stops
 * working immediately; anyone already registered with it is unaffected,
 * because membership lives on the user document, not on the code.
 */
async function rotateCode(schoolRef, audience, actorUid) {
  const field = audience === 'staff' ? 'staffCode' : 'studentCode';
  const codeRef = schoolRef.collection('private').doc('code');
  const oldCode = (await codeRef.get()).data()?.[field];
  const code = await generateUniqueCode();

  const batch = db.batch();
  if (oldCode) batch.delete(db.collection('schoolCodes').doc(oldCode));
  batch.set(codeRef, {
    [field]: code,
    rotatedAt: FieldValue.serverTimestamp(),
    rotatedBy: actorUid,
  }, { merge: true });
  batch.set(db.collection('schoolCodes').doc(code), {
    schoolId: schoolRef.id,
    audience,
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return code;
}

function parseAudience(value) {
  const audience = String(value || 'student').trim();
  if (!AUDIENCE_ROLES[audience]) {
    throw new HttpsError('invalid-argument', 'Audience must be "staff" or "student".');
  }
  return audience;
}

/**
 * Issue a new code for a school.
 * data: { schoolId: string, audience?: 'staff' | 'student' }
 */
exports.usAdminRotateSchoolCode = onCall({ region: REGION }, async request => {
  const callerUid = requireAdmin(request);
  const schoolId = String(request.data?.schoolId || '').trim();
  const audience = parseAudience(request.data?.audience);

  if (!schoolId) {
    throw new HttpsError('invalid-argument', 'School id is required.');
  }

  const schoolRef = db.collection('schools').doc(schoolId);
  if (!(await schoolRef.get()).exists) {
    throw new HttpsError('not-found', 'School not found.');
  }

  const code = await rotateCode(schoolRef, audience, callerUid);

  console.log(`admin ${callerUid} rotated ${audience} code for school ${schoolId}`);
  return { ok: true, code, audience };
});

/**
 * עריכת בית ספר. חוקי Firestore חוסמים כתיבה ישירה ל-/schools
 * (allow write: if false) כי הצמדת הקוד למסמך חייבת להישאר עקבית.
 * data: { schoolId: string, name?: string, city?: string, active?: boolean }
 */
exports.usAdminUpdateSchool = onCall({ region: REGION }, async request => {
  const callerUid = requireAdmin(request);
  const { schoolId, name, city, active } = request.data || {};

  if (typeof schoolId !== 'string' || !schoolId.trim()) {
    throw new HttpsError('invalid-argument', 'חסר מזהה בית ספר');
  }

  const schoolRef = db.collection('schools').doc(schoolId);
  const snap = await schoolRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'בית הספר לא נמצא');
  }

  const patch = {};
  if (typeof name === 'string' && name.trim()) patch.name = name.trim();
  if (typeof city === 'string') patch.city = city.trim() || null;
  if (typeof active === 'boolean') patch.active = active;

  if (Object.keys(patch).length === 0) {
    throw new HttpsError('invalid-argument', 'אין מה לעדכן');
  }

  await schoolRef.update(patch);

  // schoolName משוכפל על מסמכי המשתמשים לצורך תצוגה — חייב להתעדכן איתו
  if (patch.name) {
    const members = await db.collection('users').where('schoolId', '==', schoolId).get();
    if (!members.empty) {
      await commitInChunks(members.docs.map(d => ({
        ref: d.ref,
        data: { schoolName: patch.name },
      })));
    }
  }

  console.log(`admin ${callerUid} updated school ${schoolId}`, patch);
  return { ok: true };
});

/**
 * Move a user to a different school, or detach them from one.
 *
 * Every US role carries a school, students included — a transfer between
 * districts, or an admin fixing someone who registered with the wrong code.
 * Passing schoolId: null detaches the account, which in practice disables it:
 * without a school the user matches no isolation rule and sees nothing.
 *
 * This must sever the social graph as well as flip the field. Friendships,
 * pending requests, group memberships and mentoring chats were all formed
 * inside the previous school, and the rules only block *forming* cross-school
 * ties — they do not retroactively hide ones that already exist. Leaving them
 * in place would put a working chat channel between two schools, which is the
 * one thing this whole model exists to prevent.
 *
 * data: { uid: string, schoolId: string|null }
 */
exports.usAdminMoveUserSchool = onCall({ region: REGION }, async request => {
  const callerUid = requireAdmin(request);
  const { uid, schoolId } = request.data || {};

  if (typeof uid !== 'string' || !uid.trim()) {
    throw new HttpsError('invalid-argument', 'User id is required.');
  }

  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'User not found.');
  }

  const before = snap.data() || {};
  const previousSchoolId = String(before.schoolId || '');
  const nextSchoolId = schoolId ? String(schoolId) : null;

  if (previousSchoolId === (nextSchoolId || '')) {
    throw new HttpsError('failed-precondition', 'User is already at that school.');
  }

  let schoolName = null;
  if (nextSchoolId) {
    const schoolSnap = await db.collection('schools').doc(nextSchoolId).get();
    if (!schoolSnap.exists) {
      throw new HttpsError('not-found', 'School not found.');
    }
    schoolName = schoolSnap.data()?.name || '';
  }

  await userRef.update({
    schoolId: nextSchoolId || FieldValue.delete(),
    schoolName: schoolName ?? FieldValue.delete(),
    // Friends, homeroom and groups all belonged to the old school.
    friends: [],
    joinedGroupIds: [],
    homeroomId: FieldValue.delete(),
    homeroomName: FieldValue.delete(),
  });

  const severed = await severSchoolTies(uid, before.joinedGroupIds || []);

  await mergeClaims(uid, { schoolId: nextSchoolId });
  // Without this the existing token keeps the old school for up to an hour.
  await getAuth().revokeRefreshTokens(uid);

  // Mentoring-hour records keep the schoolId they were earned under, on
  // purpose: they are that school's record of work, not the user's property.
  console.log(`admin ${callerUid} moved user ${uid} ${previousSchoolId || 'none'} → ${nextSchoolId || 'none'}`, severed);
  return { ok: true, schoolId: nextSchoolId, schoolName, ...severed };
});

/**
 * Cut every cross-school tie a user carries, without deleting the account.
 *
 * Deliberately narrower than usAdminDeleteUser: personal records (distress
 * alerts, mentoring hours, sessions) are left alone because they are the old
 * school's history and staff there may still need them. Only the live
 * connections — the ones that would let two schools talk — are removed.
 */
async function severSchoolTies(uid, joinedGroupIds) {
  const ops = [];

  // Remove from everyone else's friend list.
  const friendsOf = await db.collection('users').where('friends', 'array-contains', uid).get();
  friendsOf.forEach(d => ops.push({
    ref: d.ref,
    data: { friends: FieldValue.arrayRemove(uid) },
  }));

  // Pending friend requests in both directions.
  const [sent, received] = await Promise.all([
    db.collection('friendRequests').where('fromUid', '==', uid).get(),
    db.collection('friendRequests').where('toUid', '==', uid).get(),
  ]);
  [...sent.docs, ...received.docs].forEach(d => ops.push({ ref: d.ref }));

  // Group memberships. The member document id is the uid (see src/groups.js).
  if (joinedGroupIds.length) {
    const groupSnaps = await db.getAll(
      ...joinedGroupIds.map(id => db.collection('groups').doc(id))
    );
    groupSnaps.forEach(g => {
      if (!g.exists) return;
      ops.push({ ref: g.ref.collection('members').doc(uid) });
      ops.push({ ref: g.ref, data: { memberCount: FieldValue.increment(-1) } });
    });
  }

  await commitInChunks(ops);

  // Chats: drop the user out of group conversations, and close direct ones.
  // The direct chat is left in place rather than deleted — the other party's
  // school may need the record — but with one participant it is unreachable.
  const chats = await db.collection('chats').where('participants', 'array-contains', uid).get();
  let chatsClosed = 0;
  for (const chat of chats.docs) {
    await chat.ref.update({ participants: FieldValue.arrayRemove(uid) });
    chatsClosed++;
  }

  return { tiesSevered: ops.length, chatsClosed };
}

// ══════════════════════════════════════════════════════════════════════
//  פעולות מנהל בית ספר (school-web)
//
//  עד כאן כל ניהול בית הספר היה בלעדי לאדמין המערכת. שתי הפעולות
//  שלמטה מעבירות למנהל בית הספר את מה שהוא חייב כדי לתפעל את הצוות
//  שלו בעצמו — ורק אותן. הן מוגבלות לבית הספר של הקורא, שנקבע בשרת
//  ולא מהפרמטרים, ולכן אין דרך לפעול על בית ספר אחר.
// ══════════════════════════════════════════════════════════════════════

/**
 * מאמת שהקורא הוא איש צוות ומחזיר { uid, schoolId }.
 *
 * ה-schoolId נקרא ממסמך המשתמש ולא מה-claim: ה-claim מתעדכן רק
 * ב-registerStaffWithCode / adminMoveUserSchool, ועד שהמשתמש מרענן
 * טוקן הוא עלול להיות ריק. מסמך המשתמש הוא תמיד מקור האמת.
 */
async function requireStaff(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'נדרשת התחברות');
  }
  const uid = request.auth.uid;
  const snap = await db.collection('users').doc(uid).get();
  const data = snap.data() || {};
  if (data.role !== 'staff') {
    throw new HttpsError('permission-denied', 'הפעולה מותרת לצוות בית ספר בלבד');
  }
  const schoolId = String(data.schoolId || '');
  if (!schoolId) {
    throw new HttpsError('failed-precondition', 'החשבון אינו משויך לבית ספר');
  }
  return { uid, schoolId };
}

/**
 * Rotate a code for the caller's own school.
 *
 * Same as usAdminRotateSchoolCode without the schoolId argument — the target
 * is taken from the caller, so a staff member cannot rotate another school's
 * code. This is the one a school actually uses: the student code is expected
 * to leak eventually, and rotating it should not require a system admin.
 *
 * data: { audience?: 'staff' | 'student' }
 */
exports.usStaffRotateSchoolCode = onCall({ region: REGION }, async request => {
  const { uid, schoolId } = await requireStaff(request);
  const audience = parseAudience(request.data?.audience);

  const schoolRef = db.collection('schools').doc(schoolId);
  if (!(await schoolRef.get()).exists) {
    throw new HttpsError('not-found', 'School not found.');
  }

  const code = await rotateCode(schoolRef, audience, uid);

  console.log(`staff ${uid} rotated ${audience} code for school ${schoolId}`);
  return { ok: true, code, audience };
});

/**
 * Apply to become a peer mentor at your own school.
 *
 * Most students will not decide to volunteer on the day they sign up, so
 * picking "Peer mentor" at registration cannot be the only route in. This is
 * the later route: a student flips their own role to mentor and lands in the
 * pending queue their school's staff already works through.
 *
 * It has to be a callable rather than a client write. The rules make `role`
 * immutable from the client — role decides what a user can read, and a client
 * that could edit it could make itself staff and read every distress alert in
 * the school. Nothing here is taken from the request: the school, the role and
 * the resulting status all come from the caller's existing user document.
 *
 * data: {}
 */
exports.usApplyToMentor = onCall({ region: REGION }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const uid = request.auth.uid;

  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'No profile for this account.');

  const data = snap.data() || {};
  if (data.role === 'mentor') {
    throw new HttpsError('already-exists', 'You have already applied.');
  }
  if (data.role !== 'student') {
    throw new HttpsError('failed-precondition', 'Only students can apply to be peer mentors.');
  }
  if (!data.schoolId) {
    throw new HttpsError('failed-precondition', 'Your account is not attached to a school.');
  }

  // Pending, never approved. Staff approval is the only gate on who appears in
  // the volunteer list, and these are minors mentoring minors.
  await userRef.update({
    role: 'mentor',
    mentorStatus: 'pending',
    mentorAppliedAt: FieldValue.serverTimestamp(),
  });

  console.log(`student ${uid} applied to mentor at school ${data.schoolId}`);
  return { ok: true, mentorStatus: 'pending' };
});

/**
 * הסרת איש צוות מבית הספר.
 *
 * מכוון: החשבון עצמו לא נמחק, רק השיוך. מחיקת משתמש נשארת
 * adminDeleteUser כי היא גוררת ניקוי הפניות יתומות בכל המערכת, ומנהל
 * בית ספר לא אמור להחזיק בכוח הזה. בלי schoolId איש הצוות לא עובר את
 * isStaffOf באף חוק ולכן מאבד גישה לכל נתוני בית הספר — התוצאה
 * המעשית זהה, והיא הפיכה (אדמין מחזיר דרך adminMoveUserSchool).
 *
 * data: { uid: string }
 */
exports.usStaffRemoveStaffMember = onCall({ region: REGION }, async request => {
  const { uid: callerUid, schoolId } = await requireStaff(request);
  const targetUid = String(request.data?.uid || '').trim();

  if (!targetUid) {
    throw new HttpsError('invalid-argument', 'חסר מזהה משתמש');
  }
  if (targetUid === callerUid) {
    throw new HttpsError('failed-precondition', 'לא ניתן להסיר את עצמך');
  }

  const targetRef = db.collection('users').doc(targetUid);
  const target = (await targetRef.get()).data();
  if (!target) {
    throw new HttpsError('not-found', 'המשתמש לא נמצא');
  }
  if (target.role !== 'staff' || String(target.schoolId || '') !== schoolId) {
    throw new HttpsError('permission-denied', 'המשתמש אינו איש צוות בבית הספר שלך');
  }

  // בית ספר בלי אף איש צוות הוא בית ספר שאיש לא רואה את התראות המצוקה
  // שלו. שומרים על אחד לפחות, כדי ששגיאת לחיצה לא תנתק את בית הספר.
  const staffSnap = await db.collection('users')
    .where('role', '==', 'staff')
    .where('schoolId', '==', schoolId)
    .get();
  if (staffSnap.size <= 1) {
    throw new HttpsError('failed-precondition',
      'לא ניתן להסיר את איש הצוות היחיד בבית הספר');
  }

  await targetRef.update({
    schoolId: FieldValue.delete(),
    schoolName: FieldValue.delete(),
    removedFromSchoolAt: FieldValue.serverTimestamp(),
    removedFromSchoolBy: callerUid,
  });

  await mergeClaims(targetUid, { schoolId: null });
  // בלי זה הטוקן הקיים ממשיך לשאת את בית הספר עד שעה, והמוסר
  // היה ממשיך לקרוא נתונים אחרי ההסרה
  await getAuth().revokeRefreshTokens(targetUid);

  console.log(`staff ${callerUid} removed staff ${targetUid} from school ${schoolId}`);
  return { ok: true };
});
