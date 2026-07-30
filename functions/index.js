const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { Expo } = require('expo-server-sdk');

initializeApp();
const db = getFirestore();
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
exports.sendChatNotification = onDocumentCreated(
  { document: 'chats/{chatId}/messages/{messageId}', region: 'me-west1' },
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
 * מוצא את בתי הספר שאמורים לטפל בהתראת מצוקה של תלמיד.
 *
 * לתלמיד אין שיוך לבית ספר (הוא יכול להיות מלווה ע"י מתנדב מכל בית ספר),
 * ולכן הניתוב נגזר מהמלווים שלו: כל שיחת ליווי שהוא משתתף בה → המתנדב
 * שבצד השני → בית הספר של המתנדב.
 *
 * @returns {Promise<string[]>} מזהי בתי ספר, ללא כפילויות
 */
async function resolveNotifySchoolIds(studentUid) {
  if (!studentUid) return [];

  const chats = await db.collection('chats')
    .where('participants', 'array-contains', studentUid)
    .where('type', '==', 'mentoring')
    .get();

  const mentorUids = new Set();
  chats.forEach(c => {
    const data = c.data();
    // mentorUid נכתב ע"י מסלולי יצירת הליווי; participants הוא נפילה
    // למסמכים היסטוריים שנוצרו לפני שהשדה נוסף.
    if (data.mentorUid && data.mentorUid !== studentUid) {
      mentorUids.add(data.mentorUid);
      return;
    }
    (data.participants || []).forEach(uid => {
      if (uid && uid !== studentUid) mentorUids.add(uid);
    });
  });

  if (mentorUids.size === 0) return [];

  const mentorSnaps = await db.getAll(
    ...[...mentorUids].map(uid => db.collection('users').doc(uid))
  );

  const schoolIds = new Set();
  mentorSnaps.forEach(s => {
    const schoolId = s.data()?.schoolId;
    if (schoolId) schoolIds.add(schoolId);
  });

  return [...schoolIds];
}

// התראה על קריאת מצוקה חדשה — רק לצוות של בתי הספר של המלווים.
// הפונקציה גם כותבת notifySchoolIds חזרה על המסמך: החוקים והפורטל
// מסננים לפיו (array-contains), כי Firestore לא יכול לעשות join.
exports.sendDistressAlertNotification = onDocumentCreated(
  { document: 'distressAlerts/{alertId}', region: 'me-west1' },
  async event => {
    const alert = event.data.data();
    const { alertId } = event.params;
    const studentUid = alert.uid || alert.studentUid || alert.userId || '';

    const notifySchoolIds = await resolveNotifySchoolIds(studentUid);

    // אין מלווים → אין בית ספר לנתב אליו. מסמנים unrouted כדי שהאדמין
    // יראה את זה בפאנל; בלי זה ההתראה נעלמת בשקט.
    const unrouted = notifySchoolIds.length === 0;
    await event.data.ref.set({ notifySchoolIds, unrouted }, { merge: true });

    const staffQuery = unrouted
      ? db.collection('users').where('role', '==', 'admin')
      : db.collection('users').where('role', '==', 'staff')
          .where('schoolId', 'in', notifySchoolIds.slice(0, 30));

    const staffSnap = await staffQuery.get();
    const tokens = staffSnap.docs.map(d => d.data()?.expoPushToken).filter(Boolean);

    console.log(`distress alert ${alertId} routed`, {
      studentUid,
      notifySchoolIds,
      unrouted,
      recipients: tokens.length,
    });

    if (tokens.length === 0) return;

    await sendExpoPushNotifications(tokens.map(to => ({
      to,
      sound: 'default',
      title: unrouted ? '🆘 מצוקה ללא שיוך בית ספר' : '🆘 התראת מצוקה חדשה',
      body: `${alert.nickname || 'תלמיד/ה'}: ${alert.reasonText || ''}`,
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

const REGION = 'me-west1';
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
exports.syncAdminClaimOnCreate = onDocumentCreated(
  { document: 'users/{uid}', region: REGION },
  async event =>
    applyAdminClaim(event.params.uid, null, event.data?.data()?.role ?? null)
);

exports.syncAdminClaimOnUpdate = onDocumentUpdated(
  { document: 'users/{uid}', region: REGION },
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
exports.adminDeleteUser = onCall({ region: REGION }, async request => {
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
exports.adminDeleteGroup = onCall({ region: REGION }, async request => {
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
exports.adminSetUserRole = onCall({ region: REGION }, async request => {
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
exports.adminSetUserPassword = onCall({ region: REGION }, async request => {
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
//  שכבת בתי הספר
//
//  מודל הנתונים:
//    schools/{schoolId}                 — מסמך ציבורי (name, active, ...)
//                                         נקרא בטופס ההרשמה לפני אימות,
//                                         ולכן לא מכיל את הקוד
//    schools/{schoolId}/private/code    — { code } — קריא לאדמין בלבד
//    schoolCodes/{CODE}                 — { schoolId } — מיפוי הפוך,
//                                         חסום לחלוטין מהלקוח כדי שאי
//                                         אפשר יהיה למנות קודים
//
//  הקוד מאומת רק כאן (Admin SDK), ולכן אין דרך לנחש אותו בלי rate limit
//  אמיתי מול הפונקציה.
// ══════════════════════════════════════════════════════════════════════

// בלי 0/O/1/I/L — קוד מוקלד ידנית ע"י אנשי צוות
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

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
 * הרשמת חבר צוות עם קוד בית ספר.
 *
 * זו הדרך היחידה לקבל role: 'staff' — חוקי Firestore מתירים ללקוח
 * ליצור רק 'student' או 'mentor'. הפונקציה נקראת מיד אחרי
 * createUserWithEmailAndPassword, והלקוח מוחק את חשבון ה-Auth אם היא
 * נכשלת (אחרת נשאר חשבון מחובר בלי מסמך משתמש).
 *
 * data: { code: string, nickname?: string }
 */
exports.registerStaffWithCode = onCall({ region: REGION }, async request => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'נדרשת התחברות');
  }
  const uid = request.auth.uid;
  const code = String(request.data?.code || '').trim().toUpperCase();
  const nickname = String(request.data?.nickname || '').trim();

  if (!code) {
    throw new HttpsError('invalid-argument', 'חסר קוד בית ספר');
  }

  // המשתמש כבר קיים? חוסמים — אחרת אפשר "לשדרג" תלמיד קיים לצוות.
  const userRef = db.collection('users').doc(uid);
  const existing = await userRef.get();
  if (existing.exists && existing.data()?.role) {
    throw new HttpsError('already-exists', 'למשתמש הזה כבר יש תפקיד במערכת');
  }

  const codeSnap = await db.collection('schoolCodes').doc(code).get();
  if (!codeSnap.exists) {
    throw new HttpsError('permission-denied', 'קוד בית הספר שגוי');
  }
  const schoolId = codeSnap.data()?.schoolId;

  const schoolSnap = await db.collection('schools').doc(schoolId).get();
  if (!schoolSnap.exists) {
    throw new HttpsError('not-found', 'בית הספר לא נמצא');
  }
  if (schoolSnap.data()?.active === false) {
    throw new HttpsError('failed-precondition', 'בית הספר אינו פעיל');
  }
  const schoolName = schoolSnap.data()?.name || '';

  await userRef.set({
    nickname: nickname || request.auth.token.email?.split('@')[0] || 'חבר/ת צוות',
    email: request.auth.token.email || null,
    role: 'staff',
    schoolId,
    schoolName,
    createdAt: new Date().toISOString(),
  }, { merge: true });

  // ה-claim הוא מה שהחוקים בודקים קודם. הלקוח חייב לקרוא
  // getIdToken(true) אחרי הקריאה הזאת, אחרת הטוקן שבידיו עדיין בלי
  // schoolId והחוקים ייפלו ל-get() על מסמך המשתמש.
  await mergeClaims(uid, { schoolId });

  console.log(`staff ${uid} registered to school ${schoolId}`);
  return { ok: true, schoolId, schoolName };
});

/**
 * יצירת בית ספר + הגרלת קוד צוות.
 * data: { name: string, city?: string }
 */
exports.adminCreateSchool = onCall({ region: REGION }, async request => {
  const callerUid = requireAdmin(request);
  const name = String(request.data?.name || '').trim();
  const city = String(request.data?.city || '').trim();

  if (!name) {
    throw new HttpsError('invalid-argument', 'חסר שם בית ספר');
  }

  const code = await generateUniqueCode();
  const schoolRef = db.collection('schools').doc();

  const batch = db.batch();
  batch.set(schoolRef, {
    name,
    city: city || null,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: callerUid,
  });
  // הקוד לא יושב על המסמך הציבורי — הוא נקרא בטופס ההרשמה ללא אימות
  batch.set(schoolRef.collection('private').doc('code'), {
    code,
    rotatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(db.collection('schoolCodes').doc(code), {
    schoolId: schoolRef.id,
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  console.log(`admin ${callerUid} created school ${schoolRef.id}`);
  return { ok: true, schoolId: schoolRef.id, code };
});

/**
 * הגרלת קוד חדש לבית ספר. הקוד הישן נמחק ומפסיק לעבוד מיד.
 * data: { schoolId: string }
 */
exports.adminRotateSchoolCode = onCall({ region: REGION }, async request => {
  const callerUid = requireAdmin(request);
  const schoolId = String(request.data?.schoolId || '').trim();

  if (!schoolId) {
    throw new HttpsError('invalid-argument', 'חסר מזהה בית ספר');
  }

  const schoolRef = db.collection('schools').doc(schoolId);
  if (!(await schoolRef.get()).exists) {
    throw new HttpsError('not-found', 'בית הספר לא נמצא');
  }

  const codeRef = schoolRef.collection('private').doc('code');
  const oldCode = (await codeRef.get()).data()?.code;
  const code = await generateUniqueCode();

  const batch = db.batch();
  if (oldCode) batch.delete(db.collection('schoolCodes').doc(oldCode));
  batch.set(codeRef, { code, rotatedAt: FieldValue.serverTimestamp() });
  batch.set(db.collection('schoolCodes').doc(code), {
    schoolId,
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  console.log(`admin ${callerUid} rotated code for school ${schoolId}`);
  return { ok: true, code };
});

/**
 * עריכת בית ספר. חוקי Firestore חוסמים כתיבה ישירה ל-/schools
 * (allow write: if false) כי הצמדת הקוד למסמך חייבת להישאר עקבית.
 * data: { schoolId: string, name?: string, city?: string, active?: boolean }
 */
exports.adminUpdateSchool = onCall({ region: REGION }, async request => {
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
 * העברת משתמש לבית ספר אחר (או ניתוק ממנו).
 * חוקי Firestore אוסרים על המשתמש לשנות את schoolId של עצמו, וגם
 * צריך לעדכן את ה-claim — ולכן זה עובר כאן.
 * data: { uid: string, schoolId: string|null }
 */
exports.adminMoveUserSchool = onCall({ region: REGION }, async request => {
  const callerUid = requireAdmin(request);
  const { uid, schoolId } = request.data || {};

  if (typeof uid !== 'string' || !uid.trim()) {
    throw new HttpsError('invalid-argument', 'חסר מזהה משתמש');
  }

  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'המשתמש לא נמצא');
  }

  const role = snap.data()?.role;
  // תלמיד לא מתויג לבית ספר — מתנדב מכל בית ספר יכול ללוות אותו,
  // וניתוב המצוקות נגזר מהמלווים ולא מהתלמיד עצמו.
  if (role === 'student' && schoolId) {
    throw new HttpsError('failed-precondition', 'תלמידים אינם משויכים לבית ספר');
  }

  let schoolName = null;
  if (schoolId) {
    const schoolSnap = await db.collection('schools').doc(schoolId).get();
    if (!schoolSnap.exists) {
      throw new HttpsError('not-found', 'בית הספר לא נמצא');
    }
    schoolName = schoolSnap.data()?.name || '';
  }

  await userRef.update({
    schoolId: schoolId || FieldValue.delete(),
    schoolName: schoolName ?? FieldValue.delete(),
    // הכיתה שייכת לבית הספר הקודם ולכן מתאפסת
    ...(role === 'mentor' ? { classId: FieldValue.delete(), className: FieldValue.delete() } : {}),
  });

  await mergeClaims(uid, { schoolId: schoolId || null });
  // בלי זה הטוקן הקיים ממשיך לשאת את בית הספר הקודם עד שעה
  await getAuth().revokeRefreshTokens(uid);

  // שעות ליווי מעתיקות schoolId (denormalization לצורך שאילתות הצוות) —
  // הרשומות ההיסטוריות נשארות תחת בית הספר שבו הן נצברו בכוונה.
  console.log(`admin ${callerUid} moved user ${uid} to school ${schoolId || 'none'}`);
  return { ok: true, schoolId: schoolId || null, schoolName };
});

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
 * רענון קוד ההרשמה של בית הספר של הקורא.
 *
 * מקבילה ל-adminRotateSchoolCode, בלי פרמטר schoolId — היעד נגזר
 * מהקורא. הקוד הישן נמחק מ-schoolCodes ולכן מפסיק לעבוד מיידית;
 * מי שכבר נרשם איתו לא מושפע, כי השיוך שמור על מסמך המשתמש.
 */
exports.staffRotateSchoolCode = onCall({ region: REGION }, async request => {
  const { uid, schoolId } = await requireStaff(request);

  const schoolRef = db.collection('schools').doc(schoolId);
  if (!(await schoolRef.get()).exists) {
    throw new HttpsError('not-found', 'בית הספר לא נמצא');
  }

  const codeRef = schoolRef.collection('private').doc('code');
  const oldCode = (await codeRef.get()).data()?.code;
  const code = await generateUniqueCode();

  const batch = db.batch();
  if (oldCode) batch.delete(db.collection('schoolCodes').doc(oldCode));
  batch.set(codeRef, {
    code,
    rotatedAt: FieldValue.serverTimestamp(),
    rotatedBy: uid,
  });
  batch.set(db.collection('schoolCodes').doc(code), {
    schoolId,
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  console.log(`staff ${uid} rotated code for school ${schoolId}`);
  return { ok: true, code };
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
exports.staffRemoveStaffMember = onCall({ region: REGION }, async request => {
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
