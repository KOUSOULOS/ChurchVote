const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// Callable function to create a poll as an admin operation.
// Protect this with a functions config secret: `firebase functions:config:set admin.pin="YOUR_PIN"`
exports.createPoll = functions.https.onCall(async (data, context) => {
  const adminPin = functions.config().admin && functions.config().admin.pin;
  const providedPin = data.pin;
  if (!adminPin || providedPin !== adminPin) {
    throw new functions.https.HttpsError('permission-denied', 'Invalid admin PIN');
  }

  const questions = data.questions;
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'questions required');
  }

  const code = data.accessCode || Math.floor(1000 + Math.random() * 9000).toString();
  const appId = data.appId || 'church-vote-production';

  const db = admin.firestore();
  const pollsRef = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('polls');

  const payload = {
    questions: questions,
    accessCode: code,
    isActive: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    question: questions[0].question,
    options: questions[0].options
  };

  const docRef = await pollsRef.add(payload);
  return { id: docRef.id, accessCode: code };
});
