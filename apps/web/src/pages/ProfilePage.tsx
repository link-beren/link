import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { db, storage } from '../lib/firebase';
import { requestWebPushToken } from '../lib/messaging';
import { useAuth } from '../auth/useAuth';
import { Avatar, Button, Card } from '../components/ui';

type ProfileData = {
  nickname?: string;
  email?: string;
  role?: string;
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

  useEffect(() => {
    if (!user) return;

    return onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      const data = snapshot.data() || {};
      const nextProfile = {
        nickname: typeof data.nickname === 'string' ? data.nickname : '',
        email: typeof data.email === 'string' ? data.email : user.email || '',
        role: typeof data.role === 'string' ? data.role : '',
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
    setPushStatus('מבקש הרשאה...');

    try {
      await requestWebPushToken(user.uid);
      setPushStatus('התראות הופעלו בדפדפן הזה.');
    } catch (error) {
      setPushStatus(error instanceof Error ? error.message : 'לא ניתן להפעיל התראות כרגע.');
    }
  }

  return (
    <main className="profile-page">
      <Card className="profile-card">
        <Avatar name={profile?.nickname || profile?.email} src={profile?.avatarUrl} />
        <h1>הפרופיל שלי</h1>
        <p>{profile?.email || user?.email}</p>
        {!!profile?.homeroomName && <p>{profile.homeroomName}</p>}

        <form className="auth-form" onSubmit={(event) => void saveNickname(event)}>
          <label>
            כינוי
            <input
              value={nickname}
              maxLength={20}
              onChange={(event) => setNickname(event.target.value)}
            />
          </label>
          <Button type="submit" disabled={saving}>
            {saving ? 'שומר...' : 'שמור כינוי'}
          </Button>
        </form>

        <label className="file-upload">
          {uploading ? 'מעלה תמונה...' : 'העלאת תמונת פרופיל'}
          <input type="file" accept="image/*" onChange={(event) => void uploadAvatar(event)} />
        </label>

        <div className="profile-actions">
          <Button type="button" tone="muted" onClick={() => void enablePush()}>
            הפעלת התראות
          </Button>
          {!!pushStatus && <p>{pushStatus}</p>}
        </div>
      </Card>
    </main>
  );
}
