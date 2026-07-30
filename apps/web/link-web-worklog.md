# Link Web Worklog

This document tracks the work done in `link-web` so the mobile app side can stay aligned.

## 2026-07-09 - Task 1: Create `apps/web`

Created the initial web app scaffold under `apps/web` using:

- Vite
- React 19
- TypeScript
- React Router

Files added:

- `apps/web/package.json`
- `apps/web/package-lock.json`
- `apps/web/vite.config.ts`
- `apps/web/tsconfig.json`
- `apps/web/index.html`
- `apps/web/src/main.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `apps/web/.gitignore`

Validation:

- Installed dependencies with `npm install` inside `apps/web`.
- Ran `npm run build` successfully.
- Started the Vite dev server at `http://127.0.0.1:5173/`.

Notes:

- The scaffold currently includes placeholder routes for `/mentor`, `/school`, and `/social`.
- No mock HTML conversion was done in this task.
- No files outside `apps/web` were changed for the scaffold.

## 2026-07-09 - Task 2: Connect Firebase to `apps/web`

Connected the web app scaffold to Firebase using the existing project config for `link-app-965dd`.

Files added or changed:

- `apps/web/package.json`
- `apps/web/package-lock.json`
- `apps/web/.env.example`
- `apps/web/src/lib/firebase.ts`
- `apps/web/src/main.tsx`
- `apps/web/src/vite-env.d.ts`

Implementation details:

- Added the `firebase` npm package to `apps/web`.
- Created `apps/web/src/lib/firebase.ts`.
- Exported initialized `app`, `auth`, `db`, and `storage`.
- Configured Firebase Auth with `browserLocalPersistence` via `setPersistence`.
- Imported `authPersistenceReady` in `main.tsx` so the web app initializes the browser persistence setup at startup.
- Added Vite client typings for `import.meta.env`.

Validation:

- Ran `npm install firebase` inside `apps/web`.
- Ran `npm run build` successfully after adding Vite env typings.

Notes:

- No mobile app files were edited.

## 2026-07-09 - Backlog tasks 38-41

Handled backlog items that can be implemented safely in the web app now.

Files added or changed:

- `apps/web/src/pages/MentorGuidePage.tsx`
- `apps/web/src/pages/StaffPortalPage.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/layouts/AppLayout.tsx`
- `apps/web/src/styles.css`

Implementation details:

- Added staff reports under the school portal, including class-level student/open-alert counts and mentor hour summaries.
- Added a static mentor guide page and linked it from the mentor navigation.

Validation:

- Ran `npm run typecheck` successfully.
- Ran `npm run build` successfully.
- Vite still reports the existing Firebase bundle-size warning; it does not block the build.

Blocked backlog items:

- Anonymous identity reveal was not implemented. It requires a privacy/legal product decision for minors, re-auth, immutable audit logs, and server-side Cloud Function enforcement.
- Video calls were not implemented. The task requires choosing a managed provider such as LiveKit or Daily before code integration.

Notes:

- No mobile app files were edited.

## 2026-07-09 - Tasks 30-36: Web quality, PWA, push, offline, accessibility, monitoring

Added the cross-platform web quality layer.

Files added or changed:

- `apps/web/public/firebase-messaging-sw.js`
- `apps/web/public/manifest.webmanifest`
- `apps/web/public/link-icon.svg`
- `apps/web/src/lib/messaging.ts`
- `apps/web/src/lib/sentry.ts`
- `apps/web/src/lib/firebase.ts`
- `apps/web/src/main.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/pages/ProfilePage.tsx`
- `apps/web/src/styles.css`
- `apps/web/.env.example`
- `apps/web/package.json`
- `apps/web/package-lock.json`
- `apps/web/index.html`
- `apps/web/docs/browser-test-matrix.md`

Implementation details:

