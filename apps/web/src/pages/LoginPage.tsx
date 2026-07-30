import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import type { SignupRole } from '../auth/types';
import { auth, functions } from '../lib/firebase';
import { GRADE_LEVELS } from '../config/market';
import { Button, Card } from '../components/ui';

type LocationState = {
  from?: {
    pathname?: string;
  };
};

const savedEmailKey = 'link_web_saved_email';

function getRoleLabel(role: SignupRole) {
  if (role === 'student') return 'Student';
  if (role === 'mentor') return 'Peer mentor';
  return 'School staff';
}

function getCodeLabel(role: SignupRole) {
  return role === 'staff' ? 'Staff code' : 'School code';
}

export function LoginPage() {
  const { status, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LocationState | null;
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [role, setRole] = useState<SignupRole>('student');
  const [email, setEmail] = useState(() => localStorage.getItem(savedEmailKey) || '');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  // One field for every role. There is no school picker any more: the school
  // list is not publicly readable in the US product, and a picker would let
  // anyone enumerate every district on the platform. The code names the school.
  const [schoolCode, setSchoolCode] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem(savedEmailKey));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'authenticated') {
    if (locationState?.from?.pathname) {
      return <Navigate to={locationState.from.pathname} replace />;
    }

    if (profile?.role === 'staff') return <Navigate to="/school" replace />;
    if (profile?.role === 'mentor') {
      return (
        <Navigate
          to={profile.mentorStatus === 'approved' ? '/mentor' : '/mentor/pending'}
          replace
        />
      );
    }
    return <Navigate to="/social" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    if (mode === 'register') {
      if ((role === 'student' || role === 'mentor') && !nickname.trim()) {
        setError('Please choose a display name.');
        return;
      }
      if ((role === 'student' || role === 'mentor') && !gradeLevel) {
        setError('Please select your grade level.');
        return;
      }
      if (!schoolCode.trim()) {
        setError(`Please enter your ${getCodeLabel(role).toLowerCase()}.`);
        return;
      }
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        );

        // Every role is created server-side. The rules deny client writes to
        // /users entirely: a client that could write its own document could
        // type any schoolId into DevTools and land inside another school.
        try {
          await httpsCallable(functions, 'usRegisterWithSchoolCode')({
            code: schoolCode.trim(),
            role,
            nickname: nickname.trim() || email.split('@')[0],
            gradeLevel,
          });
          // The function sets the schoolId claim. Without an explicit refresh
          // our token still lacks it and every school-scoped query fails.
          await userCredential.user.getIdToken(true);
        } catch (codeError) {
          // Registration failed, so delete the Auth account we just created.
          // Left behind it would block signing up again with the same email
          // while granting access to nothing.
          try {
            await userCredential.user.delete();
          } catch {
            /* ignore */
          }
          setError(
            codeError instanceof Error && codeError.message
              ? codeError.message
              : 'That code is not valid.',
          );
          setLoading(false);
          return;
        }
      }

      if (rememberMe) {
        localStorage.setItem(savedEmailKey, email.trim());
      } else {
        localStorage.removeItem(savedEmailKey);
      }

      navigate('/', { replace: true });
    } catch (caughtError) {
      const code =
        typeof caughtError === 'object' &&
        caughtError &&
        'code' in caughtError &&
        typeof caughtError.code === 'string'
          ? caughtError.code
          : '';

      if (code === 'auth/email-already-in-use') setError('That email is already in use.');
      else if (code === 'auth/invalid-email') setError('That email address is not valid.');
      else if (code === 'auth/weak-password') setError('That password is too weak.');
      else if (code === 'auth/invalid-credential') setError('Incorrect email or password.');
      else setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setError('Please enter your email address first.');
      return;
    }

    await sendPasswordResetEmail(auth, email.trim());
    setError('If an account exists for that email, a reset link is on its way.');
  }

  return (
    <main className="login-page">
      <Card className="login-card">
        <div className="login-head">
          <div className="brand login-brand">Link</div>
          <h1>{mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
        </div>

        <div className="role-selector" aria-label="Select your role">
          {(['student', 'mentor', 'staff'] as SignupRole[]).map((roleOption) => (
            <button
              key={roleOption}
              type="button"
              className={role === roleOption ? 'role-option role-option-active' : 'role-option'}
              onClick={() => setRole(roleOption)}
            >
              {getRoleLabel(roleOption)}
            </button>
          ))}
        </div>

        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {mode === 'register' && (role === 'student' || role === 'mentor') && (
            <>
              <label>
                Display name
                <input
                  type="text"
                  value={nickname}
                  maxLength={20}
                  onChange={(event) => setNickname(event.target.value)}
                />
              </label>
              <label>
                Grade level
                <select
                  value={gradeLevel}
                  onChange={(event) => setGradeLevel(event.target.value)}
                >
                  <option value="">Select your grade</option>
                  {GRADE_LEVELS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {mode === 'register' && (
            <label>
              {getCodeLabel(role)}
              <input
                type={role === 'staff' ? 'password' : 'text'}
                value={schoolCode}
                autoCapitalize="characters"
                onChange={(event) => setSchoolCode(event.target.value.toUpperCase())}
              />
              <span className="field-hint">
                {role === 'staff'
                  ? 'Ask your school administrator for the staff code.'
                  : 'Your school gives this out — ask a teacher if you do not have it.'}
              </span>
            </label>
          )}

          {mode === 'register' && role === 'mentor' && (
            <div className="form-message">
              Peer mentor accounts are reviewed by your school before they go live.
            </div>
          )}

          <label className="remember-row">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            Remember my email on this device
          </label>

          {error && <div className="form-message">{error}</div>}

          <Button type="submit" disabled={loading}>
            {loading ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <div className="auth-footer">
          {mode === 'login' && (
            <button type="button" onClick={() => void handleForgotPassword()}>
              Forgot password
            </button>
          )}
          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
          </button>
        </div>

      </Card>
    </main>
  );
}
