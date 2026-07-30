import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { db, functions, storage } from '../lib/firebase';
import { requestWebPushToken } from '../lib/messaging';
import { useAuth } from '../auth/useAuth';
import { gradeLabel } from '../config/market';
import { Avatar, Button, Card } from '../components/ui';

type ProfileData = {
  nickname?: string;
  email?: string;
  role?: string;
  gradeLevel?: string;
  homeroomName?: string;
  avatarUrl?: string;
};

export function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pushStatus, setPushStatus] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyStatus, setApplyStatus] = useState('');

  useEffect(() => {
    if (!user) return;

    return onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      const data = snapshot.data() || {};
      const nextProfile = {
        nickname: typeof data.nickname === 'string' ? data.nickname : '',
        email: typeof data.email === 'string' ? data.email : user.email || '',
        role: typeof data.role === 'string' ? data.role : '',
        gradeLevel: typeof data.gradeLevel === 'string' ? data.gradeLevel : '',
        homeroomName: typeof data.homeroomName === 'string' ? data.homeroomName : '',
        avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : '',
      };
      setProfile(nextProfile);
      setNickname(nextProfile.nickname || '');
    });
  }, [user]);

  async function saveNickname(event: FormEvent) {
    event.preventDefault();
    if (!user || !nickname.trim()) return;
    setSaving(true);

    try {
      await updateDoc(doc(db, 'users', user.uid), { nickname: nickname.trim() });
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!user || !file) return;
    setUploading(true);

    try {
      const avatarRef = ref(storage, `avatars/${user.uid}`);
      await uploadBytes(avatarRef, file);
      const avatarUrl = await getDownloadURL(avatarRef);
      await updateDoc(doc(db, 'users', user.uid), { avatarUrl });
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function enablePush() {
    if (!user) return;
    setPushStatus('Requesting permission…');

    try {
      await requestWebPushToken(user.uid);
      setPushStatus('Notifications are on in this browser.');
    } catch (error) {
      setPushStatus(
        error instanceof Error ? error.message : 'Notifications could not be enabled right now.',
      );
    }
  }

  // Role is immutable from the client — a client that could edit it could make
  // itself staff and read every distress alert in the school — so the switch to
  // mentor happens server-side and lands in the school's pending queue.
  async function applyToMentor() {
    if (!user) return;
    setApplying(true);
    setApplyStatus('');

    try {
      await httpsCallable(functions, 'usApplyToMentor')({});
      setApplyStatus('Application sent. Your school will review it.');
    } catch (error) {
      setApplyStatus(
        error instanceof Error ? error.message : 'Your application could not be sent.',
      );
    } finally {
      setApplying(false);
    }
  }

  return (
    <main className="profile-page">
      <Card className="profile-card">
        <Avatar name={profile?.nickname || profile?.email} src={profile?.avatarUrl} />
        <h1>My profile</h1>
        <p>{profile?.email || user?.email}</p>
        {!!profile?.gradeLevel && <p>{gradeLabel(profile.gradeLevel)}</p>}
        {!!profile?.homeroomName && <p>{profile.homeroomName}</p>}

        <form className="auth-form" onSubmit={(event) => void saveNickname(event)}>
          <label>
            Display name
            <input
              value={nickname}
              maxLength={20}
              onChange={(event) => setNickname(event.target.value)}
            />
          </label>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save name'}
          </Button>
        </form>

        <label className="file-upload">
          {uploading ? 'Uploading…' : 'Upload a profile picture'}
          <input type="file" accept="image/*" onChange={(event) => void uploadAvatar(event)} />
        </label>

        {profile?.role === 'student' && (
          <div className="profile-actions">
            <h2>Become a peer mentor</h2>
            <p>
              Peer mentors are students at this school who make time to listen to
              other students. Your school reviews every application before it goes live.
            </p>
            <Button type="button" disabled={applying} onClick={() => void applyToMentor()}>
              {applying ? 'Sending…' : 'Apply to be a peer mentor'}
            </Button>
            {!!applyStatus && <p>{applyStatus}</p>}
          </div>
        )}

        <div className="profile-actions">
          <Button type="button" tone="muted" onClick={() => void enablePush()}>
            Turn on notifications
          </Button>
          {!!pushStatus && <p>{pushStatus}</p>}
        </div>
      </Card>
    </main>
  );
}
