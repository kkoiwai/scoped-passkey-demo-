// -------------------------------------------------------------
// Base64URL and ArrayBuffer Conversion Helpers
// -------------------------------------------------------------
function base64UrlToBuffer(base64url) {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) buffer[i] = rawData.charCodeAt(i);
  return buffer.buffer;
}

function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// -------------------------------------------------------------
// Language Detection & i18n Dictionary
// -------------------------------------------------------------
const userLang = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
const isJa = userLang.startsWith('ja');

const i18n = {
  ja: {
    pageTitle: 'Scoped Passkey Demo Bank',
    bankName: 'Scoped Demo Bank',
    logout: 'ログアウト',
    authTitle: '口座開設 & ログイン',
    authSubtitle: 'パスキーによる生体認証・セキュリティキー認証',
    tabLogin: 'ログイン',
    tabSignup: '新規口座開設',
    loginAlert: '💡 作成済みの任意のパスキー（マスター・閲覧専用・金額限定）でログインできます。',
    ephemeralAlert: '⚠️ <strong>PoCデモ環境の注意点:</strong> 本サービスは検証用のインメモリデータストアで動作しているため、アクセスが途切れて約5分経過するとサーバーのアイドル停止によりデータ（登録パスキー・残高）が自動消去されます。ログインできない場合は「新規口座開設」をお試しください。',
    btnLoginPasskey: '🔑 パスキーでログイン',
    signupAlert: '🎉 新規登録すると初期残高 <strong>¥100,000</strong> が付与され、最初の<strong>フル権限マスターパスキー</strong>が作成されます。',
    labelSignupUsername: 'メールアドレス / ユーザー名',
    labelSignupDisplayName: 'お名前 (表示名)',
    btnSignupPasskey: '✨ パスキーを作成して口座開設 (¥100,000 付与)',
    balanceTitleLabel: '普通預金 残高',
    authDevicePrefix: '🔑 認証デバイス: ',
    tabTransfer: '💸 お振込み (送金)',
    tabPasskeys: '🔑 パスキー管理',
    tabHistory: '📜 取引履歴',
    transferCardTitle: '💸 お振込み (送金)',
    labelTransferRecipient: '振込先口座・名義',
    placeholderTransferRecipient: 'ボブ (受取人口座)',
    labelTransferAmount: '送金金額 (円)',
    labelTransferDesc: '摘要 (任意)',
    placeholderTransferDesc: 'お振込み',
    btnSubmitTransfer: '💸 送金を実行する',
    passkeyListTitle: '🔑 登録済みパスキー一覧',
    btnOpenAddPasskey: '➕ パスキー追加',
    addPasskeyScopeNotice: '⚠️ パスキーの追加設定は<strong>フル権限パスキー</strong>でログイン時のみ可能です。',
    historyCardTitle: '📜 取引履歴 (明細一覧)',
    historyCardBadge: '全権限で閲覧可能',
    modalPasskeyTitle: '🔑 新しいパスキーの追加設定',
    modalPasskeyDesc: '用途に合わせてこのパスキーに付与する<strong>権限スコープ</strong>を選択してください。',
    labelNewPasskeyName: 'パスキーの表示名 (端末名など)',
    placeholderNewPasskeyName: '例: 会社のPC (閲覧用)',
    valueNewPasskeyName: 'サブ端末パスキー',
    labelModalScope: '権限スコープ (Scope)',
    modalScopeFullTitle: '🟢 フル権限 (Full Access)',
    modalScopeFullDesc: '無制限の送金、履歴閲覧、新しいパスキー追加などすべての操作が可能です。',
    modalScopeRoTitle: '🔵 取引履歴の閲覧のみ (Read Only)',
    modalScopeRoDesc: '残高・取引明細の確認のみ可能。送金やパスキー追加はブロックされます。',
    modalScopeLimTitle: '🟡 金額限定送金 (Limited Transfer)',
    modalScopeLimDesc: '設定した上限金額までの送金が可能。上限超えの送金やパスキー追加は不可。',
    labelModalTransferLimit: '1回あたりの送金上限額 (円):',
    btnCreateScopedPasskey: '🛡️ この権限でパスキーを発行・登録',

    // Dynamic strings
    scopeFullTitle: 'フル権限 (Full Access)',
    scopeFullDesc: 'すべての送金、取引履歴閲覧、新しいパスキー追加・管理が許可されています。',
    transferNoLimitHint: '※ 残高の範囲内でいくらでも送金可能です。',

    scopeRoTitle: '閲覧専用 (Read Only)',
    scopeRoDesc: '取引履歴と残高の閲覧のみ許可されています（送金およびパスキー追加設定はできません）。',
    transferRoBtn: '🔒 閲覧専用パスキーのため送金不可',
    transferRoWarning: '🔒 現在のパスキーは「閲覧専用」です。送金ボタンはロックされています。',

    scopeLimTitle: (limit) => `金額限定送金 (上限: ¥${limit.toLocaleString()})`,
    scopeLimDesc: (limit) => `1回あたり ¥${limit.toLocaleString()} までの送金が許可されています（パスキー追加設定はできません）。`,
    transferLimBtn: (limit) => `💸 送金を実行する (上限 ¥${limit.toLocaleString()})`,
    transferLimHint: (limit) => `※ 送金上限額は 1回あたり ¥${limit.toLocaleString()} です。`,

    noTxHistory: '取引履歴はありません。',
    txRecipientPrefix: '相手先: ',
    noPasskeys: '登録済みパスキーはありません。',
    deleteBtn: '削除',
    confirmDelete: 'このパスキーを削除しますか？',
    passkeyDeleted: 'パスキーを削除しました。',
    deleteFailed: '削除に失敗しました。',
    enterUsername: 'ユーザー名を入力してください。',
    fetchingRegisterOptions: 'パスキー生成オプションを取得中...',
    promptRegisterBiometric: 'デバイスの画面ロック / 生体認証でパスキーを作成してください...',
    verifyingRegistration: 'サーバーでパスキーと口座開設を検証中...',
    accountCreatedSuccess: '口座開設とマスターパスキーの発行が完了しました！',
    masterPasskeyName: 'マスターパスキー (初期作成)',
    fetchingLoginOptions: 'パスキー認証オプションを取得中...',
    promptLoginBiometric: 'パスキーで生体認証 / 画面ロックを解除してください...',
    verifyingLogin: 'パスキーと権限スコープを検証中...',
    signalRemovedNotice: '⚠️ サーバー上に存在しないパスキーのため、Signal API により端末のパスキーマネージャーから削除シグナルを送信しました。',
    passkeyUnregistered: 'このパスキーはサーバー上に登録されていません。',
    loginSuccess: (scope) => `ログイン成功！権限スコープ: ${scope}`,
    loginFailed: 'ログイン検証に失敗しました。',
    loggedOut: 'ログアウトしました。',
    enterValidAmount: '有効な金額を入力してください。',
    processingTransfer: '送金処理を実行中...',
    transferSuccess: (amount) => `¥${amount.toLocaleString()} の送金が完了しました！`,
    transferFailed: '送金に失敗しました。',
    fetchingAddOptions: 'パスキー追加オプションを取得中...',
    promptAddBiometric: '新しいパスキーをデバイスに登録してください...',
    savingScopedPasskey: '権限スコープを付与して保存中...',
    passkeyAddedSuccess: (name, scope) => `パスキー「${name}」(${scope}) を登録しました！`,
    additionalPasskeyDefault: '追加パスキー'
  },
  en: {
    pageTitle: 'Scoped Passkey Demo Bank',
    bankName: 'Scoped Demo Bank',
    logout: 'Log Out',
    authTitle: 'Open Account & Sign In',
    authSubtitle: 'Biometric & Security Key Authentication via Passkeys',
    tabLogin: 'Sign In',
    tabSignup: 'Open Account',
    loginAlert: '💡 You can sign in with any registered passkey (Master, Read-Only, or Limited Transfer).',
    ephemeralAlert: '⚠️ <strong>PoC Demo Environment Note:</strong> This service runs on an in-memory data store. After ~5 minutes of inactivity, stored data (passkeys, balance) is automatically reset on serverless cold start. If you cannot sign in, please create a new account via "Open Account".',
    btnLoginPasskey: '🔑 Sign In with Passkey',
    signupAlert: '🎉 New accounts receive an initial bonus balance of <strong>¥100,000</strong> and a <strong>Full Access Master Passkey</strong>.',
    labelSignupUsername: 'Email / Username',
    labelSignupDisplayName: 'Full Name (Display Name)',
    btnSignupPasskey: '✨ Create Passkey & Open Account (¥100,000 Bonus)',
    balanceTitleLabel: 'Savings Balance',
    authDevicePrefix: '🔑 Authenticated Device: ',
    tabTransfer: '💸 Transfer Funds',
    tabPasskeys: '🔑 Passkey Management',
    tabHistory: '📜 Transactions',
    transferCardTitle: '💸 Transfer Funds',
    labelTransferRecipient: 'Recipient Account / Name',
    placeholderTransferRecipient: 'Bob (Recipient Account)',
    labelTransferAmount: 'Transfer Amount (JPY)',
    labelTransferDesc: 'Description (Optional)',
    placeholderTransferDesc: 'Bank Transfer',
    btnSubmitTransfer: '💸 Send Transfer',
    passkeyListTitle: '🔑 Registered Passkeys',
    btnOpenAddPasskey: '➕ Add Passkey',
    addPasskeyScopeNotice: '⚠️ Adding new passkeys requires signing in with a <strong>Full Access Master Passkey</strong>.',
    historyCardTitle: '📜 Transaction History',
    historyCardBadge: 'Viewable by all scopes',
    modalPasskeyTitle: '🔑 Add New Scoped Passkey',
    modalPasskeyDesc: 'Select the <strong>permission scope</strong> to grant to this passkey based on your intended use case.',
    labelNewPasskeyName: 'Passkey Device Name',
    placeholderNewPasskeyName: 'e.g. Work PC (Read Only)',
    valueNewPasskeyName: 'Secondary Device Passkey',
    labelModalScope: 'Permission Scope',
    modalScopeFullTitle: '🟢 Full Access',
    modalScopeFullDesc: 'Unlimited transfers, transaction history access, and passkey management permissions.',
    modalScopeRoTitle: '🔵 Read-Only Access',
    modalScopeRoDesc: 'View balance and transactions only. Money transfers and passkey provisioning are blocked.',
    modalScopeLimTitle: '🟡 Limited Transfer Access',
    modalScopeLimDesc: 'Allows transfers up to the configured per-transaction limit. Over-limit transfers and passkey provisioning are blocked.',
    labelModalTransferLimit: 'Per-Transaction Transfer Limit (JPY):',
    btnCreateScopedPasskey: '🛡️ Issue & Register Passkey with this Scope',

    // Dynamic strings
    scopeFullTitle: 'Full Access',
    scopeFullDesc: 'Unlimited transfers, transaction history access, and passkey management permissions are granted.',
    transferNoLimitHint: '※ Transfers are allowed up to your available balance.',

    scopeRoTitle: 'Read Only',
    scopeRoDesc: 'Only balance and transaction history viewing are permitted. Transfers and passkey management are restricted.',
    transferRoBtn: '🔒 Transfer Disabled (Read-Only Passkey)',
    transferRoWarning: '🔒 The active passkey is "Read-Only". Transfer button is locked.',

    scopeLimTitle: (limit) => `Limited Transfer (Max ¥${limit.toLocaleString()})`,
    scopeLimDesc: (limit) => `Transfers are permitted up to ¥${limit.toLocaleString()} per transaction (Passkey management disabled).`,
    transferLimBtn: (limit) => `💸 Send Transfer (Max ¥${limit.toLocaleString()})`,
    transferLimHint: (limit) => `※ Transfer limit is ¥${limit.toLocaleString()} per transaction.`,

    noTxHistory: 'No transaction history found.',
    txRecipientPrefix: 'Recipient: ',
    noPasskeys: 'No registered passkeys found.',
    deleteBtn: 'Delete',
    confirmDelete: 'Are you sure you want to delete this passkey?',
    passkeyDeleted: 'Passkey deleted successfully.',
    deleteFailed: 'Failed to delete passkey.',
    enterUsername: 'Please enter a username.',
    fetchingRegisterOptions: 'Fetching passkey registration options...',
    promptRegisterBiometric: 'Please verify biometric or device lock to create passkey...',
    verifyingRegistration: 'Verifying passkey registration on server...',
    accountCreatedSuccess: 'Account opened and Master Passkey issued successfully!',
    masterPasskeyName: 'Master Passkey (Initial)',
    fetchingLoginOptions: 'Fetching passkey authentication options...',
    promptLoginBiometric: 'Please verify biometric or device lock to authenticate...',
    verifyingLogin: 'Verifying passkey and permission scope...',
    signalRemovedNotice: '⚠️ Passkey not found on server. Sent Signal API request to remove it from your device manager.',
    passkeyUnregistered: 'This passkey is not registered on the server.',
    loginSuccess: (scope) => `Sign-in successful! Scope: ${scope}`,
    loginFailed: 'Sign-in verification failed.',
    loggedOut: 'Logged out successfully.',
    enterValidAmount: 'Please enter a valid amount.',
    processingTransfer: 'Processing bank transfer...',
    transferSuccess: (amount) => `Transfer of ¥${amount.toLocaleString()} completed successfully!`,
    transferFailed: 'Transfer failed.',
    fetchingAddOptions: 'Fetching passkey creation options...',
    promptAddBiometric: 'Please register new passkey on your device...',
    savingScopedPasskey: 'Saving passkey with selected scope...',
    passkeyAddedSuccess: (name, scope) => `Registered passkey "${name}" (${scope}) successfully!`,
    additionalPasskeyDefault: 'Additional Passkey'
  }
};

