import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  signInWithCustomToken
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
  updateDoc
} from 'firebase/firestore';
import { 
  Check, 
  Users, 
  Lock, 
  ChevronRight, 
  ArrowRight,
  RefreshCw,
  WifiOff,
  Plus,
  AlertCircle,
  X,
  Printer,
  QrCode,
  Copy,
  Shield
} from 'lucide-react';

// --- Configuration Instructions for Deployment ---
// This file supports environment-based config via Vite. Create a `.env.local`
// at the project root with the following variables (see .env.example):
// VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
// VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID
// If those variables are present, they'll be used at build time and embedded
// into the production bundle. This avoids committing secrets to source control.

const getFirebaseConfig = () => {
  const env = import.meta.env || {};
  if (env.VITE_FIREBASE_API_KEY) {
    return {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID
    };
  }

  // Fallback placeholders (intentionally invalid)
  return {
    apiKey: "REPLACE_WITH_YOUR_API_KEY",
    authDomain: "REPLACE_WITH_YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
    storageBucket: "REPLACE_WITH_YOUR_PROJECT_ID.firebasestorage.app",
    messagingSenderId: "REPLACE_WITH_YOUR_SENDER_ID",
    appId: "REPLACE_WITH_YOUR_APP_ID"
  };
};

const MY_FIREBASE_CONFIG = getFirebaseConfig();

// --- Firebase Initialization ---
let app, auth, db, appId;

try {
  // LOGIC: If running in the AI Canvas (here), use the hidden __firebase_config.
  // If running on your deployed site, use the MY_FIREBASE_CONFIG you filled in above.
  const configToUse = typeof __firebase_config !== 'undefined' 
    ? JSON.parse(__firebase_config) 
    : MY_FIREBASE_CONFIG;

  app = initializeApp(configToUse);
  auth = getAuth(app);
  db = getFirestore(app);
  
  // Use a fixed ID for production, or the dynamic one for Canvas
  appId = typeof __app_id !== 'undefined' ? __app_id : 'church-vote-production';
  
} catch (e) {
  console.error("Firebase Init Error:", e);
}

// --- Components ---

