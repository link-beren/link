/**
 * sessionTracker.js
 * Tracks the time a peer mentor is active in the app (foreground).
 * Writes sessions to Firestore and submits an automatic daily summary for the teacher's approval.
 *
 * Schema:
 *   mentorSessions/{id}: { uid, schoolId, homeroomId, date, startAt, endAt?, minutes? }
 *   mentoringHours/{id}:  { mentorUid, mentorName, schoolId, homeroomId, date, minutes, type:'auto', status:'pending', createdAt }
 *
 * schoolId must sit on every document — the security rules require
 * request.resource.data.schoolId == mySchoolId() on create,
 * and school staff query where('schoolId','==',...) on read.
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
  // Without schoolId the rules reject the write — no point in trying
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
    // If the write failed — we keep counting locally
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

  // Check whether it was already submitted
  try {
    const existSnap = await getDocs(query(
      collection(db, 'mentoringHours'),
      where('mentorUid', '==', _uid),
      where('date', '==', yesterday),
      where('type', '==', 'auto'),
    ));
    if (!existSnap.empty) return;

    // Add up all of yesterday's sessions
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
      mentorName: _mentorName || 'Peer Mentor',
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
 * Starts tracking for an approved peer mentor.
 * @param {{ uid: string, schoolId: string|null, homeroomId: string|null, mentorName: string }} opts
 */
export function startTracking({ uid, schoolId, homeroomId, mentorName }) {
  // Without schoolId there is nothing to track — every write would be rejected
  if (!schoolId) { stopTracking(); return; }
  if (_uid === uid && _schoolId === schoolId) return; // already tracking
  stopTracking();           // clear the previous state

  _uid = uid;
  _schoolId = schoolId;
  _classId = homeroomId || null;
  _mentorName = mentorName || 'Peer Mentor';

  // Submit yesterday's hours if they were not submitted
  _submitYesterday();

  // Open a session now
  _beginSession();

  // Listen for app state changes
  _appStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      // Back in the foreground — close the old session and open a new one (the date may have changed)
      _closeSession().then(() => _beginSession());
    } else if (state === 'background' || state === 'inactive') {
      _closeSession();
    }
  });
}

/**
 * Stops tracking (on logout or a role change).
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
 * Returns the start time of the active session (a Date.now() value) or null.
 * Used by MentorHomeScreen to compute a live counter.
 */
export function getActiveSessionStart() {
  return _sessionStart;
}

/**
 * Returns the uid that is currently being tracked.
 */
export function getTrackedUid() {
  return _uid;
}