const t = isJa ? i18n.ja : i18n.en;

// -------------------------------------------------------------
// Initialize Static DOM Texts
// -------------------------------------------------------------
function applyStaticTranslations() {
  document.title = t.pageTitle;
  document.getElementById('nav-bank-name').textContent = t.bankName;
  document.getElementById('btn-logout').textContent = t.logout;
  document.getElementById('auth-title').textContent = t.authTitle;
  document.getElementById('auth-subtitle').textContent = t.authSubtitle;
  document.getElementById('tab-login').textContent = t.tabLogin;
  document.getElementById('tab-signup').textContent = t.tabSignup;
  document.getElementById('login-alert-info').innerHTML = t.loginAlert;
  document.getElementById('ephemeral-alert-info').innerHTML = t.ephemeralAlert;
  document.getElementById('btn-login-passkey').textContent = t.btnLoginPasskey;
  document.getElementById('signup-alert-info').innerHTML = t.signupAlert;
  document.getElementById('label-signup-username').textContent = t.labelSignupUsername;
  document.getElementById('label-signup-displayname').textContent = t.labelSignupDisplayName;
  document.getElementById('btn-signup-passkey').textContent = t.btnSignupPasskey;
  document.getElementById('balance-title-label').textContent = t.balanceTitleLabel;
  document.getElementById('auth-device-prefix').textContent = t.authDevicePrefix;
  document.getElementById('btn-tab-transfer').textContent = t.tabTransfer;
  document.getElementById('btn-tab-passkeys').textContent = t.tabPasskeys;
  document.getElementById('btn-tab-history').textContent = t.tabHistory;
  document.getElementById('transfer-card-title').textContent = t.transferCardTitle;
  document.getElementById('label-transfer-recipient').textContent = t.labelTransferRecipient;
  document.getElementById('transfer-recipient').placeholder = t.placeholderTransferRecipient;
  document.getElementById('transfer-recipient').value = t.placeholderTransferRecipient;
  document.getElementById('label-transfer-amount').textContent = t.labelTransferAmount;
  document.getElementById('label-transfer-desc').textContent = t.labelTransferDesc;
  document.getElementById('transfer-desc').placeholder = t.placeholderTransferDesc;
  document.getElementById('transfer-desc').value = t.placeholderTransferDesc;
  document.getElementById('btn-submit-transfer').textContent = t.btnSubmitTransfer;
  document.getElementById('passkey-list-title').textContent = t.passkeyListTitle;
  document.getElementById('btn-open-add-passkey').textContent = t.btnOpenAddPasskey;
  document.getElementById('add-passkey-scope-notice').innerHTML = t.addPasskeyScopeNotice;
  document.getElementById('history-card-title').textContent = t.historyCardTitle;
  document.getElementById('history-card-badge').textContent = t.historyCardBadge;
  document.getElementById('modal-passkey-title').textContent = t.modalPasskeyTitle;
  document.getElementById('modal-passkey-desc').innerHTML = t.modalPasskeyDesc;
  document.getElementById('label-new-passkey-name').textContent = t.labelNewPasskeyName;
  document.getElementById('new-passkey-name').placeholder = t.placeholderNewPasskeyName;
  document.getElementById('new-passkey-name').value = t.valueNewPasskeyName;
  document.getElementById('label-modal-scope').textContent = t.labelModalScope;
  document.getElementById('modal-scope-full-title').textContent = t.modalScopeFullTitle;
  document.getElementById('modal-scope-full-desc').textContent = t.modalScopeFullDesc;
  document.getElementById('modal-scope-ro-title').textContent = t.modalScopeRoTitle;
  document.getElementById('modal-scope-ro-desc').textContent = t.modalScopeRoDesc;
  document.getElementById('modal-scope-lim-title').textContent = t.modalScopeLimTitle;
  document.getElementById('modal-scope-lim-desc').textContent = t.modalScopeLimDesc;
  document.getElementById('label-modal-transfer-limit').textContent = t.labelModalTransferLimit;
  document.getElementById('btn-create-scoped-passkey').textContent = t.btnCreateScopedPasskey;
}

