// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyAsHNjSQRToLOuFX47ZU-IfJ31xbfXmhYE",
  authDomain: "autorpg-acb1d.firebaseapp.com",
  projectId: "autorpg-acb1d",
  storageBucket: "autorpg-acb1d.firebasestorage.app",
  messagingSenderId: "363384656355",
  appId: "1:363384656355:web:ecbbf40512f60d834b90d6",
  measurementId: "G-1JF110QT4N"
};

// Firebase 초기화
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