const LoadingScreen = ({ onRetry, error }) => {
  const [showRetry, setShowRetry] = useState(false);

  useEffect(() => {
    // If loading takes more than 3s, show manual retry controls
    const timer = setTimeout(() => setShowRetry(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col justify-center items-center min-h-screen bg-slate-50 p-6 text-center">
      {!error && (
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-6"></div>
      )}
      
      {error ? (
        <div className="bg-red-50 p-6 rounded-xl border border-red-100 max-w-sm">
            <WifiOff className="mx-auto text-red-500 mb-2" size={32} />
            <h3 className="text-red-800 font-bold mb-1">Connection Failed</h3>
            <p className="text-red-600 text-sm mb-4">{error}</p>
            <p className="text-xs text-red-400 mb-4 text-left font-mono bg-white p-2 rounded border border-red-100">
                {error.includes("REPLACE_WITH") 
                    ? "You haven't updated the config in App.jsx yet." 
                    : "Check console for details."}
            </p>
            <button 
                onClick={() => window.location.reload()}
                className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold text-sm w-full"
            >
                Reload App
            </button>
        </div>
      ) : (
        <>
            <h2 className="text-slate-800 font-bold text-lg mb-2">Connecting to Voting System...</h2>
            <p className="text-slate-500 text-sm mb-6 max-w-xs mx-auto">
                Verifying secure anonymous ID.
            </p>
            
            {showRetry && (
                <div className="animate-fade-in">
                    <p className="text-amber-600 text-xs mb-3 bg-amber-50 p-2 rounded flex items-center justify-center gap-1">
                        <AlertCircle size={12} /> Taking longer than usual
                    </p>
                    <button 
                        onClick={onRetry}
                        className="flex items-center gap-2 mx-auto px-4 py-2 bg-white border border-slate-300 shadow-sm rounded-lg text-slate-600 font-medium hover:bg-slate-50"
                    >
                        <RefreshCw size={16} /> Retry Connection
                    </button>
                </div>
            )}
        </>
      )}
    </div>
  );
};

// --- VOTER VIEW ---

const VoterView = ({ user }) => {
  const [accessCode, setAccessCode] = useState('');
  const [activePoll, setActivePoll] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasVoted, setHasVoted] = useState(false);
  const [selections, setSelections] = useState({});
  const [votesData, setVotesData] = useState([]);
  const [voterToken, setVoterToken] = useState(null);

  useEffect(() => {
    // 1. Check for URL Params (QR Code Scan)
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token');
    const pollIdParam = params.get('pollId');

    if (tokenParam && pollIdParam) {
      setVoterToken(tokenParam);
      // Auto-join if params exist
      fetchPollById(pollIdParam);
    }
  }, []);

  const fetchPollById = async (pollId) => {
      setLoading(true);
      try {
        const pollRef = doc(db, 'artifacts', appId, 'public', 'data', 'polls', pollId);
        const pollDoc = await getDoc(pollRef);
        
        if (pollDoc.exists()) {
             const data = pollDoc.data();
             if (!data.isActive) {
                 setError('This voting session has ended.');
                 setLoading(false);
                 return;
             }
             if (!Array.isArray(data.questions) || data.questions.length === 0) {
               setError('Poll data is invalid.');
               setLoading(false);
               return;
             }
             setActivePoll({ id: pollDoc.id, ...data, questions: data.questions });
        } else {
             setError('Poll not found.');
        }
      } catch (err) {
          console.error(err);
          setError('Could not load poll.');
      }
      setLoading(false);
  };

  useEffect(() => {
    if (!activePoll) return;

    // Listen to poll status changes
    const pollRef = doc(db, 'artifacts', appId, 'public', 'data', 'polls', activePoll.id);
    const unsubPoll = onSnapshot(pollRef, (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            if (!Array.isArray(data.questions) || data.questions.length === 0) {
              console.warn('Active poll missing structured questions, exiting:', doc.id);
              handleExit();
              return;
            }
            setActivePoll(prev => ({ ...prev, ...data, questions: data.questions, id: doc.id }));
        } else {
            handleExit();
        }
    });

    // Listen to votes
    const votesRef = collection(db, 'artifacts', appId, 'public', 'data', `poll_${activePoll.id}_votes`);
    const unsubVotes = onSnapshot(votesRef, (snapshot) => {
      const votes = snapshot.docs.map(d => d.data());
      setVotesData(votes);
      
      // IDENTITY LOGIC:
      // If we have a QR token, we use that as the identity.
      // If not, we use the Firebase Auth UID (device ID).
      const myIdentity = voterToken || user.uid;

      const myVote = votes.find(v => v.userId === myIdentity);
      if (myVote) {
        setHasVoted(true);
        if (myVote.selections) {
            setSelections(myVote.selections);
        } else if (typeof myVote.optionIndex !== 'undefined') {
            setSelections({ 0: myVote.optionIndex });
        }
      }
    }, (err) => {
        console.error("Vote Listener Error:", err);
    });

    return () => {
        unsubPoll();
        unsubVotes();
    };
  }, [activePoll?.id, user?.uid, voterToken]);

  const handleJoinSession = async (e) => {
    e.preventDefault();
    if (accessCode.length < 4) return;
    
    setLoading(true);
    setError('');

    try {
      const pollsRef = collection(db, 'artifacts', appId, 'public', 'data', 'polls');
      const q = query(pollsRef, where('accessCode', '==', accessCode.trim()), where('isActive', '==', true));
      
      const snapshot = await new Promise((resolve, reject) => {
         const unsubscribe = onSnapshot(q, (snap) => {
             unsubscribe();
             resolve(snap);
         }, (err) => reject(err));
      });

      if (snapshot.empty) {
        setError('Code not found or voting is closed.');
        setLoading(false);
        return;
      }

      const pollDoc = snapshot.docs[0];
      const data = pollDoc.data();
      if (!Array.isArray(data.questions) || data.questions.length === 0) {
        setError('Poll data is invalid.');
        setLoading(false);
        return;
      }

      setActivePoll({ id: pollDoc.id, ...data, questions: data.questions });
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError('Connection error. Check your internet.');
      setLoading(false);
    }
  };

  const toggleSelection = (qIndex, oIndex) => {
    if (hasVoted) return;
    setSelections(prev => ({
        ...prev,
        [qIndex]: oIndex
    }));
  };

  const handleSubmitBallot = async () => {
    if (hasVoted) return;
    
    if (Object.keys(selections).length < activePoll.questions.length) {
        alert("Please answer all questions before submitting.");
        return;
    }

    try {
      // Use Token as ID if present (ensures 1 vote per QR), else User UID
      const identityId = voterToken || user.uid;
      const voteRef = doc(db, 'artifacts', appId, 'public', 'data', `poll_${activePoll.id}_votes`, identityId);
      
      // Check if vote exists first to prevent overwrite
      const existingVote = await getDoc(voteRef);
      if (existingVote.exists()) {
          alert("This QR code/Voter ID has already been registered.");
          setHasVoted(true); // Update local state to show results
          return;
      }

      await setDoc(voteRef, {
        selections: selections,
        userId: identityId,
        votedAt: serverTimestamp(),
        method: voterToken ? 'qr' : 'manual'
      });
      setHasVoted(true);
    } catch (err) {
      console.error(err);
      alert('Could not submit vote. Check connection.');
    }
  };

  const handleExit = () => {
    // If using QR, we don't really want to "exit" because reload will just put them back in.
    // But we can clear state.
    if (voterToken) {
        // Clear params from URL without refresh to allow "exit"
        window.history.pushState({}, document.title, window.location.pathname);
        setVoterToken(null);
    }
    setActivePoll(null);
    setAccessCode('');
    setHasVoted(false);
    setSelections({});
    setVotesData([]);
  };

  // 1. Join Screen
  if (!activePoll) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-200 w-full max-w-md text-center">
          <div className="bg-blue-50 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="text-blue-600" size={24} />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Join Vote</h2>
          <p className="text-slate-500 mb-6 text-sm">Scan your QR code or enter the 4-digit code.</p>
          
          <form onSubmit={handleJoinSession}>
            <input
              type="text"
              pattern="\d*"
              inputMode="numeric"
              maxLength={4}
              placeholder="0000"
              className="text-center text-4xl font-mono tracking-[0.4em] w-full border-b-2 border-slate-200 focus:border-blue-600 outline-none py-4 mb-6 bg-transparent transition-colors placeholder:text-slate-200 text-slate-800 font-bold"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              autoFocus
            />
            
            {error && <div className="text-red-600 bg-red-50 p-2 rounded text-sm mb-4 font-medium flex items-center justify-center gap-1"><AlertCircle size={14}/> {error}</div>}
            
            <button
              disabled={loading || accessCode.length < 4}
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-blue-200 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
            >
              {loading ? 'Finding Session...' : <>Join Session <ArrowRight size={18} /></>}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 2. Voting Screen
  const totalVotes = votesData.length;
  const allQuestionsAnswered = activePoll.questions && Object.keys(selections).length === activePoll.questions.length;

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <button onClick={handleExit} className="text-slate-400 hover:text-slate-600 text-sm mb-4 flex items-center gap-1 font-medium">
        &larr; Exit
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-20">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex justify-between items-start mb-2">
             <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">Live Ballot</span>
             <div className="flex items-center gap-1 text-slate-500 text-xs font-medium bg-white px-2 py-1 rounded-full border border-slate-100">
                <Users size={12} />
                <span>{totalVotes} Present</span>
             </div>
          </div>
          {voterToken && (
             <div className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded mb-2 inline-block font-mono">
                Ticket: ...{voterToken.slice(-4)}
             </div>
          )}
          {hasVoted && (
             <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100 text-emerald-700 font-bold flex items-center gap-2 text-sm">
                <Check size={16} /> Ballot Submitted Successfully
             </div>
          )}
        </div>

        <div className="divide-y divide-slate-100">
          {activePoll.questions.map((q, qIndex) => (
            <div key={qIndex} className="p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex gap-2">
                    <span className="text-slate-300 select-none">{qIndex + 1}.</span> 
                    {q.question}
                </h3>
                <div className="space-y-3">
                    {q.options.map((option, oIndex) => {
                        const isSelected = selections[qIndex] === oIndex;

                        if (hasVoted) {
                             // Result View - No Tally
                             return (
                                <div key={oIndex} className={`w-full text-left p-3 rounded-xl border-2 flex justify-between items-center ${
                                    isSelected 
                                    ? 'border-blue-600 bg-blue-50' 
                                    : 'border-slate-100 bg-slate-50/50'
                                }`}>
                                    <span className={`font-bold ${isSelected ? 'text-blue-700' : 'text-slate-400'}`}>
                                      {option}
                                    </span>
                                    {isSelected && (
                                        <div className="flex items-center gap-2 text-blue-600 text-sm font-bold">
                                            <span>Selected</span>
                                            <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
                                                <Check size={14} className="text-white" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                             );
                        }

                        // Voting View
                        return (
                            <button
                                key={oIndex}
                                onClick={() => toggleSelection(qIndex, oIndex)}
                                className={`w-full text-left p-3 rounded-xl border-2 transition-all flex justify-between items-center group active:scale-[0.98] ${
                                    isSelected 
                                    ? 'border-blue-600 bg-blue-50' 
                                    : 'border-slate-100 hover:border-blue-300 hover:bg-slate-50'
                                }`}
                            >
                                <span className={`font-bold ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>{option}</span>
                                <div className={`w-6 h-6 rounded-full border flex items-center justify-center shadow-sm ${
                                    isSelected ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-200'
                                }`}>
                                    {isSelected && <Check size={14} className="text-white" />}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
          ))}
        </div>
        
        {!hasVoted && (
            <div className="p-6 bg-slate-50 border-t border-slate-200">
                <button
                    onClick={handleSubmitBallot}
                    disabled={!allQuestionsAnswered}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-200 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2 text-lg"
                >
                    {allQuestionsAnswered ? 'Submit Ballot' : `Answer All Questions (${Object.keys(selections).length}/{activePoll.questions.length})`} 
                    {allQuestionsAnswered && <ArrowRight size={20} />}
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

// --- LEADER VIEW ---

const LeaderView = () => {
  // Auth State for Leader
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [loginError, setLoginError] = useState('');

  const [questions, setQuestions] = useState([]); 
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [currentOptions, setCurrentOptions] = useState(['Yes', 'No', 'Abstain']);
  const [activePolls, setActivePolls] = useState([]);
  const [viewState, setViewState] = useState('list'); // 'list', 'create', 'print'
  
  // Print State
  const [printCount, setPrintCount] = useState(50);
  const [printPoll, setPrintPoll] = useState(null);
  const [generatedTokens, setGeneratedTokens] = useState([]);
  const [baseUrl, setBaseUrl] = useState('');

  useEffect(() => {
    // Default to current URL, but this might be the preview URL
    setBaseUrl(window.location.origin + window.location.pathname);

    const pollsRef = collection(db, 'artifacts', appId, 'public', 'data', 'polls');
    const q = query(pollsRef, orderBy('createdAt', 'desc'));
    
    const unsub = onSnapshot(q, (snapshot) => {
        const polls = snapshot.docs.map(doc => {
          const data = doc.data();
          if (!Array.isArray(data.questions) || data.questions.length === 0) {
            console.warn('Skipping poll without structured questions:', doc.id);
            return null;
          }
          return { id: doc.id, ...data };
        }).filter(Boolean);
        setActivePolls(polls);
    }, (err) => console.log("Leader Polls Error:", err));
    return () => unsub();
  }, []);

  const addCurrentQuestion = () => {
      if (!currentQuestion.trim()) return;
      const validOptions = currentOptions.filter(o => o.trim().length > 0);
      setQuestions([...questions, { question: currentQuestion, options: validOptions }]);
      setCurrentQuestion('');
      setCurrentOptions(['Yes', 'No', 'Abstain']);
  };

  const removeQuestion = (idx) => {
      setQuestions(questions.filter((_, i) => i !== idx));
  };

  const handleLaunch = async () => {
    let finalQuestions = [...questions];
    if (currentQuestion.trim()) {
        const validOptions = currentOptions.filter(o => o.trim().length > 0);
        finalQuestions.push({ question: currentQuestion, options: validOptions });
    }

    if (finalQuestions.length === 0) {
        alert("Please add at least one question.");
        return;
    }
    
    const code = Math.floor(1000 + Math.random() * 9000).toString();

    try {
      // Prefer server-side creation via Callable Cloud Function for security.
      try {
        const { getFunctions, httpsCallable } = await import('firebase/functions');
        const functions = getFunctions(app);
        const createPoll = httpsCallable(functions, 'createPoll');
        const result = await createPoll({
          pin: '1234', // leader PIN - replace with secure mechanism in production
          questions: finalQuestions,
          accessCode: code,
          appId: appId
        });
        if (result && result.data && result.data.id) {
          setQuestions([]);
          setCurrentQuestion('');
          setCurrentOptions(['Yes', 'No', 'Abstain']);
          setViewState('list');
          return;
        }
      } catch (fnErr) {
        // If functions aren't deployed or callable fails, fall back to client-side write (may be blocked by rules)
        console.warn('createPoll function failed, falling back to client write:', fnErr);
      }

      const pollsRef = collection(db, 'artifacts', appId, 'public', 'data', 'polls');
      await addDoc(pollsRef, {
        questions: finalQuestions,
        accessCode: code,
        isActive: true,
        createdAt: serverTimestamp()
      });

      setQuestions([]);
      setCurrentQuestion('');
      setCurrentOptions(['Yes', 'No', 'Abstain']);
      setViewState('list');
    } catch (err) {
      alert("Error creating vote: " + err.message);
    }
  };

  const createTestPoll = async () => {
    const sample = [{ question: 'Automated test poll?', options: ['Yes', 'No'] }];
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const functions = getFunctions(app);
      const createPoll = httpsCallable(functions, 'createPoll');
      const result = await createPoll({ pin: '1234', questions: sample, accessCode: code, appId });
      const id = result?.data?.id;
      const accessCode = result?.data?.accessCode || code;
      alert('Created test poll: ' + id + ' (code: ' + accessCode + ')');
      setViewState('list');
      return;
    } catch (fnErr) {
      console.warn('createPoll callable failed; falling back to client write', fnErr);
    }

    // Fallback: client-side write (may be blocked by rules)
    try {
      const pollsRef = collection(db, 'artifacts', appId, 'public', 'data', 'polls');
      const docRef = await addDoc(pollsRef, {
        questions: sample,
        accessCode: code,
        isActive: true,
        createdAt: serverTimestamp()
      });
      alert('Created test poll (client): ' + docRef.id + ' (code: ' + code + ')');
      setViewState('list');
    } catch (err) {
      alert('Failed to create test poll: ' + err.message);
    }
  };

  const generateQRs = () => {
     const tokens = [];
     for(let i=0; i<printCount; i++) {
         const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
         tokens.push(token);
     }
     setGeneratedTokens(tokens);
  };

  // Sub-component for individual poll in dashboard
  const DashboardPoll = ({ poll }) => {
    const [votes, setVotes] = useState([]);
    const [localActive, setLocalActive] = useState(poll.isActive);
    const [isToggling, setIsToggling] = useState(false);

    useEffect(() => {
      const vRef = collection(db, 'artifacts', appId, 'public', 'data', `poll_${poll.id}_votes`);
      const unsub = onSnapshot(vRef, snap => setVotes(snap.docs.map(d => d.data())), err => console.log(err));
      return () => unsub();
    }, [poll.id]);

    // Keep a local optimistic active-state so the UI doesn't flip when the
    // client attempts a fallback write that gets rejected by security rules.
    useEffect(() => {
      setLocalActive(poll.isActive);
    }, [poll.isActive]);

    const total = votes.length;
    const toggleActive = async () => {
      if (isToggling) return;
      setIsToggling(true);
      const target = !localActive;
      try {
        const { getFunctions, httpsCallable } = await import('firebase/functions');
        const functions = getFunctions(app);
        const toggle = httpsCallable(functions, 'togglePollActive');
        await toggle({ pin: '1234', appId, pollId: poll.id, isActive: target });
        // optimistic local update until snapshot refreshes
        setLocalActive(target);
      } catch (err) {
        console.warn('togglePollActive callable failed, falling back to client update:', err);
        try {
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'polls', poll.id), { isActive: target });
          setLocalActive(target);
        } catch (err2) {
          console.error('Failed to toggle poll active state:', err2);
          alert('Unable to toggle poll active state. Check console for details.');
        }
      } finally {
        setIsToggling(false);
      }
    };

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
            <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
                <div>
                    <div className="text-slate-400 text-[10px] uppercase font-bold mb-1">Access Code</div>
                    <div className="text-3xl font-mono font-bold text-yellow-400 tracking-wider">{poll.accessCode}</div>
                </div>
                <div className="text-right flex items-center gap-3">
                    <div>
                        <div className={`text-[10px] font-bold px-2 py-1 rounded uppercase inline-block mb-1 ${localActive ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                          {localActive ? 'Voting Open' : 'Closed'}
                        </div>
                        <div className="text-slate-400 text-xs">{total} votes</div>
                    </div>
                </div>
            </div>
            <div className="p-4 divide-y divide-slate-100">
                {poll.questions.map((q, qIndex) => (
                    <div key={qIndex} className="py-4 first:pt-0 last:pb-0">
                        <h3 className="font-bold text-slate-800 text-md mb-3 flex gap-2">
                             <span className="text-slate-300 text-sm">Q{qIndex+1}</span> {q.question}
                        </h3>
                        <div className="space-y-3">
                            {q.options.map((opt, idx) => {
                                const count = votes.filter(v => {
                                    if (v.selections) return v.selections[qIndex] === idx;
                                    if (qIndex === 0 && typeof v.optionIndex !== 'undefined') return v.optionIndex === idx; 
                                    return false;
                                }).length;
                                const pct = total === 0 ? 0 : Math.round((count/total)*100);
                                return (
                                    <div key={idx}>
                                        <div className="flex justify-between text-xs mb-1 font-medium text-slate-600">
                                            <span>{opt}</span>
                                            <span>{count}</span>
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                            <div className="bg-slate-600 h-full transition-all duration-500" style={{width: `${pct}%`}}></div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2">
                 <button 
                    onClick={() => {
                        setPrintPoll(poll);
                        setViewState('print');
                        setGeneratedTokens([]);
                    }}
                    className="flex-1 py-2 rounded-lg text-sm font-bold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2"
                >
                    <Printer size={16} /> Print QR Cards
                </button>
                <button onClick={toggleActive} disabled={isToggling} className={`flex-1 py-2 rounded-lg text-sm font-bold border ${localActive ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'} ${isToggling ? 'opacity-60 cursor-wait' : ''}`}>
                  {isToggling ? 'Updating…' : (localActive ? 'Stop' : 'Open')}
                </button>
            </div>
        </div>
    );
  };

  // -- AUTH CHECK --
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-sm w-full text-center">
          <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
            <Shield className="text-slate-500" size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Leader Access</h2>
          <p className="text-slate-500 text-sm mb-6">Enter the admin PIN to manage votes.</p>
          
          <form onSubmit={(e) => {
            e.preventDefault();
            // HARDCODED PIN - CHANGE THIS IF NEEDED
            if (pin === '1234') { 
                setIsAuthenticated(true);
                setLoginError('');
            } else {
                setLoginError('Incorrect PIN');
                setPin('');
            }
          }}>
            <input 
              type="password" 
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={e => setPin(e.target.value)}
              className="w-full border-2 border-slate-200 focus:border-slate-900 p-3 rounded-xl mb-4 text-center font-bold text-2xl tracking-widest outline-none transition-colors"
              placeholder="••••"
              autoFocus
            />
            {loginError && <p className="text-red-500 text-sm font-bold mb-4">{loginError}</p>}
            <button className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl transition-colors">
              Access Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  // PRINT VIEW
  if (viewState === 'print') {
      return (
          <div className="bg-white min-h-screen">
              <div className="p-4 border-b border-slate-200 flex justify-between items-center print:hidden">
                  <h2 className="font-bold text-xl">Generate QR Codes</h2>
                  <button onClick={() => setViewState('list')} className="text-slate-500 font-bold text-sm">Close</button>
              </div>
              
              <div className="p-6 max-w-4xl mx-auto">
                  <div className="print:hidden mb-8 bg-slate-50 p-6 rounded-xl border border-slate-200">
                      <h3 className="font-bold text-slate-800 mb-2">Configuration</h3>
                      <div className="mb-4">
                          <label className="block text-xs font-bold text-slate-500 mb-1">App URL (for QR Codes)</label>
                          <input 
                              type="text" 
                              value={baseUrl} 
                              onChange={e => setBaseUrl(e.target.value)}
                              className="border p-2 rounded-lg w-full font-mono text-sm"
                              placeholder="https://your-app-url.com"
                          />
                          <p className="text-[10px] text-slate-400 mt-1">
                            Important: Ensure this matches your deployed website URL exactly.
                          </p>
                      </div>
                      <div className="flex gap-4 items-end">
                          <div>
                              <label className="block text-xs font-bold text-slate-500 mb-1">Number of Cards</label>
                              <input 
                                  type="number" 
                                  value={printCount} 
                                  onChange={e => setPrintCount(Number(e.target.value))}
                                  className="border p-2 rounded-lg w-32 font-bold"
                              />
                          </div>
                          <button onClick={generateQRs} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold shadow hover:bg-blue-700">
                              Generate
                          </button>
                          {generatedTokens.length > 0 && (
                              <button onClick={() => window.print()} className="bg-slate-800 text-white px-6 py-2 rounded-lg font-bold shadow hover:bg-slate-900 flex items-center gap-2">
                                  <Printer size={16} /> Print Page
                              </button>
                          )}
                      </div>
                  </div>

                  {generatedTokens.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 print:grid-cols-3 print:gap-4">
                            {generatedTokens.map((token, idx) => {
                              // Use the customizable baseUrl
                              const url = `${baseUrl}?token=${token}&pollId=${printPoll.id}`;
                              
                              // Using qrserver API for generation to avoid bundling heavy libs
                              const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(url)}`;
                              
                              return (
                                <div key={idx} className="border-2 border-slate-900 rounded-xl p-4 flex flex-col items-center justify-center text-center bg-white aspect-[3/4] break-inside-avoid">
                                  <h3 className="font-bold text-lg mb-1 uppercase tracking-wider">Vote Card</h3>
                                  <p className="text-xs text-slate-500 mb-4">{new Date().toLocaleDateString()}</p>
                                      
                                  <img src={qrUrl} alt="Vote QR" className="w-32 h-32 mb-4" />
                                      
                                  <div className="text-[10px] font-mono text-slate-400 break-all mb-2 max-w-full leading-tight px-2">
                                    {token.slice(0, 12)}...
                                  </div>
                                      
                                  <p className="text-xs font-bold text-slate-900">Scan to Vote</p>
                                  <a href={url} target="_blank" rel="noreferrer" className="print:hidden text-[10px] text-blue-500 mt-2 hover:underline">Test Link</a>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                // CREATE VIEW
                if (viewState === 'create') {
                return (
                  <div className="max-w-md mx-auto p-4">
                    <h2 className="text-xl font-bold mb-4">New Ballot</h2>
                    {questions.length > 0 && (
                      <div className="mb-6 space-y-3">
                        {questions.map((q, idx) => (
                          <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center group">
                            <div>
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Question {idx + 1}</span>
                              <div className="font-bold text-slate-800">{q.question}</div>
                              <div className="text-xs text-slate-500 mt-1">{q.options.length} Options</div>
                            </div>
                            <button onClick={() => removeQuestion(idx)} className="text-slate-300 hover:text-red-500 p-2 text-sm font-bold">
                              <X size={18} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-blue-500">
                      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">
                        {questions.length > 0 ? 'Add Another Question' : 'Question 1'}
                      </h3>
                      <div className="mb-4">
                        <label className="block text-sm font-bold text-slate-700 mb-1">Question Text</label>
                        <input 
                          className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                          placeholder="e.g. Approve Budget?"
                          value={currentQuestion}
                          onChange={e => setCurrentQuestion(e.target.value)}
                        />
                      </div>
                      <div className="mb-6">
                        <label className="block text-sm font-bold text-slate-700 mb-1">Options</label>
                        {currentOptions.map((opt, idx) => (
                          <input 
                            key={idx}
                            className="w-full p-2 mb-2 border border-slate-300 rounded focus:border-blue-500 outline-none text-sm"
                            value={opt}
                            onChange={e => {
                              const newOpts = [...currentOptions];
                              newOpts[idx] = e.target.value;
                              setCurrentOptions(newOpts);
                            }}
                          />
                        ))}
                        <button onClick={() => setCurrentOptions([...currentOptions, ''])} className="text-blue-600 text-sm font-bold mt-1 inline-flex items-center gap-1">
                          <Plus size={14} /> Add Option
                        </button>
                      </div>
                      <button onClick={addCurrentQuestion} disabled={!currentQuestion} className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg mb-2 disabled:opacity-50">
                        Add Question to Ballot
                      </button>
                    </div>
                    <div className="flex gap-3 mt-6 pb-20">
                      <button onClick={() => setViewState('list')} className="flex-1 py-3 text-slate-600 font-bold bg-slate-100 rounded-xl">Cancel</button>
                      <button onClick={handleLaunch} disabled={questions.length === 0 && !currentQuestion} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg disabled:opacity-50">
                        Launch Ballot ({questions.length + (currentQuestion ? 1 : 0)})
                      </button>
                    </div>
                  </div>
                );
                }

                // DASHBOARD VIEW
                return (
                <div className="max-w-md mx-auto p-4 pb-24">
                  <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-slate-800">Leader Dashboard</h2>
                  <div className="flex items-center gap-3">
                  <button onClick={() => setViewState('create')} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-blue-700">
                    + New Ballot
                  </button>
                  <button onClick={createTestPoll} className="bg-slate-800 text-white px-3 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-slate-900">
                    Create Test Poll
                  </button>
                  </div>
                  </div>
                  {activePolls.length === 0 && (
                    <div className="text-center py-12 text-slate-400 bg-slate-100 rounded-xl border-2 border-dashed border-slate-200">
                      No active votes. Create one to start.
                    </div>
                  )}
                  {activePolls.map(poll => <DashboardPoll key={poll.id} poll={poll} />)}
                </div>
                );
              };

              // --- APP SHELL ---

              export default function App() {
                const [user, setUser] = useState(null);
                const [loading, setLoading] = useState(true);
                const [authError, setAuthError] = useState(null);
                const [mode, setMode] = useState('voter'); 

                useEffect(() => {
                let mounted = true;

                const initAuth = async () => {
                  try {
                  if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                     try {
                      await signInWithCustomToken(auth, __initial_auth_token);
                     } catch (tokenError) {
                      console.warn("Token failed, falling back to anon:", tokenError);
                      await signInAnonymously(auth);
                     }
                  } else {
                     await signInAnonymously(auth);
                  }
                  } catch (err) {
                  if (mounted) {
                    console.error("Auth Error:", err);
                    setAuthError(err.message || "Could not sign in.");
                  }
                  }
                };

                initAuth();
    
                const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
                  if (mounted) {
                    setUser(currentUser);
                    if (currentUser) setLoading(false);
                  }
                });

                return () => {
                  mounted = false;
                  unsubscribe();
                };
                }, []);

                const handleRetry = () => {
                 setAuthError(null);
                 setLoading(true);
                 window.location.reload();
                };

                if (loading || authError) return <LoadingScreen onRetry={handleRetry} error={authError} />;

                // Mode Logic: If URL has token, force voter mode initially (though usually user defaults to voter)
                // Actually, standard state is fine.

                return (
                <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
                  <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm print:hidden">
                  <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-2" onClick={() => setMode('voter')}>
                    <div className="bg-blue-600 text-white p-1 rounded">
                      <Check size={18} />
                    </div>
                    <h1 className="font-bold text-lg tracking-tight text-slate-800">ChurchVote</h1>
                    </div>
                  </div>
                  </header>

                  <main>
                  {mode === 'voter' ? <VoterView user={user} /> : <LeaderView />}
                  </main>

                  <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-2 z-30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] print:hidden">
                  <div className="max-w-md mx-auto flex justify-center gap-1 bg-slate-100 p-1 rounded-lg">
                    <button 
                      onClick={() => setMode('voter')}
                      className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${mode === 'voter' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Voter View
                    </button>
                    <button 
                      onClick={() => setMode('leader')}
                      className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${mode === 'leader' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Leader View
                    </button>
                  </div>
                  </div>
                </div>
                );
              }