// -------------------------------------------------------------
// DOM Elements
// -------------------------------------------------------------
const authSection = document.getElementById('auth-section');
const dashboardSection = document.getElementById('dashboard-section');
const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const loginContainer = document.getElementById('login-form-container');
const signupContainer = document.getElementById('signup-form-container');
const globalAlert = document.getElementById('global-alert');
const userHeaderInfo = document.getElementById('user-header-info');
const userDisplayName = document.getElementById('user-display-name');
const btnLogout = document.getElementById('btn-logout');

// Dashboard Elements
const userBalanceEl = document.getElementById('user-balance');
const activePasskeyNameEl = document.getElementById('active-passkey-name');
const scopeBannerBadge = document.getElementById('scope-banner-badge');
const scopeBannerDesc = document.getElementById('scope-banner-desc');
const scopeStatusBanner = document.getElementById('scope-status-banner');
const scopeBannerIcon = document.getElementById('scope-banner-icon');

// Transfer Form
const transferForm = document.getElementById('transfer-form');
const transferAmountInput = document.getElementById('transfer-amount');
const transferRecipientInput = document.getElementById('transfer-recipient');
const transferDescInput = document.getElementById('transfer-desc');
const btnSubmitTransfer = document.getElementById('btn-submit-transfer');
const transferScopeWarning = document.getElementById('transfer-scope-warning');
const transferLimitHint = document.getElementById('transfer-limit-hint');

