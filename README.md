# ChurchVote — Firebase Hosting Guide

This workspace was scaffolded to host the app on Firebase Hosting.

Quick steps:

1. Install dependencies

```bash
npm install
```

2. Fill `src/App.jsx` -> replace the `MY_FIREBASE_CONFIG` object with your Firebase project's config (Firebase Console → Project Settings → Your apps).

3. Build the app

```bash
npm run build
```

4. Install Firebase CLI (if you don't have it)

```bash
npm install -g firebase-tools
```

5. Login & initialize hosting (one-time)

```bash
firebase login
firebase init hosting
# When prompted: select your Firebase project (or create one), set public directory to "dist", configure as a single-page app (yes)
```

6. Deploy

```bash
firebase deploy --only hosting
```

Notes:
- This scaffold uses the Tailwind Play CDN for styling so you don't need to run a Tailwind build step. For production, compile Tailwind instead.
- If your app needs the full code in `App.js`, copy the rest of the original `App.js` content into `src/App.jsx` (the file created here contains a shortened placeholder).
- Ensure `MY_FIREBASE_CONFIG` contains correct values before deploying.

Environment-based Firebase config
- Create a `.env.local` file in the project root (it is ignored by git) with these variables (you can copy from `.env.example`):

```bash
cp .env.example .env.local
# then edit .env.local and fill values
```

Vite exposes variables that start with `VITE_` as `import.meta.env` in the app. `src/App.jsx` now reads `VITE_FIREBASE_*` variables so you don't need to commit API keys to version control.

If you'd like, I can now run `npm install` and a local `npm run dev` to verify the app, then run `firebase init` for you (I will prompt before authenticating). Do you want me to proceed with those commands now?
