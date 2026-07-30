// 'admin' הוא תפקיד אמיתי ב-Firestore (ומקבל custom claim), ולכן הוא חייב
// להופיע בטיפוס — אחרת כל השוואה לתפקיד אדמין נראית לטייפסקריפט בלתי אפשרית.
export type UserRole = 'student' | 'mentor' | 'staff' | 'admin';
export type MentorStatus = 'pending' | 'approved' | 'rejected';

// מה שניתן לבחור בטופס הרשמה — אדמין לא נרשם, הוא ממונה בשרת בלבד.
export type SignupRole = Exclude<UserRole, 'admin'>;

export type UserProfile = {
  uid: string;
  email: string | null;
  nickname?: string;
  role?: UserRole;
  mentorStatus?: MentorStatus;
  // שיוך לבית ספר — קיים ל-staff ול-mentor בלבד. תלמידים גלובליים בכוונה,
  // כדי שמתנדב יוכל לשוחח עם תלמיד מכל בית ספר.
  schoolId?: string;
  schoolName?: string;
  classId?: string;
  className?: string;
  // שכבת גיל של תלמיד (א–יב) — מחליפה את classId עבור תלמידים
  grade?: string;
};

export type AuthState = {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  user: import('firebase/auth').User | null;
  profile: UserProfile | null;
  error: string | null;
};
