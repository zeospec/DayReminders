# Day Reminders

[![Netlify Status](https://api.netlify.com/api/v1/badges/e3d46ba2-9c63-4093-aafc-1232106c5b37/deploy-status)](https://app.netlify.com/projects/dayreminders/deploys)

**Never miss a special celebration again.** Day Reminders is a web app that helps you track birthdays, anniversaries, and other recurring events. Sign in with Google, add your contacts, and get daily notifications for today’s and tomorrow’s celebrations.

- **Live app:** [reminders.zeospec.com](https://reminders.zeospec.com)

---

## Features

- **Single sign-on** — Google OAuth via Firebase Authentication
- **Contact management** — Add, edit, and delete reminders (name, date, type, phone, reference note)
- **Event types** — Birthdays, anniversaries, or custom types
- **Upcoming view** — List sorted by days until next occurrence (today, tomorrow, then by date)
- **Search & filter** — By name/reference and by type (All / Birthdays / Anniversaries)
- **WhatsApp** — One-tap link to send a pre-filled wish (when phone number is set)
- **Daily notifications** — Browser reminders for events today and tomorrow (optional, user-controlled)
- **Dark mode** — Toggle with preference stored in the browser
- **Responsive** — Mobile-first layout; works on phones, tablets, and desktops
- **Private** — Each user’s data lives in their own Google Sheet (one sheet per user)

---

## Tech Stack

| Layer        | Technology |
|-------------|------------|
| Frontend    | HTML5, CSS3, Tailwind CSS, Vanilla JavaScript (ES modules) |
| Auth        | Firebase Authentication (Google sign-in) |
| Backend     | Google Apps Script (REST API) |
| Data        | Google Sheets (one sheet per user) |
| Hosting     | Netlify (static site) |

---

## Project Structure

```
DayReminders/
├── index.html          # Single-page app (login + main UI)
├── app.js              # Main app logic, UI, API calls
├── auth.js             # Firebase auth (init, sign-in, token)
├── notifications.js     # Browser notifications for today/tomorrow
├── config.js           # API URL (Google Apps Script web app)
├── firebase-config.js  # Firebase project config
├── style.css           # Custom styles
├── favicon.svg         # App icon
├── _redirects          # Netlify redirects (custom domain)
├── Code.gs             # Google Apps Script backend (paste into Sheet)
├── login.js            # Legacy; login is now in index.html + app.js
└── README.md           # This file
```

---

## Prerequisites

- A [Google](https://google.com) account
- A [Firebase](https://console.firebase.google.com) project
- A [Netlify](https://netlify.com) account (for hosting)
- A Google Sheet (for the Apps Script backend)

---

## Setup

### 1. Firebase

1. Go to [Firebase Console](https://console.firebase.google.com) and create or select a project.
2. Enable **Authentication** → **Sign-in method** → **Google**.
3. **Project settings** → **General** → **Your apps** → **Add app** → **Web**.
4. Copy the config object (e.g. `apiKey`, `authDomain`, `projectId`, etc.).

**Frontend:** Put the config in `firebase-config.js`:

```javascript
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

**Backend:** You’ll use the same `projectId` and the **Web API Key** (Project settings → General) in Apps Script (step 3).

---

### 2. Google Apps Script backend

1. Create a **new Google Sheet** (or use an existing one).
2. **Extensions** → **Apps Script**.
3. Replace the default script with the contents of `Code.gs`.
4. Set your Firebase values at the top of `Code.gs`:
   - `FIREBASE_PROJECT_ID` — same as in `firebase-config.js`
   - `FIREBASE_API_KEY` — Firebase **Web API Key** (Project settings → General)
5. **Run** → Select **authorizeExternalRequests** → **Run**.  
   When prompted, complete the OAuth flow so the script can call Firebase’s API.
6. **Deploy** → **New deployment** → Type: **Web app**:
   - **Execute as:** Me
   - **Who has access:** Anyone (so the frontend can call it)
7. Copy the **Web app URL** (e.g. `https://script.google.com/macros/s/.../exec`).

**Frontend:** In `config.js`, set:

```javascript
export const API_URL = 'YOUR_APPS_SCRIPT_WEB_APP_URL';
```

**Data model:** The script creates one sheet per user, named `Contacts_<userId>`. Row 1 is the header:  
`id | name | reference | phone | date | type`. Dates are stored as `YYYY-MM-DD`.

---

### 3. Netlify (hosting)

1. Push the repo to GitHub/GitLab (or connect another git source).
2. In [Netlify](https://app.netlify.com): **Add new site** → **Import an existing project**.
3. Connect the repo; build settings:
   - **Build command:** leave empty (static site).
   - **Publish directory:** `/` (root).
4. Deploy. The app will be at `https://<site-name>.netlify.app`.

**Custom domain (optional):**

- **Domain settings** → Add custom domain (e.g. `reminders.zeospec.com`).
- Add a `_redirects` file in the repo root (already present):

```
# Redirect Netlify subdomain to primary domain
https://dayreminders.netlify.app/* https://reminders.zeospec.com/:splat 301!
```

---

## Configuration Summary

| File / Place        | What to set |
|---------------------|-------------|
| `firebase-config.js`| Firebase web app config from Firebase Console. |
| `config.js`         | `API_URL` = Google Apps Script web app URL. |
| `Code.gs`           | `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY` (and optionally `LOG_LEVEL`). |
| Netlify             | Publish directory = `/`, no build command. Optional: custom domain + `_redirects`. |

---

## Development

- **Local:** Open `index.html` in a browser or use a simple static server (e.g. `npx serve .`).  
  For Google sign-in to work, use HTTPS or `localhost`.
- **API:** The frontend expects the Apps Script web app to be deployed and the URL in `config.js`.
- **Auth:** Same Firebase project and config as production; use a separate Firebase project if you want a dev environment.

---

## Deployment (production)

1. **Firebase:** Production project with Google sign-in enabled; config in `firebase-config.js`.
2. **Apps Script:** Production Sheet + script; `FIREBASE_PROJECT_ID` and `FIREBASE_API_KEY` set; `authorizeExternalRequests()` run once; Web app deployed as “Anyone”.
3. **Netlify:** Connect repo, publish from root; set custom domain and `_redirects` if used.
4. **Secrets:** Avoid committing real API keys in public repos. For production, consider:
   - Netlify env vars and a build step that injects config, or
   - A minimal backend that serves config to the frontend.

---

## Notifications

- Notifications are **off** until the user turns them on via the bell icon in the header.
- When enabled, the app requests browser notification permission.
- Notifications are shown for events whose **next occurrence** is **today** or **tomorrow** (e.g. birthdays, anniversaries).
- Each reminder is shown at most once per day; state is stored in the browser.

---

## License

This project is for personal/portfolio use.  
For reuse or distribution, please respect Firebase, Google, and Netlify terms of service.

---

## Contributing

1. Fork the repo, create a branch, make changes.
2. Test locally with your own Firebase project and Apps Script deployment.
3. Open a pull request with a short description of the change.

---

*Day Reminders — never miss a celebration.*
