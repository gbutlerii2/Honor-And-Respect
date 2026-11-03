// Paste your Firebase web app config here (Firebase console → Project settings → Your apps → Web app).
// While apiKey still starts with "YOUR_", the site runs in DEMO MODE: sample data stored in this browser only.
export const firebaseConfig = {
  apiKey: "AIzaSyDPQxH5XZYhmfG1XcLjzW9j3Zvi73Dding",
  authDomain: "honor-and-respect.firebaseapp.com",
  projectId: "honor-and-respect",
  storageBucket: "honor-and-respect.firebasestorage.app",
  messagingSenderId: "555432195255",
  appId: "1:555432195255:web:30f9abd098ad9a856fc932"
};

// Public address encoded into QR plaques: SITE_URL + "/m/" + memorial ID
export const SITE_URL = "https://honor-and-respect.com";

// Owner account: signs in with this username and is made admin automatically on first sign-in.
// Usernames without "@" are turned into emails: gbutlerii → gbutlerii@honor-and-respect.com
// Keep OWNER_EMAIL in step with firestore.rules (function isOwner).
export const OWNER_USERNAME = "gbutlerii";
export const USERNAME_DOMAIN = "honor-and-respect.com";
export const OWNER_EMAIL = `${OWNER_USERNAME}@${USERNAME_DOMAIN}`;

// Show "Continue with Google" on the sign-in screen (enable the Google provider in Firebase Auth first)
export const ENABLE_GOOGLE_SIGNIN = true;