- Enabled Firestore IndexedDB offline persistence with `persistentLocalCache` and multi-tab support.
- Added a PWA manifest, theme color, icon, and service worker registration.
- Added `firebase-messaging-sw.js` for background Firebase Cloud Messaging.
- Added foreground FCM handling with an in-app toast.
- Added a profile action for requesting Web Push permission only after a user click.
- Saves web push tokens to `users/{uid}/fcmWebTokens/{token}`.
- Added global focus-visible styling and a skip link for keyboard navigation.
- Added a browser and platform smoke-test matrix for releases.
- Added optional Sentry initialization through `VITE_SENTRY_DSN`.

Validation:

- Ran `npm run typecheck` successfully.
- Ran `npm run build` successfully.
- Vite still reports the existing Firebase bundle-size warning; it does not block the build.

External configuration still required:

- `VITE_FIREBASE_VAPID_KEY` must be created in Firebase Console under Cloud Messaging Web Push certificates before real Web Push tokens can be issued.
- `VITE_SENTRY_DSN` must be supplied from Sentry before client error monitoring becomes active.

Notes:

- No mobile app files were edited.

## 2026-07-09 - Tasks 24-29: Staff portal

Built the school staff portal.

Files added or changed:

- `apps/web/src/pages/StaffPortalPage.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`

Implementation details:

- Replaced the `/school` placeholder with a live staff portal.
- Added KPI cards for students, mentors, open distress alerts, and pending hour reports.
- Added a students table with text search and class filtering.
- Added distress alert management with resolve action and staff-to-student chat creation.
- Added `/school/chat/:chatId` so staff can open the chat generated from an alert.
- Added mentor hour approval and rejection actions against `mentorHours`.
- Added class creation and class listing through the `classes` collection.
- Added pending mentor approval and rejection against `users/{uid}.mentorStatus`.

Validation:

- Ran `npm run typecheck` successfully.
- Ran `npm run build` successfully.
- Vite still reports the existing Firebase bundle-size warning; it does not block the build.

Notes:

- No mobile app files were edited.

## 2026-07-09 - Tasks 19-23: Mentor area

Built the approved mentor workspace.

Files added or changed:

- `apps/web/src/pages/MentorHomePage.tsx`
- `apps/web/src/pages/MentorHoursPage.tsx`
- `apps/web/src/pages/MentorActivityPage.tsx`
- `apps/web/src/pages/MentorReflectionPage.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/layouts/AppLayout.tsx`
- `apps/web/src/styles.css`

Implementation details:

- Added a mentor dashboard with mentee count, conversation count, approved hours, pending hours, recent chats, and quick actions.
- Reused the real-time chat page under `/mentor/chat` and `/mentor/chat/:chatId`.
- Added hour reporting to `mentorHours` with pending approval status and local history.
- Added a mentor activity feed derived from chats, hour reports, and reflections.
- Added reflection capture to the shared `reflections` collection.
- Updated the mentor navigation to expose Home, Chats, Hours, Activity, Reflection, Friends, and Profile.
- Firestore reads avoid server-side ordering so the initial web implementation does not require new composite indexes.

Validation:

- Ran `npm run typecheck` successfully.
- Ran `npm run build` successfully.
- Vite still reports the existing Firebase bundle-size warning; it does not block the build.

Notes:

- No mobile app files were edited.

## 2026-07-09 - Task 18: Volunteer mentoring chat

Added the student volunteer-chat entry point.

Files added or changed:

- `apps/web/src/pages/VolunteersPage.tsx`
- `apps/web/src/pages/ChatPage.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/layouts/AppLayout.tsx`
- `apps/web/src/styles.css`

Implementation details:

- Lists approved mentors from `users` where `role === 'mentor'` and `mentorStatus === 'approved'`.
- Allows students to search mentors by nickname, email, or class label.
- Opens a deterministic mentoring chat using `mentoring_${[studentUid, mentorUid].sort().join('_')}`.
- Writes the chat parent document with `type: 'mentoring'`, `studentUid`, `mentorUid`, participants, and `chatNames`.
- Added `/mentoring` to the student navigation.
- Added `/social/:chatId` so the web app can deep-link directly into the opened chat.

Validation:

