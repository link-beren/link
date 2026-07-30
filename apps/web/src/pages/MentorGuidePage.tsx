import { Card, Chip } from '../components/ui';

const guideSections = [
  {
    title: 'פתיחת קשר',
    body: 'מתחילים בשיחה קצרה, מתעניינים ביום של החניך/ה, ומסכמים יחד נושא אחד להתקדמות.',
  },
  {
    title: 'שמירה על גבולות',
    body: 'לא מבקשים פרטים אישיים רגישים, לא מעבירים שיחה לערוצים פרטיים, ומערבים צוות כשיש סימן מצוקה.',
  },
  {
    title: 'תיעוד',
    body: 'אחרי פעילות משמעותית מדווחים שעות ומוסיפים רפלקציה קצרה כדי שהצוות יוכל לעקוב.',
  },
  {
    title: 'מצבי מצוקה',
    body: 'אם עולה חשש לפגיעה או מצוקה דחופה, מפנים מיד לצוות דרך הערוצים הבית-ספריים.',
  },
];

export function MentorGuidePage() {
  return (
    <main className="page-shell">
      <section className="page-head">
        <div>
          <h1>מדריך לחונך</h1>
          <p>כללים קצרים לעבודה עקבית ובטוחה עם חניכים.</p>
        </div>
        <Chip tone="muted">תוכן ראשוני</Chip>
      </section>

      <section className="guide-grid">
        {guideSections.map((section) => (
          <Card key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </Card>
        ))}
      </section>
    </main>
  );
}