// Lists
const txList = document.getElementById('tx-list');
const passkeyList = document.getElementById('passkey-list');
const btnOpenAddPasskey = document.getElementById('btn-open-add-passkey');
const addPasskeyScopeNotice = document.getElementById('add-passkey-scope-notice');

// Modals
const modalAddPasskey = document.getElementById('modal-add-passkey');
const btnCloseModalPasskey = document.getElementById('btn-close-modal-passkey');
const btnCreateScopedPasskey = document.getElementById('btn-create-scoped-passkey');

// Current State
let currentSession = null;

// -------------------------------------------------------------
// UI Utilities
// -------------------------------------------------------------
function showAlert(message, type = 'info') {
  globalAlert.className = `alert alert-${type}`;
  globalAlert.textContent = message;
  globalAlert.classList.remove('hidden');
  setTimeout(() => {
    globalAlert.classList.add('hidden');
  }, 6000);
}

// -------------------------------------------------------------
// Tab Switching (Login / Signup)
// -------------------------------------------------------------
tabLogin.addEventListener('click', () => {
  tabLogin.className = 'btn btn-primary';
  tabSignup.className = 'btn btn-secondary';
  loginContainer.classList.remove('hidden');
  signupContainer.classList.add('hidden');
});

tabSignup.addEventListener('click', () => {
  tabSignup.className = 'btn btn-primary';
  tabLogin.className = 'btn btn-secondary';
  signupContainer.classList.remove('hidden');
  loginContainer.classList.add('hidden');
});

