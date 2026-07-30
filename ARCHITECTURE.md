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
from this repository is prefixed `us` — `usRegisterStaffWithCode`,
`usSendChatNotification`, and so on. Function names must be unique per project;
dropping a prefix would overwrite the Israeli function of the same name.

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
