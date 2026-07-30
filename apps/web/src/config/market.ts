// US market policy — web mirror of src/config/market.js.
// Keep the two in sync; they encode the same product decisions.
// See src/config/market.js for the reasoning behind each value.

export const MARKET = 'US' as const;

export const SCHOOL_ISOLATION: 'strict' | 'open' = 'strict';

export const isolationEnabled = () => SCHOOL_ISOLATION === 'strict';

export type GradeBand = 'elementary' | 'middle' | 'high';

export interface GradeLevel {
  value: string;
  label: string;
  band: GradeBand;
}

// Grade levels, not classes. US students above grade 5 have no fixed cohort,
// so grade level is the only universally meaningful grouping; homerooms are an
// optional per-school layer on top of it.
export const GRADE_LEVELS: GradeLevel[] = [
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

export const gradeLabel = (value?: string | null): string =>
  GRADE_LEVELS.find(g => g.value === value)?.label ?? value ?? '';

export const MENTOR_ELIGIBILITY = 'any-student-with-staff-approval' as const;

export const DISTRESS_ROUTING = 'own-school-staff' as const;