// Dashboard Tab Switching (Transfer / Passkeys / History)
document.querySelectorAll('.dashboard-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.tab;
    document.querySelectorAll('.dashboard-tab-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.dashboard-tab-content').forEach(c => c.classList.remove('active'));

    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    const targetEl = document.getElementById(targetId);
    if (targetEl) targetEl.classList.add('active');
  });
});

// Modal Scope Radio Click Handlers
document.querySelectorAll('#modal-add-passkey .scope-option-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('#modal-add-passkey .scope-option-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    const radio = card.querySelector('input[type="radio"]');
    if (radio) {
      radio.checked = true;
      const containerLimit = document.getElementById('container-limit-input');
      if (radio.value === 'limited_transfer') {
        containerLimit.classList.remove('hidden');
      } else {
        containerLimit.classList.add('hidden');
      }
    }
  });
});

// -------------------------------------------------------------
// Session Management & Scoped UI Adaptations
// -------------------------------------------------------------
async function fetchSession() {
  try {
    const res = await fetch('/api/session');
    const data = await res.json();
    currentSession = data;

    if (data.loggedIn && data.user) {
      renderDashboard(data);
    } else {
      renderLoggedOut();
    }
  } catch (err) {
    console.error('Failed to fetch session:', err);
    renderLoggedOut();
  }
}

function renderLoggedOut() {
  authSection.classList.remove('hidden');
  dashboardSection.classList.add('hidden');
  userHeaderInfo.classList.add('hidden');
}

function renderDashboard(data) {
  authSection.classList.add('hidden');
  dashboardSection.classList.remove('hidden');
  userHeaderInfo.classList.remove('hidden');

  userDisplayName.textContent = `${data.user.displayName} (${data.user.username})`;
  userBalanceEl.textContent = `¥${(data.balance || 0).toLocaleString()}`;
  activePasskeyNameEl.textContent = data.activePasskey ? data.activePasskey.name : (isJa ? 'Web パスキー' : 'Web Passkey');

  const scope = data.activeScope || 'full';
  const transferLimit = data.transferLimit;

  // Apply Scoped Permissions on UI
  if (scope === 'full') {
    scopeStatusBanner.className = 'alert alert-success';
    scopeBannerIcon.textContent = '🟢';
    scopeBannerBadge.className = 'scope-badge scope-full';
    scopeBannerBadge.textContent = t.scopeFullTitle;
    scopeBannerDesc.textContent = t.scopeFullDesc;

    // Transfer form
    transferRecipientInput.disabled = false;
    transferAmountInput.disabled = false;
    transferDescInput.disabled = false;
    btnSubmitTransfer.disabled = false;
    btnSubmitTransfer.textContent = t.btnSubmitTransfer;
    transferScopeWarning.classList.add('hidden');
    transferLimitHint.textContent = t.transferNoLimitHint;

    // Passkey management
    btnOpenAddPasskey.disabled = false;
    addPasskeyScopeNotice.classList.add('hidden');

  } else if (scope === 'read_only') {
    scopeStatusBanner.className = 'alert alert-info';
    scopeBannerIcon.textContent = '🔵';
    scopeBannerBadge.className = 'scope-badge scope-read_only';
    scopeBannerBadge.textContent = t.scopeRoTitle;
    scopeBannerDesc.textContent = t.scopeRoDesc;

    // Transfer form disabled
    transferRecipientInput.disabled = true;
    transferAmountInput.disabled = true;
    transferDescInput.disabled = true;
    btnSubmitTransfer.disabled = true;
    btnSubmitTransfer.textContent = t.transferRoBtn;
    transferScopeWarning.className = 'alert alert-info';
    transferScopeWarning.textContent = t.transferRoWarning;
    transferScopeWarning.classList.remove('hidden');
    transferLimitHint.textContent = '';

    // Passkey management disabled
    btnOpenAddPasskey.disabled = true;
    addPasskeyScopeNotice.classList.remove('hidden');

  } else if (scope === 'limited_transfer') {
    const lim = transferLimit || 5000;
    scopeStatusBanner.className = 'alert alert-warning';
    scopeBannerIcon.textContent = '🟡';
    scopeBannerBadge.className = 'scope-badge scope-limited_transfer';
    scopeBannerBadge.textContent = t.scopeLimTitle(lim);
    scopeBannerDesc.textContent = t.scopeLimDesc(lim);

    // Transfer form enabled with limit
    transferRecipientInput.disabled = false;
    transferAmountInput.disabled = false;
    transferDescInput.disabled = false;
    btnSubmitTransfer.disabled = false;
    btnSubmitTransfer.textContent = t.transferLimBtn(lim);
    transferScopeWarning.classList.add('hidden');
    transferLimitHint.textContent = t.transferLimHint(lim);

    // Passkey management disabled
    btnOpenAddPasskey.disabled = true;
    addPasskeyScopeNotice.classList.remove('hidden');
  }

  // Render Transaction History
  renderTransactions(data.transactions || []);

  // Render Passkeys List
  renderPasskeys(data.passkeys || [], scope);

  // Signal API: Synchronize all valid passkeys for this user with the authenticator
  if (window.PublicKeyCredential && typeof PublicKeyCredential.signalAllAcceptedCredentials === 'function' && data.passkeys && data.user) {
    try {
      const acceptedIds = data.passkeys.map(p => p.id);
      PublicKeyCredential.signalAllAcceptedCredentials({
        rpId: window.location.hostname,
        userId: data.user.id,
        allAcceptedCredentialIds: acceptedIds
      }).then(() => {
        console.log('[Signal API] Synced all accepted credentials:', acceptedIds);
      }).catch(err => {
        console.warn('[Signal API] signalAllAcceptedCredentials error:', err);
      });
    } catch (e) {
      console.warn('[Signal API] signalAllAcceptedCredentials error:', e);
    }
  }
}

