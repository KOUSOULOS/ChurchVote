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
    // legacy single-question fields removed; clients must use `questions` array
  };

  const docRef = await pollsRef.add(payload);
  return { id: docRef.id, accessCode: code };
});

// Callable to toggle a poll's active state. Uses admin SDK so clients
// (which are blocked by Firestore rules from editing polls) can request
// a server-side change. Expects { pin, appId, pollId, isActive }
exports.togglePollActive = functions.https.onCall(async (data, context) => {
  const adminPin = functions.config().admin && functions.config().admin.pin;
  const providedPin = data.pin;
  if (!adminPin || providedPin !== adminPin) {
    throw new functions.https.HttpsError('permission-denied', 'Invalid admin PIN');
  }

  const appId = data.appId || 'church-vote-production';
  const pollId = data.pollId;
  if (!pollId) {
    throw new functions.https.HttpsError('invalid-argument', 'pollId required');
  }

  const isActive = typeof data.isActive === 'boolean' ? data.isActive : true;

  const db = admin.firestore();
  const pollRef = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('polls').doc(pollId);

  await pollRef.update({ isActive: isActive });
  return { id: pollId, isActive };
});



// Callable to delete all polls and their votes for an appId (ADMIN ONLY).
// Use with caution. Expects { pin, appId }
exports.deleteAllPolls = functions.https.onCall(async (data, context) => {
  const adminPin = functions.config().admin && functions.config().admin.pin;
  const providedPin = data.pin;
  if (!adminPin || providedPin !== adminPin) {
    throw new functions.https.HttpsError('permission-denied', 'Invalid admin PIN');
  }

  const appId = data.appId || 'church-vote-production';
  const db = admin.firestore();

  const pollsColl = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('polls');
  const pollsSnap = await pollsColl.get();

  let deletedCount = 0;
  let batch = db.batch();
  let ops = 0;

  for (const pollDoc of pollsSnap.docs) {
    // delete the poll doc
    batch.delete(pollDoc.ref);
    ops++;

    // delete associated votes collection named `poll_${pollId}_votes` if it exists
    const votesColl = db.collection('artifacts').doc(appId).collection('public').doc('data').collection(`poll_${pollDoc.id}_votes`);
    const votesSnap = await votesColl.get();
    for (const vdoc of votesSnap.docs) {
      batch.delete(vdoc.ref);
      ops++;
      if (ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; }
    }

    if (ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; }
    deletedCount++;
  }

  if (ops > 0) await batch.commit();

  return { deletedPolls: deletedCount };
});
