importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyA9FiNMZI50q6AeTS0Fiw1Qs-VVMmVI4Os",
    authDomain: "aircross-odyssey-f6e2f.firebaseapp.com",
    projectId: "aircross-odyssey-f6e2f",
    storageBucket: "aircross-odyssey-f6e2f.firebasestorage.app",
    messagingSenderId: "641282553954",
    appId: "1:641282553954:web:4b3fa456d9eda8adf2393b"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/icon.png'
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
});