function renderTransactions(transactions) {
  txList.innerHTML = '';
  if (transactions.length === 0) {
    txList.innerHTML = `<li style="padding: 16px; text-align: center; color: var(--text-muted);">${t.noTxHistory}</li>`;
    return;
  }

  transactions.forEach(tx => {
    const li = document.createElement('li');
    li.className = 'tx-item';
    const isDeposit = tx.type === 'deposit';

    const scopeTag = tx.passkeyScope ? `<span class="scope-badge scope-${tx.passkeyScope}" style="font-size: 10px; padding: 2px 6px;">${getScopeLabel(tx.passkeyScope)}</span>` : '';

    li.innerHTML = `
      <div class="tx-main">
        <div class="tx-icon ${isDeposit ? 'tx-deposit' : 'tx-transfer'}">
          ${isDeposit ? '📥' : '💸'}
        </div>
        <div>
          <div style="font-weight: 700; font-size: 15px;">${escapeHtml(tx.description)} ${scopeTag}</div>
          <div style="font-size: 12px; color: var(--text-muted);">
            ${t.txRecipientPrefix}${escapeHtml(tx.recipient)} &bull; ${new Date(tx.timestamp).toLocaleString()}
          </div>
        </div>
      </div>
      <div class="${isDeposit ? 'tx-amount-plus' : 'tx-amount-minus'}">
        ${isDeposit ? '+' : '-'}¥${tx.amount.toLocaleString()}
      </div>
    `;
    txList.appendChild(li);
  });
}

function renderPasskeys(passkeys, activeScope) {
  passkeyList.innerHTML = '';
  if (passkeys.length === 0) {
    passkeyList.innerHTML = `<li style="padding: 16px; text-align: center; color: var(--text-muted);">${t.noPasskeys}</li>`;
    return;
  }

  passkeys.forEach(p => {
    const li = document.createElement('li');
    li.className = 'passkey-item';

    const scopeBadge = `<span class="scope-badge scope-${p.scope}">${getScopeLabel(p.scope, p.transferLimit)}</span>`;
    const deleteBtn = activeScope === 'full' 
      ? `<button class="btn btn-secondary btn-delete-passkey" data-id="${p.id}" style="padding: 4px 8px; font-size: 11px; color: var(--danger);">${t.deleteBtn}</button>` 
      : '';

    const createdLabel = isJa ? '登録日' : 'Created';

    li.innerHTML = `
      <div class="passkey-main">
        <span style="font-size: 24px;">🔑</span>
        <div>
          <div style="font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 8px;">
            ${escapeHtml(p.name)}
            ${scopeBadge}
          </div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
            ID: ${p.id.substring(0, 16)}... &bull; ${createdLabel}: ${new Date(p.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>
      <div>
        ${deleteBtn}
      </div>
    `;
    passkeyList.appendChild(li);
  });

  // Attach delete handlers
  document.querySelectorAll('.btn-delete-passkey').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.dataset.id;
      if (confirm(t.confirmDelete)) {
        try {
          const res = await fetch(`/api/passkeys/${id}`, { method: 'DELETE' });
          const data = await res.json();
          if (data.success) {
            showAlert(t.passkeyDeleted, 'success');

            // Signal API: Signal deleted credential as unknown
            if (window.PublicKeyCredential && typeof PublicKeyCredential.signalUnknownCredential === 'function') {
              try {
                await PublicKeyCredential.signalUnknownCredential({
                  rpId: window.location.hostname,
                  credentialId: id
                });
                console.log('[Signal API] Signaled unknown credential after deletion:', id);
              } catch (signalErr) {
                console.warn('[Signal API] signalUnknownCredential error:', signalErr);
              }
            }

            fetchSession();
          } else {
            showAlert(data.error || t.deleteFailed, 'danger');
          }
        } catch (err) {
          showAlert(err.message, 'danger');
        }
      }
    });
  });
}