- Ran `npm run typecheck` successfully.
- Ran `npm run build` successfully.
- Vite still reports the existing Firebase bundle-size warning; it does not block the build.

Notes:

- No mobile app files were edited.

## 2026-07-09 - Task 13: Real-time chat master and detail

Replaced the `/social` placeholder with a real-time chat experience.

Files added or changed:

- `apps/web/src/pages/ChatPage.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`

Implementation details:

- Added a master/detail chat layout for web.
- Subscribes to `chats` where the current user is in `participants`, ordered by `lastMessageAt`.
- Subscribes to `chats/{chatId}/messages`, ordered by `createdAt`.
- Supports searching users by nickname and opening deterministic DM chat IDs with `[uidA, uidB].sort().join('_')`.
- Sends messages to `chats/{chatId}/messages`.
- Updates the parent `chats/{chatId}` document with `lastMessage`, `lastMessageAt`, `lastSender`, `participants`, `chatNames`, and group metadata.
- Keeps group chats compatible with the mobile app group chat documents.

Validation:

- Ran `npm run typecheck` successfully.
- Ran `npm run build` successfully.
- Vite still reports the existing Firebase bundle-size warning; it does not block the build.

Notes:

- No mobile app files were edited.

## 2026-07-09 - Task 12: Discover groups, SOS, and profile

Added three missing student-area web pages from the task list.

Files added or changed:

- `apps/web/src/pages/DiscoverPage.tsx`
- `apps/web/src/pages/DistressPage.tsx`
- `apps/web/src/pages/ProfilePage.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/layouts/AppLayout.tsx`
- `apps/web/src/styles.css`

Implementation details:

- Added `/discover` for live group discovery, filtering, joining, leaving, and creating groups.
- Uses the mobile-compatible Firestore contract: `groups`, `groups/{id}/members`, `users.joinedGroupIds`, and group chat docs in `chats/{groupId}`.
- Added `/distress` for students to send SOS alerts to `distressAlerts`.
- Added `/profile` for nickname editing and avatar upload to Storage at `avatars/{uid}`.
- Added layout navigation entries for Discover, SOS, and Profile.

Validation:

- Ran `npm run typecheck` successfully.
- Ran `npm run build` successfully.
- Vite still reports the existing Firebase bundle-size warning; it does not block the build.

Notes:

- No mobile app files were edited.

## 2026-07-09 - Task 8: Create Firebase Web App and use official Web SDK config

Created an official Firebase Web App for `link-web` and updated the web app to use its SDK config.

Firebase CLI actions:

- Confirmed there was no existing Web app in project `link-app-965dd`.
- Created a Firebase Web App:
  - Display name: `link-web`
  - App ID: `1:87561510798:web:1726be658265d05bb7cedf`
- Retrieved the official Web SDK config with `firebase apps:sdkconfig`.

Files changed:

- `apps/web/.env.example`
- `apps/web/src/lib/firebase.ts`

Implementation details:

- Replaced the temporary Android `appId` fallback with the official Web `appId`.
- Replaced the temporary API key fallback with the official Web API key.
- Added `VITE_FIREBASE_MEASUREMENT_ID` to `.env.example`.
- Added `measurementId` to the Firebase client config.

Validation:

- Ran `npm run typecheck` successfully.
- Ran `npm run build` successfully.
- Vite still reports the existing Firebase bundle-size warning; it does not block the build.

Notes:

- No Firebase Console action was required.
- No mobile app files were edited.

## 2026-07-09 - Task 9: Friends list, requests, and badge

Added the web friends experience using the existing mobile Firestore contract.

Files added or changed:

- `apps/web/src/friends/usePendingFriendRequestsCount.ts`
- `apps/web/src/pages/FriendsPage.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`

Implementation details:

- Added `/friends` behind the same access rules as `/social`: students and approved mentors.
- Added a top-nav badge showing pending friend requests for the signed-in user.
- Subscribes to `friendRequests` where `toUid === currentUser.uid` and `status === 'pending'`.
- Subscribes to the current `users/{uid}` document to read the `friends` array.
- Loads friend profiles from `users/{friendUid}`.
- Supports accepting requests by setting the request to `accepted` and adding each user to the other user's `friends` array.
- Supports declining requests by setting the request to `declined`.
- Supports removing friends by removing each uid from the other user's `friends` array.

