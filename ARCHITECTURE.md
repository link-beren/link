# Link US — architecture and setup

This repository is the United States product. It was forked from the Israeli
`link-app` repository and is maintained as separate source, but it deliberately
shares infrastructure with it.

## The core decision

One Firebase project (`link-app-965dd`), two Firestore databases.

The Israeli app writes to the project's **default** database in `me-west1`
(Tel Aviv). The US app writes to a **named** database called `usa` in a US
region. Everything else — Authentication, Cloud Messaging, Storage, billing,
and the admin console — is shared.

This was chosen over the two obvious alternatives for specific reasons. Putting
both markets in one database would have meant American students' records living
permanently in Israel, and a Firestore region cannot be changed after the
database is created; a school district asking where the data resides is a
routine procurement question, and re-regioning a live system means a full export
and import. Creating a second Firebase project would have solved residency but
broken the requirement that a single admin site, with a single login, sees both
markets — a separate project does not honour the Israeli project's auth token,
so the admin would need a second sign-in or a custom-token bridge.

The named-database approach keeps one login, one push-notification setup and one
console, while still landing US minors' data on US soil.

The cost of the decision, stated plainly: the Authentication user pool is shared
between markets, so one email address cannot register in both. And because both
codebases deploy Cloud Functions into the same project, every function exported
from this repository is prefixed `us` — `usRegisterWithSchoolCode`,
`usSendChatNotification`, and so on. Function names must be unique per project;
dropping a prefix would overwrite the Israeli function of the same name.

The same trap applies to anything that opens Firestore by hand.
`getFirestore()` with no argument returns the **default** database, which is
the Israeli data. Server code in this repository must pass the id — see
`DB_ID` in `functions/index.js` and `functions/scripts/grant-admin.js`. Firestore
v2 triggers have the same problem and need an explicit `database: DB_ID` in
their options, or they attach silently to the wrong country.

## What differs from the Israeli app

The isolation model is inverted. In Israel a student is deliberately global: a
volunteer in Kfar Saba can mentor a student in Beer Sheva, and the school is a
unit of work rather than a unit of isolation. In the United States the school is
a closed world. Students, volunteers and staff all belong to one school, and
nothing crosses the boundary.

This is expected to loosen later, so the boundary is expressed as policy in
`src/config/market.js` rather than hardcoded at each query site.

Volunteers here are older students at the same school — peer mentors, not
adults — and any student may apply, subject to staff approval. Ministry of
Education (מנד"ה) sign-in has been removed; it has no American equivalent.

Parental consent is a known and deliberate gap. It has been deferred, not
solved. Before this ships to a real district it will need either a school-consent
attestation flow or in-app verifiable parental consent under COPPA.

## How someone joins a school

There is no school picker. The `schools` collection is not publicly readable —
if it were, anyone could open the sign-up screen and enumerate every district on
the platform — so the registration code is what names the school.

Each school has **two** codes, not one:

    schools/{schoolId}/private/code   { staffCode, studentCode }
    schoolCodes/{CODE}                { schoolId, audience }

`audience` is `'staff'` or `'student'`, and it decides which roles the code can
create: a staff code makes staff, a student code makes students and pending peer
mentors. A single shared code would mean every student who registers is also
holding the string that grants staff access — and staff can read every
student's distress alerts. The student code is meant to be read aloud in a
classroom; the staff code is not.

Registration goes through `usRegisterWithSchoolCode`, and only through it. The
rules deny client writes to `/users` outright (`allow create: if false`),
because a client that could write its own document could type any `schoolId`
into DevTools and land inside another school. The function also sets the
`schoolId` custom claim, so the client must call `getIdToken(true)` afterwards
or every school-scoped query will fail on a stale token.

Either code can be regenerated — by a system admin via
`usAdminRotateSchoolCode`, or by the school's own staff via
`usStaffRotateSchoolCode`. Both take an `audience` argument and rotate one code
at a time. Already-registered users are unaffected; their school is recorded on
their user document, not re-derived from the code.

## Grade levels and homerooms

The Israeli app groups students by כיתה — a fixed cohort that moves through the
day together. American schools only work that way through grade 5. From grade 6
students take subjects with different teachers and have no fixed cohort, so the
grouping axis here is the **grade level** (K through 12, in
`src/config/market.js`), which every student has.

The `classes` collection survives, but it now means an *optional homeroom or
advisory group*, and the denormalized fields on a user document are
`homeroomId` / `homeroomName` rather than `classId` / `className`. The security
rules name those fields explicitly, so a write using the old names is rejected.

## Deploy commands

Run these from this repository. They touch only US resources.

    firebase deploy --only firestore:usa
    firebase deploy --only functions:usa
    firebase deploy --only hosting:us-web,hosting:us-school-web

The Israeli repository deploys its own codebase and hosting targets. The two do
not overlap, which is what `codebase: "usa"` and the `us-*` hosting targets in
`firebase.json` exist to guarantee.

## Manual setup still required

These cannot be done from source and need the Firebase console:

Create the Firestore database named `usa` in a US region (`nam5` or
`us-central1`). This must exist before the first deploy.

Register a new Android app for the package `com.yahel_beren.linkappus` and a new
iOS app for `com.yahelberenstin.linkappus`, then download the fresh
`google-services.json` into this repository's root. The `appId` currently in
`src/firebase.js` and `school-web/index.html` still points at the Israeli
Android app and must be replaced.

Create the two Hosting sites, `link-app-us` and `link-school-us`.

Run `eas init` to create a new Expo project; `app.json` has an empty `eas` block
because the old project ID belonged to the Israeli app.
