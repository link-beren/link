/**
 * sessionTracker.js
 * עוקב אחר זמן שהמנטור פעיל באפליקציה (foreground).
 * כותב סשנים ל-Firestore ומגיש סיכום יומי אוטומטי לאישור המורה.
 *
 * Schema:
 *   mentorSessions/{id}: { uid, schoolId, homeroomId, date, startAt, endAt?, minutes? }
 *   mentoringHours/{id}:  { mentorUid, mentorName, schoolId, homeroomId, date, minutes, type:'auto', status:'pending', createdAt }
 *
 * schoolId חייב לשבת על כל מסמך — חוקי האבטחה דורשים
 * request.resource.data.schoolId == mySchoolId() ביצירה,
 * והצוות שואל where('schoolId','==',...) בקריאה.
 */

import { AppState } from 'react-native';
import {
  addDoc, updateDoc, getDocs,
  collection, doc, query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

// ─── private state ────────────────────────────────────────────────────────────
let _uid = null;
let _schoolId = null;
let _classId = null;
let _mentorName = null;
let _sessionDocId = null;
let _sessionStart = null;   // Date.now() when current foreground session began
let _appStateSub = null;

// ─── helpers ──────────────────────────────────────────────────────────────────
function _dateStr(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function _beginSession() {
  // בלי schoolId החוקים דוחים את הכתיבה — אין טעם לנסות
  if (!_uid || !_schoolId) return;
  _sessionStart = Date.now();
  try {
    const ref = await addDoc(collection(db, 'mentorSessions'), {
      uid: _uid,
      schoolId: _schoolId,
      homeroomId: _classId || null,
      date: _dateStr(),
      startAt: serverTimestamp(),
    });
    _sessionDocId = ref.id;
  } catch {
    // אם הכתיבה נכשלה — נמשיך לספור מקומית
  }
}

async function _closeSession() {
  if (!_sessionStart) return;
  const mins = Math.floor((Date.now() - _sessionStart) / 60000);
  const docId = _sessionDocId;
  _sessionStart = null;
  _sessionDocId = null;
  if (mins < 1 || !docId) return;
  try {
    await updateDoc(doc(db, 'mentorSessions', docId), {
      endAt: serverTimestamp(),
      minutes: mins,
    });
  } catch {}
}

async function _submitYesterday() {
  if (!_uid || !_schoolId) return;
  const yesterday = _dateStr(-1);

  // בדוק אם כבר הוגש
  try {
    const existSnap = await getDocs(query(
      collection(db, 'mentoringHours'),
      where('mentorUid', '==', _uid),
      where('date', '==', yesterday),
      where('type', '==', 'auto'),
    ));
    if (!existSnap.empty) return;

    // חבר את כל הסשנים של אתמול
    const sessSnap = await getDocs(query(
      collection(db, 'mentorSessions'),
      where('uid', '==', _uid),
      where('date', '==', yesterday),
    ));
    let totalMins = 0;
    sessSnap.forEach(d => { totalMins += d.data().minutes || 0; });
    if (totalMins < 1) return;

    await addDoc(collection(db, 'mentoringHours'), {
      mentorUid: _uid,
      mentorName: _mentorName || 'מתנדב/ת',
      schoolId: _schoolId,
      homeroomId: _classId || null,
      date: yesterday,
      minutes: totalMins,
      type: 'auto',
      status: 'pending',
      createdAt: serverTimestamp(),
    });
  } catch {}
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * מפעיל מעקב עבור מנטור מאושר.
 * @param {{ uid: string, schoolId: string|null, homeroomId: string|null, mentorName: string }} opts
 */
export function startTracking({ uid, schoolId, homeroomId, mentorName }) {
  // בלי schoolId אין למה לעקוב — כל כתיבה תידחה
  if (!schoolId) { stopTracking(); return; }
  if (_uid === uid && _schoolId === schoolId) return; // כבר עוקבים
  stopTracking();           // נקה מצב קודם

  _uid = uid;
  _schoolId = schoolId;
  _classId = homeroomId || null;
  _mentorName = mentorName || 'מתנדב/ת';

  // הגש שעות אתמול אם לא הוגשו
  _submitYesterday();

  // פתח סשן עכשיו
  _beginSession();

  // האזן לשינויי מצב האפליקציה
  _appStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      // חזרה לחזית — סגור סשן ישן ופתח חדש (תאריך אולי השתנה)
      _closeSession().then(() => _beginSession());
    } else if (state === 'background' || state === 'inactive') {
      _closeSession();
    }
  });
}

/**
 * עוצר מעקב (בלוגאאוט או שינוי תפקיד).
 */
export function stopTracking() {
  _closeSession();
  _appStateSub?.remove();
  _appStateSub = null;
  _uid = null;
  _schoolId = null;
  _classId = null;
  _mentorName = null;
  _sessionStart = null;
  _sessionDocId = null;
}

/**
 * מחזיר את זמן תחילת הסשן הפעיל (Date.now() ערך) או null.
 * משמש ל-MentorHomeScreen לחישוב מונה חי.
 */
export function getActiveSessionStart() {
  return _sessionStart;
}

/**
 * מחזיר את ה-uid שעוקבים אחריו כרגע.
 */
export function getTrackedUid() {
  return _uid;
}
