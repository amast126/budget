// Loaded before the app. Firebase's web config is public by design; security comes from Firestore rules and authorized domains.
window.BUDGET_CONFIG = {
  firebase: {
    apiKey: "AIzaSyB1hbEoGKx1N9dHnpSDcBqdBDfHT0jXpsY",
    authDomain: "budget-tracker-273ef.firebaseapp.com",
    projectId: "budget-tracker-273ef",
    storageBucket: "budget-tracker-273ef.firebasestorage.app",
    messagingSenderId: "607099933509",
    appId: "1:607099933509:web:310d09f45e9e87731aa42c",
  },
  // From finnhub.io → Dashboard → API key. Only the Portfolio tab uses it.
  finnhubKey: "dajfpt1r01qhhp590du0dajfpt1r01qhhp590dug",
  // Only these Google accounts can open the tracker. Anyone else gets a closed door.
  allowedEmails: ["amast126@gmail.com", "my2als66@gmail.com"],
  // The account that owns the tracker. Everyone else on the list gets a live, read-only view.
  ownerEmail: "amast126@gmail.com",
  sharedDocId: "alec-tracker",
};
