import { signOut } from 'firebase/auth';
import { Navigate } from 'react-router-dom';
import { auth } from '../lib/firebase';
import { useAuth } from '../auth/useAuth';

export function MentorPendingPage() {
  const { profile } = useAuth();
  const rejected = profile?.mentorStatus === 'rejected';
  const statusLabel = rejected ? 'נדחה' : 'ממתין לאישור';

  if (profile?.mentorStatus === 'approved') {
    return <Navigate to="/mentor" replace />;
  }

  return (
    <main className="pending-page">
      <section className="pending-panel" aria-labelledby="mentor-pending-title">
        <div className={rejected ? 'pending-icon pending-icon-rejected' : 'pending-icon'}>
          {rejected ? '!' : '...'}
        </div>

        <div className="pending-content">
          <span className={rejected ? 'status-chip status-chip-rejected' : 'status-chip'}>
            {statusLabel}
          </span>
          <h1 id="mentor-pending-title">
            {rejected ? 'הבקשה שלך נדחתה' : 'הבקשה שלך ממתינה לאישור'}
          </h1>
          <p>
            {rejected
              ? 'צוות בית הספר דחה את בקשת ההצטרפות שלך כמתנדב/ת. ניתן לפנות לצוות לבירור או להירשם מחדש לאחר תיאום.'
              : 'צוות בית הספר צריך לאשר אותך לפני שתוכל/י להיכנס לאזור החונכים ולנהל שיחות, שעות ופעילות מול תלמידים.'}
          </p>
        </div>

        <dl className="pending-details" aria-label="פרטי בקשה">
          <div>
            <dt>כיתה</dt>
            <dd>{profile?.homeroomName || 'לא שויכה כיתה'}</dd>
          </div>
          <div>
            <dt>כינוי</dt>
            <dd>{profile?.nickname || 'לא הוגדר'}</dd>
          </div>
          <div>
            <dt>חשבון</dt>
            <dd>{profile?.email || 'לא זמין'}</dd>
          </div>
        </dl>

        {!rejected && (
          <ol className="pending-steps" aria-label="מה קורה עכשיו">
            <li>צוות בית הספר רואה את בקשת ההצטרפות שלך בפורטל.</li>
            <li>לאחר אישור, המסך ייפתח אוטומטית בכניסה הבאה.</li>
            <li>עד אז אין גישה למסכי חונך, צ'אט חונכות או דיווח שעות.</li>
          </ol>
        )}

        <button className="action-button" type="button" onClick={() => void signOut(auth)}>
          התנתקות
        </button>
      </section>
    </main>
  );
}
