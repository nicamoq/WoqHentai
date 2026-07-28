# Cinnabank client-side SDK Documentation

The Cinnabank client-side SDK simplifies the integration of the Cinnabank economy (login, signup, provisioning introductory funds, and processing payments/transfers) into merchant or mock websites. 

Instead of writing raw Firebase configuration, importing separate auth and firestore modules, and manually generating card details or accounting logs, you can import this utility to handle the entire Cinnabank integration with a few function calls.

---

## 🚀 Getting Started

### 1. Import and Initialize

The SDK is written as an ES module. You can import the `CinnaBank` class directly from the root `cinnabank-sdk.js` file:

```javascript
import { CinnaBank } from '/cinnabank-sdk.js'; // Use appropriate relative path (e.g. '../../cinnabank-sdk.js' in subfolders)

// Default initialization (points to production API)
const cinnabank = new CinnaBank();

// Local development initialization (points to local dev backend)
// const cinnabank = new CinnaBank({ apiBaseUrl: 'http://localhost:3000' });
```

---

## 🔑 Core API Methods

### `cinnabank.onAuthStateChanged(callback)`
Listens for changes to the user's authentication state and subscribes to their corresponding Cinnabank profile document in Cloud Firestore in real-time. If the profile's balance or fields change on the database, this callback will fire automatically with the updated data.
* **Arguments:** 
  - `callback(user, userData)`: A function that runs whenever the auth state changes or database profile changes.
    - `user`: The Firebase Auth user object (or `null` if logged out).
    - `userData`: The Cinnabank user document data (balance, account name, account number, card numbers) from Firestore (or `null` if logged out).
* **Returns:** `unsubscribe` function to clean up the listeners.

### `cinnabank.login(email, password)`
Authenticates an existing Cinnabank user using their credentials.
* **Arguments:** `email` (string), `password` (string).
* **Returns:** `Promise<{ user, userData }>`
* **Throws:** An error if the credentials are invalid or if account database records do not exist.

### `cinnabank.signup(name, email, password)`
Creates a new Cinnabank user, automatically assigns a 10-digit account number, constructs a mock 16-digit debit card with expiry/CVV, writes the user document to Firestore, and registers a `₱1,000` welcome credit transaction.
* **Arguments:** `name` (string, must fit `/^[a-zA-Z]+(?: [a-zA-Z]+)?$/`), `email` (string), `password` (string).
* **Returns:** `Promise<{ user, userData }>`
* **Throws:** An error if the display name fails validation, or if the email is already in use.

### `cinnabank.processPayment(receiverUid, amount, note, options)`
Invokes the Cinnabank serverless backend `/api/transfer` to execute an atomic, double-spend resistant transfer.
* **Arguments:** 
  - `receiverUid` (string): The Cinnabank user UID of the merchant/recipient.
  - `amount` (number): The payment amount in Pesos (₱).
  - `note` (string): Transaction description (e.g. `"Dispensed: 🧸 Toy Plushie"`).
  - `options` (object, optional): Optional parameters:
    - `chatId` (string): The ID of the chat if resolving a payment request.
    - `requestId` (string): The ID of the message request in the chat.
    - `linkId` (string): The ID of the payment link/QR code.
* **Returns:** `Promise<object>` (The JSON response from the serverless API)
* **Throws:** An error if there are insufficient funds or if the API call fails.
* **Side-effects:** Deducts the paid amount from `cinnabank.userData.balance` locally upon success.

### `cinnabank.takeLoan(amount)`
Takes out a Cinnabank loan with a 30% interest rate and a 10-minute repayment deadline.
* **Arguments:** `amount` (number): The loan principal (must be between ₱500 and ₱50,000).
* **Returns:** `Promise<object>` (The JSON response from the serverless API)

### `cinnabank.payLoan(amount)`
Repays a portion or all of an active Cinnabank loan.
* **Arguments:** `amount` (number): The repayment amount.
* **Returns:** `Promise<object>` (The JSON response from the serverless API)

### `cinnabank.playGame(game, bet, choice)`
Plays a secure, server-authoritative casino game using Cinnabank funds.
* **Arguments:**
  - `game` (string): The game name (`'slots'`, `'coin'`, `'dice'`, or `'roulette'`).
  - `bet` (number): The amount of money to bet.
  - `choice` (string, optional): The choice parameter:
    - For `'coin'`: `'heads'` or `'tails'`.
    - For `'dice'`: `'higher'`, `'lower'`, or `'equal'`.
    - For `'roulette'`: `'red'`, `'black'`, `'green'`, `'even'`, `'odd'`, etc.
