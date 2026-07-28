import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, serverTimestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyCRLhAHtcKU54-utFf_LWUFD2cBO5_Cok4",
  authDomain:        "cinnabank.firebaseapp.com",
  projectId:         "cinnabank",
  storageBucket:     "cinnabank.firebasestorage.app",
  messagingSenderId: "162136260228",
  appId:             "1:162136260228:web:30bd93eca36945811c4cd1",
};

// Initialize Firebase safely
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

export class CinnaBank {
  /**
   * Initialize the Cinnabank SDK.
   * @param {object} [config] - Configuration settings
   * @param {string} [config.apiBaseUrl] - Custom API base URL (defaults to "https://cinnabank.vercel.app")
   */
  constructor(config = {}) {
    this.apiBaseUrl = config.apiBaseUrl || "https://cinnabank.vercel.app";
    this.user = null;
    this.userData = null;
    this.isNewUser = false;
  }

  /**
   * Listens to auth state changes and loads the corresponding Cinnabank user profile in real-time.
   * @param {function(user, userData)} callback - Called on auth or profile change with (user, userData)
   * @returns {function} Unsubscribe function to clean up listeners
   */
  onAuthStateChanged(callback) {
    let unsubscribeSnapshot = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (user) {
        this.user = user;
        // Listen to profile updates in real-time
        unsubscribeSnapshot = onSnapshot(doc(db, 'users', user.uid), (snap) => {
          if (snap.exists()) {
            this.userData = snap.data();
            callback(this.user, this.userData);
          } else {
            this.userData = null;
            callback(this.user, null);
          }
        }, (error) => {
          console.error("Cinnabank SDK: Error listening to user profile:", error);
        });
      } else {
        this.user = null;
        this.userData = null;
        callback(null, null);
      }
    });

    return () => {
      if (unsubscribeSnapshot) unsubscribeSnapshot();
      unsubscribeAuth();
    };
  }

  /**
   * Log in to an existing Cinnabank account.
   * @param {string} email 
   * @param {string} password 
   * @returns {Promise<{user, userData}>}
   */
  async login(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const snap = await getDoc(doc(db, 'users', cred.user.uid));
    if (!snap.exists()) {
      throw new Error("Account data not found in Cinnabank registry.");
    }
    this.user = cred.user;
    this.userData = snap.data();
    this.isNewUser = false;
    return { user: this.user, userData: this.userData };
  }

  /**
   * Create a new Cinnabank account and provision the ₱1,000 welcome balance.
   * @param {string} name 
   * @param {string} email 
   * @param {string} password 
   * @returns {Promise<{user, userData}>}
   */
  async signup(name, email, password) {
    // Validate display name compliance
    const nameRegex = /^[a-zA-Z]+(?: [a-zA-Z]+)?$/;
    if (!nameRegex.test(name)) {
      throw new Error('Name can only contain letters and a single space between words (e.g., "Woq Chan"). No numbers or special characters.');
    }

    const cred = await createUserWithEmailAndPassword(auth, email, password);

    // Generate random mock account & virtual card details
    const accountNumber = Math.floor(1000000000 + Math.random() * 9000000000).toString();
    const cardNumber = Array.from({ length: 4 }, () => Math.floor(1000 + Math.random() * 9000)).join('');
    const expYear    = new Date().getFullYear() + 3 + Math.floor(Math.random() * 3);
    const expMonth   = String(Math.floor(1 + Math.random() * 12)).padStart(2, '0');
    const cardExpiry = `${expMonth}/${String(expYear).slice(2)}`;
    const cardCVV    = String(Math.floor(100 + Math.random() * 900));

    const userData = {
      name, email,
      balance: 1000,
      accountNumber,
      cardNumber, cardExpiry, cardCVV,
      createdAt: serverTimestamp(),
      photoURL: '',
    };

    // Save profile doc and welcome transaction credit in parallel
    await Promise.all([
      setDoc(doc(db, 'users', cred.user.uid), userData),
      addDoc(collection(db, 'transactions'), {
        userId: cred.user.uid,
        type: 'credit',
        amount: 1000,
        note: 'Welcome bonus',
        counterparty: 'Cinnabank',
        source: 'welcome',
        balanceAfter: 1000,
        createdAt: serverTimestamp(),
      }),
    ]);

    this.user = cred.user;
    this.userData = userData;
    this.isNewUser = true;
    return { user: this.user, userData: this.userData };
  }

  /**
   * Process a payment (transfer) to a merchant account.
   * @param {string} receiverUid - Merchant's Cinnabank UID
   * @param {number} amount - Payment amount
   * @param {string} note - Payment note/description
   * @param {object} [options] - Optional parameters for payment requests and links
   * @param {string} [options.chatId] - ID of the chat if resolving a payment request
   * @param {string} [options.requestId] - ID of the message request in the chat
   * @param {string} [options.linkId] - ID of the payment link/QR code
   * @returns {Promise<object>} Response details from Cinnabank serverless function
   */
  async processPayment(receiverUid, amount, note, options = {}) {
    if (!this.user || !this.userData) {
      throw new Error("No user authenticated.");
    }

    const balance = this.userData.balance || 0;
    if (balance < amount) {
      throw new Error(`Insufficient balance. Your account has ₱${balance.toFixed(2)}.`);
    }

    const token = await this.user.getIdToken();
    const payload = {
      receiverUid,
      amount,
      note,
      ...options
    };

    const response = await fetch(`${this.apiBaseUrl}/api/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Payment failed');
    }

    // Deduct locally on success to keep client states updated optimistically
    this.userData.balance -= amount;

    return result;
  }

  /**
   * Helper to perform secure loan transactions.
   * @private
   */
  async _handleLoan(action, amount) {
    if (!this.user || !this.userData) {
      throw new Error("No user authenticated.");
    }

    const token = await this.user.getIdToken();
    const response = await fetch(`${this.apiBaseUrl}/api/loan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ action, amount })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Loan transaction failed');
    }

    return result;
  }

  /**
   * Take out a Cinnabank loan with a 30% interest rate and a 10-minute deadline.
   * @param {number} amount - Loan principal (between ₱500 and ₱50,000)
   * @returns {Promise<object>} Response details from Cinnabank serverless function
   */
  async takeLoan(amount) {
    return this._handleLoan('take', amount);
  }

  /**
   * Repay an active Cinnabank loan.
   * @param {number} amount - Repayment amount
   * @returns {Promise<object>} Response details from Cinnabank serverless function
   */
  async payLoan(amount) {
    return this._handleLoan('pay', amount);
  }

  /**
   * Play a casino game using Cinnabank funds.
   * @param {string} game - Game name: 'slots', 'coin', 'dice', or 'roulette'
   * @param {number} bet - Bet amount
   * @param {string} [choice] - Choice parameters for the game ('heads'/'tails' for coin, etc.)
   * @returns {Promise<object>} Game response details including winnings and new balance
   */
  async playGame(game, bet, choice) {
    if (!this.user || !this.userData) {
      throw new Error("No user authenticated.");
    }

    const token = await this.user.getIdToken();
    const response = await fetch(`${this.apiBaseUrl}/api/play`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ game, bet, choice })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Game failed');
    }

    return result;
  }

  /**
   * Purchase a custom card skin from the Cinnabank catalog.
   * @param {string} skinId - ID of the skin to purchase (e.g., 'ba-arona')
   * @returns {Promise<object>} Purchase response details
   */
  async purchaseSkin(skinId) {
    if (!this.user || !this.userData) {
      throw new Error("No user authenticated.");
    }

    const token = await this.user.getIdToken();
    const response = await fetch(`${this.apiBaseUrl}/api/store`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ skinId })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Purchase failed');
    }

    return result;
  }

  /**
   * Log out the current user session.
   */
  async logout() {
    await signOut(auth);
    this.user = null;
    this.userData = null;
    this.isNewUser = false;
  }
}
