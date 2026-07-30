# Link Web Browser Test Matrix

Run this checklist before a production release.

## Desktop

| Platform | Chrome | Edge | Firefox | Safari |
| --- | --- | --- | --- | --- |
| macOS | Pending | Pending | Pending | Pending |
| Windows | Pending | Pending | Pending | N/A |
| ChromeOS | Pending | Pending | N/A | N/A |

## Mobile Web

| Platform | Browser | Status |
| --- | --- | --- |
| iOS | Safari | Pending |
| iOS | Chrome | Pending |
| Android | Chrome | Pending |
| Android | Edge | Pending |

## Smoke Tests

- Login and role redirect.
- Student chat, friends, discover, SOS, mentoring, and profile.
- Mentor dashboard, mentee chat, hour report, activity, and reflection.
- Staff dashboard, students filter, distress alert handling, hour approval, class creation, and mentor approval.
- Refresh on nested routes such as `/social/:chatId`, `/mentor/chat/:chatId`, and `/school/chat/:chatId`.
- Install as PWA on supported browsers.
- Enable Web Push after `VITE_FIREBASE_VAPID_KEY` is configured.
- Keyboard navigation: tab order, visible focus, modal close, and table actions.
- Offline Firestore read retry after reconnect.
