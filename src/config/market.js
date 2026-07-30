// ─────────────────────────────────────────────────────────────────────────────
// US market policy.
//
// The Israeli product treats a school as a unit of work: a volunteer in one
// city may mentor a student in another, and students carry no school at all.
// The US product inverts that. A school is a closed world — students, peer
// mentors and staff all belong to one school and nothing crosses the boundary.
//
// That boundary is expected to loosen later, so it is expressed here as policy
// rather than hardcoded at every query site. Flipping SCHOOL_ISOLATION to
// 'open' relaxes the client-side filters; the matching Firestore rules in
// firestore.usa.rules must be relaxed with it, or queries will simply fail.
// ─────────────────────────────────────────────────────────────────────────────

export const MARKET = 'US';

export const SCHOOL_ISOLATION = 'strict';

export const isolationEnabled = () => SCHOOL_ISOLATION === 'strict';

// Grade levels, not classes.
//
// The Israeli model assumes a fixed cohort ("ט'1") that a student belongs to
// all day. That only maps onto US elementary school, where one teacher holds
// one classroom. From grade 6 up, students move between subject teachers and
// no such cohort exists — so grade level is the only universally meaningful
// grouping, and homerooms are an optional per-school layer on top of it.
export const GRADE_LEVELS = [
  { value: 'K', label: 'Kindergarten', band: 'elementary' },
  { value: '1', label: '1st Grade', band: 'elementary' },
  { value: '2', label: '2nd Grade', band: 'elementary' },
  { value: '3', label: '3rd Grade', band: 'elementary' },
  { value: '4', label: '4th Grade', band: 'elementary' },
  { value: '5', label: '5th Grade', band: 'elementary' },
  { value: '6', label: '6th Grade', band: 'middle' },
  { value: '7', label: '7th Grade', band: 'middle' },
  { value: '8', label: '8th Grade', band: 'middle' },
  { value: '9', label: '9th Grade', band: 'high' },
  { value: '10', label: '10th Grade', band: 'high' },
  { value: '11', label: '11th Grade', band: 'high' },
  { value: '12', label: '12th Grade', band: 'high' },
];

export const GRADE_VALUES = GRADE_LEVELS.map(g => g.value);

export const gradeLabel = value =>
  GRADE_LEVELS.find(g => g.value === value)?.label ?? value ?? '';

// Any student may apply to become a peer mentor; staff approve individually.
// No grade gate is enforced — that was an explicit product decision, and if a
// school wants one it belongs in the staff approval step, not here.
export const MENTOR_ELIGIBILITY = 'any-student-with-staff-approval';

// Distress alerts go to every staff member at the student's own school.
// Because a US student carries schoolId directly, the Israeli routing layer
// (walking mentoring chats to derive notifySchoolIds) is unnecessary here.
export const DISTRESS_ROUTING = 'own-school-staff';