function getScopeLabel(scope, limit) {
  if (scope === 'read_only') return isJa ? '閲覧専用' : 'Read Only';
  if (scope === 'limited_transfer') return isJa ? `上限 ¥${(limit || 5000).toLocaleString()}` : `Limit ¥${(limit || 5000).toLocaleString()}`;
  return isJa ? 'フル権限' : 'Full Access';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// -------------------------------------------------------------
// Authentication Actions (Signup & Login)
// -------------------------------------------------------------

// Sign Up (Creates User + Master Passkey)
document.getElementById('btn-signup-passkey').addEventListener('click', async () => {
  const username = document.getElementById('signup-username').value.trim();
  const displayName = document.getElementById('signup-displayname').value.trim();

  if (!username) {
    showAlert(t.enterUsername, 'warning');
    return;
  }

  try {
    showAlert(t.fetchingRegisterOptions, 'info');
    const optRes = await fetch('/api/auth/register-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, displayName })
    });
    const options = await optRes.json();
    if (options.error) throw new Error(options.error);

    // Convert base64url fields
    options.challenge = base64UrlToBuffer(options.challenge);
    options.user.id = base64UrlToBuffer(options.user.id);
    if (options.excludeCredentials) {
      options.excludeCredentials = options.excludeCredentials.map(c => ({
        ...c,
        id: base64UrlToBuffer(c.id)
      }));
    }

    showAlert(t.promptRegisterBiometric, 'info');
    const cred = await navigator.credentials.create({ publicKey: options });

    const credJson = {
      id: cred.id,
      rawId: bufferToBase64Url(cred.rawId),
      response: {
        clientDataJSON: bufferToBase64Url(cred.response.clientDataJSON),
        attestationObject: bufferToBase64Url(cred.response.attestationObject),
        transports: cred.response.getTransports ? cred.response.getTransports() : ['internal']
      },
      type: cred.type
    };

    showAlert(t.verifyingRegistration, 'info');
    const verifyRes = await fetch('/api/auth/register-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credential: credJson,
        passkeyName: t.masterPasskeyName
      })
    });
    const verifyData = await verifyRes.json();
    if (verifyData.success) {
      showAlert(t.accountCreatedSuccess, 'success');
      fetchSession();
    } else {
      showAlert(verifyData.error || t.loginFailed, 'danger');
    }
  } catch (err) {
    console.error('Registration error:', err);
    showAlert(err.message, 'danger');
  }
});

// Login (Authenticate with Any Passkey)
document.getElementById('btn-login-passkey').addEventListener('click', async () => {
  try {
    showAlert(t.fetchingLoginOptions, 'info');
    const optRes = await fetch('/api/auth/login-options', { method: 'POST' });
    const options = await optRes.json();
    if (options.error) throw new Error(options.error);

    options.challenge = base64UrlToBuffer(options.challenge);
    if (options.allowCredentials) {
      options.allowCredentials = options.allowCredentials.map(c => ({
        ...c,
        id: base64UrlToBuffer(c.id)
      }));
    }

    showAlert(t.promptLoginBiometric, 'info');
    const cred = await navigator.credentials.get({ publicKey: options });

    const credJson = {
      id: cred.id,
      rawId: bufferToBase64Url(cred.rawId),
      response: {
        clientDataJSON: bufferToBase64Url(cred.response.clientDataJSON),
        authenticatorData: bufferToBase64Url(cred.response.authenticatorData),
        signature: bufferToBase64Url(cred.response.signature),
        userHandle: cred.response.userHandle ? bufferToBase64Url(cred.response.userHandle) : null
      },
      type: cred.type
    };

    showAlert(t.verifyingLogin, 'info');
    const verifyRes = await fetch('/api/auth/login-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: credJson })
    });

    // Signal API: When credential does not exist on server (404), remove it from authenticator
    if (verifyRes.status === 404) {
      if (window.PublicKeyCredential && typeof PublicKeyCredential.signalUnknownCredential === 'function') {
        try {
          await PublicKeyCredential.signalUnknownCredential({
            rpId: window.location.hostname,
            credentialId: credJson.id
          });
          console.log('[Signal API] Successfully signaled unknown credential to authenticator:', credJson.id);
          showAlert(t.signalRemovedNotice, 'warning');
          return;
        } catch (signalErr) {
          console.warn('[Signal API] signalUnknownCredential error:', signalErr);
        }
      }
      showAlert(t.passkeyUnregistered, 'danger');
      return;
    }

    const verifyData = await verifyRes.json();
    if (verifyData.success) {
      showAlert(t.loginSuccess(getScopeLabel(verifyData.scope, verifyData.transferLimit)), 'success');

      // Signal API: Synchronize current user details
      if (window.PublicKeyCredential && typeof PublicKeyCredential.signalCurrentUserDetails === 'function' && verifyData.user) {
        try {
          await PublicKeyCredential.signalCurrentUserDetails({
            rpId: window.location.hostname,
            userId: verifyData.user.id,
            name: verifyData.user.username,
            displayName: verifyData.user.displayName
          });
        } catch (signalErr) {
          console.warn('[Signal API] signalCurrentUserDetails error:', signalErr);
        }
      }

      fetchSession();
    } else {
      showAlert(verifyData.error || t.loginFailed, 'danger');
    }
  } catch (err) {
    console.error('Login error:', err);
    showAlert(err.message, 'danger');
  }
});

