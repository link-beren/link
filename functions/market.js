// US market policy — CommonJS mirror of src/config/market.js.
//
// This is a copy rather than an import on purpose: `firebase deploy` uploads
// only the functions/ directory, so nothing outside it exists at runtime.
// Keep the grade list in sync with src/config/market.js and
// apps/web/src/config/market.ts; the values are written into user documents
// and compared against on the client, so a drift is a silent data bug.

const MARKET = 'US';

const SCHOOL_ISOLATION = 'strict';

const GRADE_LEVELS = [
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

const GRADE_VALUES = GRADE_LEVELS.map(g => g.value);

const gradeLabel = value =>
  GRADE_LEVELS.find(g => g.value === value)?.label ?? value ?? '';

module.exports = {
  MARKET,
  SCHOOL_ISOLATION,
  GRADE_LEVELS,
  GRADE_VALUES,
  gradeLabel,
};