* **Returns:** `Promise<object>` (The JSON response containing game results, multiplier, winnings, garnished loan repayment amounts, and `newBalance`).

### `cinnabank.purchaseSkin(skinId)`
Purchases a card cosmetic skin from the Cinnabank Store catalog (applies 12% VAT and 1% service fee automatically).
* **Arguments:** `skinId` (string): The ID of the skin to buy (e.g. `'ba-arona'`, `'midnight-spice'`).
* **Returns:** `Promise<object>` (The JSON response from the serverless API)

### `cinnabank.logout()`
Signs out the current session and clears cached SDK states.
* **Returns:** `Promise<void>`

---

## 💡 SDK State Properties
You can read the current state directly from the SDK instance at any time:
* `cinnabank.user`: Current Firebase user object (or `null`).
* `cinnabank.userData`: Current Firestore database document (or `null`).
* `cinnabank.isNewUser`: `true` if the user was newly created in this session, `false` otherwise (useful for displaying welcome banners).

---

## 📝 Complete Integration Example

Below is a complete, minimal example showing how a merchant site wires up the Cinnabank SDK.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Fillet Fish Shop</title>
</head>
<body>
  <h1>Order Fillet Fish (₱150.00)</h1>

  <!-- Auth UI -->
  <div id="auth-panel">
    <h3>Sign in to Pay</h3>
    <input type="email" id="email" placeholder="you@example.com"><br>
    <input type="password" id="password" placeholder="••••••••"><br>
    <button id="login-btn">Login &amp; Pay</button>
    <button id="signup-btn">Create Cinnabank Account &amp; Pay</button>
  </div>

  <!-- Confirm Payment UI -->
  <div id="payment-panel" style="display:none;">
    <p>Logged in as: <strong id="user-name"></strong></p>
    <p>Balance: <strong id="user-balance"></strong></p>
    <button id="pay-btn">Confirm Payment (₱150.00)</button>
    <button id="logout-btn">Log out</button>
  </div>

  <div id="status-msg" style="color: red;"></div>

  <script type="module">
    import { CinnaBank } from '../../cinnabank-sdk.js';

    const cinnabank = new CinnaBank();
    const MERCHANT_UID = "iBEn6h3QCDRBTZdUhR8LxPWl1vM2"; // Replace with your actual merchant UID
    const FISH_PRICE = 150;

    // 1. Sync authentication and user data
    cinnabank.onAuthStateChanged((user, userData) => {
      if (user && userData) {
        document.getElementById('auth-panel').style.display = 'none';
        document.getElementById('payment-panel').style.display = 'block';
        document.getElementById('user-name').textContent = userData.name;
        document.getElementById('user-balance').textContent = `₱${userData.balance.toFixed(2)}`;
      } else {
        document.getElementById('auth-panel').style.display = 'block';
        document.getElementById('payment-panel').style.display = 'none';
      }
    });

    // 2. Handle Login
    document.getElementById('login-btn').addEventListener('click', async () => {
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      try {
        await cinnabank.login(email, password);
      } catch (err) {
        showError(err.message);
      }
    });

    // 3. Handle Signup
    document.getElementById('signup-btn').addEventListener('click', async () => {
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const name = prompt("Enter your full name for Cinnabank registration:");
      try {
        await cinnabank.signup(name, email, password);
      } catch (err) {
        showError(err.message);
      }
    });

    // 4. Handle Confirm Payment
    document.getElementById('pay-btn').addEventListener('click', async () => {
      const btn = document.getElementById('pay-btn');
      btn.disabled = true;
      try {
        await cinnabank.processPayment(
          MERCHANT_UID,
          FISH_PRICE,
          "Purchase: 1x Fillet Fish Meal"
        );
        alert(`Payment successful! ${cinnabank.isNewUser ? 'Welcome bonus applied!' : ''}`);
      } catch (err) {
        showError(err.message);
      } finally {
        btn.disabled = false;
      }
    });

    // 5. Handle Logout
    document.getElementById('logout-btn').addEventListener('click', () => cinnabank.logout());

    function showError(msg) {
      document.getElementById('status-msg').textContent = msg;
    }
  </script>
</body>
</html>
```