// Logout
btnLogout.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  showAlert(t.loggedOut, 'info');
  fetchSession();
});

// -------------------------------------------------------------
// Bank Transfer Execution
// -------------------------------------------------------------
transferForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const recipient = transferRecipientInput.value.trim();
  const amount = parseInt(transferAmountInput.value, 10);
  const description = transferDescInput.value.trim();

  if (isNaN(amount) || amount <= 0) {
    showAlert(t.enterValidAmount, 'warning');
    return;
  }

  try {
    showAlert(t.processingTransfer, 'info');
    const res = await fetch('/api/bank/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient, amount, description })
    });

    const data = await res.json();
    if (data.success) {
      showAlert(t.transferSuccess(amount), 'success');
      transferAmountInput.value = '';
      fetchSession();
    } else {
      showAlert(data.error || t.transferFailed, 'danger');
    }
  } catch (err) {
    showAlert(err.message, 'danger');
  }
});

// -------------------------------------------------------------
// Web Add Scoped Passkey Modal
// -------------------------------------------------------------
btnOpenAddPasskey.addEventListener('click', () => {
  modalAddPasskey.classList.add('active');
});

btnCloseModalPasskey.addEventListener('click', () => {
  modalAddPasskey.classList.remove('active');
});

btnCreateScopedPasskey.addEventListener('click', async () => {
  const name = document.getElementById('new-passkey-name').value.trim() || t.additionalPasskeyDefault;
  const selectedScope = document.querySelector('#modal-add-passkey input[name="passkey_scope"]:checked')?.value || 'full';
  const transferLimit = document.getElementById('new-passkey-limit').value || '5000';

  try {
    showAlert(t.fetchingAddOptions, 'info');
    const optRes = await fetch('/api/passkeys/add-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: selectedScope,
        transferLimit: parseInt(transferLimit, 10)
      })
    });
    const options = await optRes.json();
    if (options.error) throw new Error(options.error);

    options.challenge = base64UrlToBuffer(options.challenge);
    options.user.id = base64UrlToBuffer(options.user.id);
    if (options.excludeCredentials) {
      options.excludeCredentials = options.excludeCredentials.map(c => ({
        ...c,
        id: base64UrlToBuffer(c.id)
      }));
    }

    showAlert(t.promptAddBiometric, 'info');
    const cred = await navigator.credentials.create({ publicKey: options });

    const credJson = {
      id: cred.id,
      rawId: bufferToBase64Url(cred.rawId),
      response: {
        clientDataJSON: bufferToBase64Url(cred.response.clientDataJSON),
        attestationObject: bufferToBase64Url(cred.response.attestationObject),
        transports: cred.response.getTransports ? cred.response.getTransports() : ['internal']
      },
      type: cred.type
    };

    showAlert(t.savingScopedPasskey, 'info');
    const verifyRes = await fetch('/api/passkeys/add-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credential: credJson,
        passkeyName: name,
        scope: selectedScope,
        transferLimit: parseInt(transferLimit, 10)
      })
    });

    const verifyData = await verifyRes.json();
    if (verifyData.success) {
      modalAddPasskey.classList.remove('active');
      showAlert(t.passkeyAddedSuccess(name, getScopeLabel(selectedScope, transferLimit)), 'success');
      fetchSession();
    } else {
      showAlert(verifyData.error || t.loginFailed, 'danger');
    }
  } catch (err) {
    console.error('Add passkey error:', err);
    showAlert(err.message, 'danger');
  }
});

// Close modal when clicking overlay
window.addEventListener('click', (e) => {
  if (e.target === modalAddPasskey) modalAddPasskey.classList.remove('active');
});

// Apply static translations and fetch session
applyStaticTranslations();
fetchSession();
