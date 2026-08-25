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
  activePasskeyNameEl.textContent = data.activePasskey ? data.activePasskey.name : 'Web Passkey';

  const scope = data.activeScope || 'full';
  const transferLimit = data.transferLimit;

  // Apply Scoped Permissions on UI
  if (scope === 'full') {
    scopeStatusBanner.className = 'alert alert-success';
    scopeBannerIcon.textContent = '🟢';
    scopeBannerBadge.className = 'scope-badge scope-full';
    scopeBannerBadge.textContent = 'フル権限 (Full Access)';
    scopeBannerDesc.textContent = 'すべての送金、取引履歴閲覧、新しいパスキー追加・管理が許可されています。';

    // Transfer form
    transferRecipientInput.disabled = false;
    transferAmountInput.disabled = false;
    transferDescInput.disabled = false;
    btnSubmitTransfer.disabled = false;
    btnSubmitTransfer.textContent = '💸 送金を実行する';
    transferScopeWarning.classList.add('hidden');
    transferLimitHint.textContent = '※ 残高の範囲内でいくらでも送金可能です。';

    // Passkey management
    btnOpenAddPasskey.disabled = false;
    addPasskeyScopeNotice.classList.add('hidden');

  } else if (scope === 'read_only') {
    scopeStatusBanner.className = 'alert alert-info';
    scopeBannerIcon.textContent = '🔵';
    scopeBannerBadge.className = 'scope-badge scope-read_only';
    scopeBannerBadge.textContent = '閲覧専用 (Read Only)';
    scopeBannerDesc.textContent = '取引履歴と残高の閲覧のみ許可されています（送金およびパスキー追加設定はできません）。';

    // Transfer form disabled
    transferRecipientInput.disabled = true;
    transferAmountInput.disabled = true;
    transferDescInput.disabled = true;
    btnSubmitTransfer.disabled = true;
    btnSubmitTransfer.textContent = '🔒 閲覧専用パスキーのため送金不可';
    transferScopeWarning.className = 'alert alert-info';
    transferScopeWarning.textContent = '🔒 現在のパスキーは「閲覧専用」です。送金ボタンはロックされています。';
    transferScopeWarning.classList.remove('hidden');
    transferLimitHint.textContent = '';

    // Passkey management disabled
    btnOpenAddPasskey.disabled = true;
    addPasskeyScopeNotice.classList.remove('hidden');

  } else if (scope === 'limited_transfer') {
    scopeStatusBanner.className = 'alert alert-warning';
    scopeBannerIcon.textContent = '🟡';
    scopeBannerBadge.className = 'scope-badge scope-limited_transfer';
    scopeBannerBadge.textContent = `金額限定送金 (上限: ¥${(transferLimit || 5000).toLocaleString()})`;
    scopeBannerDesc.textContent = `1回あたり ¥${(transferLimit || 5000).toLocaleString()} までの送金が許可されています（パスキー追加設定はできません）。`;

    // Transfer form enabled with limit
    transferRecipientInput.disabled = false;
    transferAmountInput.disabled = false;
    transferDescInput.disabled = false;
    btnSubmitTransfer.disabled = false;
    btnSubmitTransfer.textContent = `💸 送金を実行する (上限 ¥${(transferLimit || 5000).toLocaleString()})`;
    transferScopeWarning.classList.add('hidden');
    transferLimitHint.textContent = `※ 送金上限額は 1回あたり ¥${(transferLimit || 5000).toLocaleString()} です。`;

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
    txList.innerHTML = '<li style="padding: 16px; text-align: center; color: var(--text-muted);">取引履歴はありません。</li>';
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
            相手先: ${escapeHtml(tx.recipient)} &bull; ${new Date(tx.timestamp).toLocaleString()}
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
    passkeyList.innerHTML = '<li style="padding: 16px; text-align: center; color: var(--text-muted);">登録済みパスキーはありません。</li>';
    return;
  }

  passkeys.forEach(p => {
    const li = document.createElement('li');
    li.className = 'passkey-item';

    const scopeBadge = `<span class="scope-badge scope-${p.scope}">${getScopeLabel(p.scope, p.transferLimit)}</span>`;
    const deleteBtn = activeScope === 'full' 
      ? `<button class="btn btn-secondary btn-delete-passkey" data-id="${p.id}" style="padding: 4px 8px; font-size: 11px; color: var(--danger);">削除</button>` 
      : '';

    li.innerHTML = `
      <div class="passkey-main">
        <span style="font-size: 24px;">🔑</span>
        <div>
          <div style="font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 8px;">
            ${escapeHtml(p.name)}
            ${scopeBadge}
          </div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
            ID: ${p.id.substring(0, 16)}... &bull; 登録日: ${new Date(p.createdAt).toLocaleDateString()}
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
      if (confirm('このパスキーを削除しますか？')) {
        try {
          const res = await fetch(`/api/passkeys/${id}`, { method: 'DELETE' });
          const data = await res.json();
          if (data.success) {
            showAlert('パスキーを削除しました。', 'success');

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
            showAlert(data.error || '削除に失敗しました。', 'danger');
          }
        } catch (err) {
          showAlert('削除エラー: ' + err.message, 'danger');
        }
      }
    });
  });
}

function getScopeLabel(scope, limit) {
  if (scope === 'read_only') return '閲覧専用';
  if (scope === 'limited_transfer') return `上限 ¥${(limit || 5000).toLocaleString()}`;
  return 'フル権限';
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
    showAlert('ユーザー名を入力してください。', 'warning');
    return;
  }

  try {
    showAlert('パスキー生成オプションを取得中...', 'info');
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

    showAlert('デバイスの画面ロック / 生体認証でパスキーを作成してください...', 'info');
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

    showAlert('サーバーでパスキーと口座開設を検証中...', 'info');
    const verifyRes = await fetch('/api/auth/register-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credential: credJson,
        passkeyName: 'マスターパスキー (初期作成)'
      })
    });
    const verifyData = await verifyRes.json();
    if (verifyData.success) {
      showAlert('口座開設とマスターパスキーの発行が完了しました！', 'success');
      fetchSession();
    } else {
      showAlert(verifyData.error || '登録検証に失敗しました。', 'danger');
    }
  } catch (err) {
    console.error('Registration error:', err);
    showAlert(`登録エラー: ${err.message}`, 'danger');
  }
});

// Login (Authenticate with Any Passkey)
document.getElementById('btn-login-passkey').addEventListener('click', async () => {
  try {
    showAlert('パスキー認証オプションを取得中...', 'info');
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

    showAlert('パスキーで生体認証 / 画面ロックを解除してください...', 'info');
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

    showAlert('パスキーと権限スコープを検証中...', 'info');
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
          showAlert('⚠️ サーバー上に存在しないパスキーのため、Signal API により端末のパスキーマネージャーから削除シグナルを送信しました。', 'warning');
          return;
        } catch (signalErr) {
          console.warn('[Signal API] signalUnknownCredential error:', signalErr);
        }
      }
      showAlert('このパスキーはサーバー上に登録されていません。', 'danger');
      return;
    }

    const verifyData = await verifyRes.json();
    if (verifyData.success) {
      showAlert(`ログイン成功！権限スコープ: ${getScopeLabel(verifyData.scope, verifyData.transferLimit)}`, 'success');

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
      showAlert(verifyData.error || 'ログイン検証に失敗しました。', 'danger');
    }
  } catch (err) {
    console.error('Login error:', err);
    showAlert(`ログインエラー: ${err.message}`, 'danger');
  }
});

// Logout
btnLogout.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  showAlert('ログアウトしました。', 'info');
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
    showAlert('有効な金額を入力してください。', 'warning');
    return;
  }

  try {
    showAlert('送金処理を実行中...', 'info');
    const res = await fetch('/api/bank/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient, amount, description })
    });

    const data = await res.json();
    if (data.success) {
      showAlert(`¥${amount.toLocaleString()} の送金が完了しました！`, 'success');
      transferAmountInput.value = '';
      fetchSession();
    } else {
      showAlert(data.error || '送金に失敗しました。', 'danger');
    }
  } catch (err) {
    showAlert('通信エラー: ' + err.message, 'danger');
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
  const name = document.getElementById('new-passkey-name').value.trim() || '追加パスキー';
  const selectedScope = document.querySelector('#modal-add-passkey input[name="passkey_scope"]:checked')?.value || 'full';
  const transferLimit = document.getElementById('new-passkey-limit').value || '5000';

  try {
    showAlert('パスキー追加オプションを取得中...', 'info');
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

    showAlert('新しいパスキーをデバイスに登録してください...', 'info');
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

    showAlert('権限スコープを付与して保存中...', 'info');
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
      showAlert(`パスキー「${name}」(${getScopeLabel(selectedScope, transferLimit)}) を登録しました！`, 'success');
      fetchSession();
    } else {
      showAlert(verifyData.error || '登録検証に失敗しました。', 'danger');
    }
  } catch (err) {
    console.error('Add passkey error:', err);
    showAlert(`パスキー追加エラー: ${err.message}`, 'danger');
  }
});

// Close modal when clicking overlay
window.addEventListener('click', (e) => {
  if (e.target === modalAddPasskey) modalAddPasskey.classList.remove('active');
});

// Initial load
fetchSession();