Validation:

- Ran `npm run typecheck` successfully.
- Ran `npm run build` successfully.
- Vite still reports the existing Firebase bundle-size warning; it does not block the build.

Notes:

- The `פתח שיחה` button is visual for now; chat route behavior will be wired when chat pages are implemented on web.
- No mobile app files were edited.

## 2026-07-09 - Task 10: Login/Register screen

Replaced the login placeholder with a working email/password Login/Register screen.

Files added or changed:

- `apps/web/src/pages/LoginPage.tsx`
- `apps/web/src/pages/LoginPlaceholder.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/components/ui.tsx`
- `apps/web/src/styles.css`

Implementation details:

- Supports login with email/password.
- Supports registration with role selection: student, mentor, staff.
- Loads classes from Firestore and requires class selection for students and mentors.
- Sets `mentorStatus: 'pending'` for newly registered mentors.
- Writes user profiles to `users/{uid}` with fields compatible with the mobile app.
- Supports staff invite code field, written as `staffInviteCode`.
- Stores remembered email in browser `localStorage`; Firebase Auth persistence remains `browserLocalPersistence`.
- Adds base UI components used by the auth screen and future pages.

Validation:

- Ran `npm run typecheck` successfully.
- Ran `npm run build` successfully.
- Vite still reports the existing Firebase bundle-size warning; it does not block the build.

Notes:

- No mobile app files were edited.

## 2026-07-09 - Task 11: Layout shells and base component library

Added the missing shell and component foundation from the task list.

Files added or changed:

- `apps/web/src/layouts/AppLayout.tsx`
- `apps/web/src/components/ui.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`

Implementation details:

- Added Student, Mentor, Staff, and Social layout shells using `Outlet`.
- Moved authenticated navigation into the relevant layout shell instead of rendering one global nav for every route.
- Student/Mentor shells show the friends badge through `usePendingFriendRequestsCount`.
- Added base UI primitives for future screens: Button, Card, Chip, Badge, Avatar, SearchBox, Modal, Toast, and DataTable.
- Added base CSS for the new auth and shell UI.

Validation:

- Ran `npm run typecheck` successfully.
- Ran `npm run build` successfully.

Notes:

- The component library is intentionally lightweight; deeper styling will be expanded as each mock page is converted.
- No mobile app files were edited.
- No mock HTML conversion was done in this task.
- Vite reports a bundle-size warning because Firebase is included in the initial client bundle. This is not blocking for this task.

## 2026-07-09 - Task 3: Connect Firebase CLI project files

Added minimal Firebase CLI project files for `link-web`.

Files added:

- `.firebaserc`
- `firebase.json`

Implementation details:

- Set the default Firebase project to `link-app-965dd`.
- Configured Firebase Hosting to serve `apps/web/dist`.
- Added an SPA rewrite from all routes to `/index.html`.

Notes:

- No deploy was run.
- No mobile app files were restored.
- Verified Firebase CLI access with `firebase apps:list --project link-app-965dd`.
- The project currently has two Android apps and no Web app, so a Firebase Web app must be created before replacing the temporary web config with an official Web SDK config.

## 2026-07-09 - Task 4: Convert mock CSS variables to shared theme

Converted the CSS variables from the static HTML mocks into shared web theme files.

Files added or changed:

- `apps/web/src/theme/theme.css`
- `apps/web/src/theme/tokens.ts`
- `apps/web/src/main.tsx`
- `apps/web/src/styles.css`

Implementation details:

- Created canonical CSS custom properties such as `--color-primary`, `--color-bg`, `--color-surface`, `--radius-sm`, and `--shadow-sm`.
- Kept legacy aliases from the mocks, such as `--primary`, `--bg`, `--card`, `--text-2`, and `--r-sm`, to make later mock migration easier.
- Added a `data-theme="social"` override for the social mock differences.
- Added TypeScript token exports for shared use in future components.
- Updated the current web scaffold styles to consume the shared theme variables.

