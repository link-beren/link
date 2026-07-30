// 'admin' is a real role in Firestore (and gets a custom claim), so it has to
// appear in the type — otherwise TypeScript sees any comparison against the
// admin role as impossible.
export type UserRole = 'student' | 'mentor' | 'staff' | 'admin';
export type MentorStatus = 'pending' | 'approved' | 'rejected';

// What can be picked on the signup form — an admin never signs up, the role is
// assigned on the server only.
export type SignupRole = Exclude<UserRole, 'admin'>;

export type UserProfile = {
  uid: string;
  email: string | null;
  nickname?: string;
  role?: UserRole;
  mentorStatus?: MentorStatus;
  // School affiliation — exists for staff and mentors only. Students are global
  // on purpose, so a peer mentor can chat with a student from any school.
  schoolId?: string;
  schoolName?: string;
  homeroomId?: string;
  homeroomName?: string;
  // A student's grade level (K–12) — replaces homeroomId for students
  grade?: string;
};

export type AuthState = {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  user: import('firebase/auth').User | null;
  profile: UserProfile | null;
  error: string | null;
};