Validation:

- Ran `npm run build` successfully.
- Vite still reports the existing Firebase bundle-size warning; it is unrelated to the theme conversion and does not block the build.

Notes:

- No HTML mock conversion was done in this task.
- No mobile app files were edited.

## 2026-07-09 - Task 5: Firebase Hosting and preview channels

Configured Firebase Hosting for the web app and added preview-channel workflow commands.

Files added or changed:

- `.firebaserc`
- `firebase.json`
- `apps/web/package.json`

Implementation details:

- Added the Firebase Hosting target `link-web` and mapped it to the existing site `link-app-965dd`.
- Configured Hosting to serve `apps/web/dist`.
- Added SPA rewrites to route all browser paths to `/index.html`.
- Added cache headers for hashed JS/CSS assets and `index.html`.
- Added `apps/web` scripts:
  - `npm run hosting:preview`
  - `npm run hosting:deploy`
- Preserved the existing Firestore, Storage, and Functions entries in `firebase.json` while adding the web Hosting target.
- Preserved the original app `.gitignore` entries while adding `.firebase/` and web env/log ignores.

Validation:

- Ran `npm run build` successfully.
- Ran `npm run hosting:preview` successfully.
- Preview URL: `https://link-app-965dd--link-web-preview-j5jyf53o.web.app`
- Preview expires on `2026-07-16 11:11:11`.

Notes:

- Preview channels deploy to Firebase Hosting without changing the live production channel.
- No mobile app files were edited.
- Vite still reports the existing Firebase bundle-size warning; it does not block deployment.

## 2026-07-09 - Task 6: Route guards by `role` and `mentorStatus`

Added web route guards that use the existing mobile app user contract from Firestore.

Files added or changed:

- `apps/web/src/auth/types.ts`
- `apps/web/src/auth/AuthProvider.tsx`
- `apps/web/src/auth/useAuth.ts`
- `apps/web/src/auth/ProtectedRoute.tsx`
- `apps/web/src/pages/LoginPlaceholder.tsx`
- `apps/web/src/pages/MentorPendingPage.tsx`
- `apps/web/src/pages/UnauthorizedPage.tsx`
- `apps/web/src/main.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`

Implementation details:

- Reads authenticated Firebase users with `onAuthStateChanged`.
- Loads `users/{uid}` from Firestore for `role`, `mentorStatus`, `nickname`, `classId`, and `className`.
- Supports `role` and `mentorStatus` from custom claims if they exist, falling back to Firestore user fields.
- Protects `/school` for `staff`.
- Protects `/mentor` for `mentor` users with `mentorStatus === 'approved'`.
- Protects `/social` for `student` users and approved `mentor` users.
- Redirects pending or rejected mentors to `/mentor/pending`.
- Redirects unauthenticated users to `/login`.
- Redirects authenticated users without matching permissions to `/unauthorized`.

Validation:

- Ran `npm run build` successfully.
- Vite still reports the existing Firebase bundle-size warning; it does not block the build.

Notes:

- No real login UI was added in this task; `/login` is a placeholder route.
- No mobile app files were edited.

## 2026-07-09 - Task 7: Mentor pending approval screen

Built a fuller waiting screen for mentors who are not approved yet.

Files changed:

- `apps/web/src/pages/MentorPendingPage.tsx`
- `apps/web/src/styles.css`

Implementation details:

- Shows different content for `mentorStatus === 'pending'` and `mentorStatus === 'rejected'`.
- Displays request details from the loaded user profile: class, nickname, and email.
- Explains that staff approval is required before accessing mentor tools.
- Keeps the sign-out action available from the waiting screen.
- Uses the shared theme tokens for colors, surface, borders, radius, and shadows.

Validation:

- Ran `npm run build` successfully.
- Vite still reports the existing Firebase bundle-size warning; it does not block the build.

Notes:

- No mobile app files were edited.
