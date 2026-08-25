import crypto from 'node:crypto';
import { Config } from '../config.js';
import { passkeyStore } from '../storage/passkey-store.js';
import { OAuthProvisioner } from '../provisioning/oauth-provisioner.js';
import { BrowserWebAuthnAutomation } from '../browser/virtual-authenticator.js';

export interface HttpApiEvent {
  rawPath: string;
  rawQueryString?: string;
  headers: Record<string, string>;
  cookies?: string[];
  queryStringParameters?: Record<string, string>;
  requestContext: {
    http: {
      method: string;
      path: string;
    };
    domainName?: string;
    stage?: string;
  };
  body?: string;
  isBase64Encoded?: boolean;
}

export interface HttpApiResponse {
  statusCode: number;
  headers: Record<string, string>;
  cookies?: string[];
  body: string;
  isBase64Encoded?: boolean;
}

interface SessionContext {
  sessionId: string;
  isNew: boolean;
}

function getSessionContext(event: HttpApiEvent): SessionContext {
  // If user requested a fresh session explicitly
  if (event.queryStringParameters?.new_session === '1') {
    return { sessionId: `sess_${crypto.randomBytes(12).toString('hex')}`, isNew: true };
  }

  // Check query string
  if (event.queryStringParameters?.sessionId) {
    return { sessionId: event.queryStringParameters.sessionId, isNew: false };
  }

  // Check header
  const headerSessionId = event.headers?.['x-session-id'] || event.headers?.['X-Session-Id'];
  if (headerSessionId) {
    return { sessionId: headerSessionId, isNew: false };
  }

  // Check cookies
  const cookieList: string[] = [];
  if (event.cookies && Array.isArray(event.cookies)) {
    cookieList.push(...event.cookies);
  }
  if (event.headers?.cookie) {
    cookieList.push(...event.headers.cookie.split(';').map(c => c.trim()));
  }
  for (const c of cookieList) {
    const match = c.match(/agent_session_id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return { sessionId: match[1], isNew: false };
    }
  }

  // Generate new random session ID
  const newSessionId = `sess_${crypto.randomBytes(12).toString('hex')}`;
  return { sessionId: newSessionId, isNew: true };
}

function isJapanese(event: HttpApiEvent): boolean {
  const langParam = event.queryStringParameters?.lang || '';
  if (langParam.startsWith('ja')) return true;
  if (langParam.startsWith('en')) return false;

  const acceptLang = event.headers?.['accept-language'] || event.headers?.['Accept-Language'] || '';
  return acceptLang.toLowerCase().includes('ja');
}

export async function handler(event: HttpApiEvent): Promise<HttpApiResponse> {
  const method = event.requestContext?.http?.method || 'GET';
  const path = event.rawPath || event.requestContext?.http?.path || '/';
  const query = event.queryStringParameters || {};
  const host = event.headers['x-forwarded-host'] || event.headers['host'] || event.requestContext?.domainName || 'localhost';
  const proto = event.headers['x-forwarded-proto'] || 'https';
  const baseUrl = `${proto}://${host}`;
  const callbackUrl = `${baseUrl}/oauth/callback`;

  const session = getSessionContext(event);
  const isJa = isJapanese(event);
  console.log(`[LambdaWebApp] ${method} ${path} (Session: ${session.sessionId}, Host: ${host}, Lang: ${isJa ? 'ja' : 'en'})`);

  // Route 1: OAuth Callback
  if (path === '/oauth/callback' && method === 'GET') {
    const { code, state, error, error_description } = query;

    if (error) {
      const errTitle = isJa ? '認可エラー' : 'Authorization Error';
      return htmlResponse(400, `<h1>${errTitle}</h1><p>${error}: ${error_description || ''}</p>`, session);
    }

    if (!code || !state) {
      const errMissing = isJa ? 'code または state パラメータが不足しています。' : 'Missing code or state parameter.';
      return htmlResponse(400, `<h1>Error</h1><p>${errMissing}</p>`, session);
    }

    const pkceSession = await passkeyStore.consumePkceSession(state);
    if (!pkceSession) {
      const errPkce = isJa ? 'PKCE セッションが見つからないか、期限切れです。コンソールからやり直してください。' : 'PKCE session not found or expired. Please retry from the console.';
      return htmlResponse(400, `<h1>Session Error</h1><p>${errPkce}</p>`, session);
    }

    try {
      const targetSessionId = pkceSession.sessionId || session.sessionId;
      const passkey = await OAuthProvisioner.exchangeCodeAndProvisionPasskey(code, pkceSession.codeVerifier, callbackUrl, targetSessionId);

      const successSessionContext: SessionContext = { sessionId: targetSessionId, isNew: true };

      const badgeText = isJa ? 'プロビジョニング完了' : 'Provisioning Complete';
      const titleText = isJa ? '✅ パスキーを発行しました！' : '✅ Passkey Issued Successfully!';
      const descText = isJa 
        ? `このセッション（<code>${targetSessionId}</code>）専用のスコープ付きパスキーを登録しました。` 
        : `Registered scoped passkey exclusively for this session (<code>${targetSessionId}</code>).`;
      const labelUser = isJa ? 'ユーザー名:' : 'Username:';
      const labelScope = isJa ? '権限スコープ:' : 'Permission Scope:';
      const returnBtn = isJa ? '🏠 コンソールに戻って残高を照会する' : '🏠 Return to Console & Inquire Balance';

      return htmlResponse(200, `
        <div class="card">
          <div class="badge success">${badgeText}</div>
          <h2>${titleText}</h2>
          <p>${descText}</p>
          <div class="info-box">
            <p><strong>${labelUser}</strong> ${passkey.displayName}</p>
            <p><strong>${labelScope}</strong> ${passkey.scope}</p>
            <p><strong>Credential ID:</strong> <code>${passkey.credentialId}</code></p>
          </div>
          <a href="/" class="btn btn-primary" style="margin-top: 20px;">${returnBtn}</a>
        </div>
      `, successSessionContext);
    } catch (err: any) {
      console.error('[LambdaWebApp] Provisioning error:', err);
      const failTitle = isJa ? 'プロビジョニング失敗' : 'Provisioning Failed';
      return htmlResponse(500, `<h1>${failTitle}</h1><p>${err.message}</p>`, session);
    }
  }

  // Route 2: API Inquire (Trigger browser login & scraping for current session)
  if (path === '/api/inquire' && method === 'POST') {
    try {
      const passkey = await passkeyStore.getPasskeyByUserId(session.sessionId);
      if (!passkey) {
        return jsonResponse(200, {
          success: false,
          error: isJa 
            ? 'このセッション用のパスキーがまだ発行されていません。先に「Web認可画面を開いてパスキーを発行」を実行してください。' 
            : 'No passkey has been issued for this session yet. Please click "Open Web Authorization to Issue Passkey" first.'
        }, session);
      }

      console.log(`[LambdaWebApp] Starting headless browser login for session: ${session.sessionId}, passkey: ${passkey.credentialId}`);
      const result = await BrowserWebAuthnAutomation.loginAndFetchBalance(passkey);

      if (!result.success) {
        return jsonResponse(200, {
          success: false,
          error: result.errorMessage || (isJa ? '残高の取得に失敗しました。' : 'Failed to retrieve account balance.'),
          userDisplayName: passkey.displayName,
          scope: passkey.scope,
          credentialId: passkey.credentialId
        }, session);
      }

      return jsonResponse(200, {
        ...result,
        userDisplayName: passkey.displayName,
        scope: passkey.scope,
        credentialId: passkey.credentialId
      }, session);
    } catch (err: any) {
      console.error('[LambdaWebApp] Inquiry error:', err);
      return jsonResponse(500, { success: false, error: err.message }, session);
    }
  }

  // Route 3: API Reset Passkey (Reset only current session)
  if (path === '/api/reset' && method === 'POST') {
    try {
      await passkeyStore.deletePasskey(session.sessionId);
      console.log(`[LambdaWebApp] Reset passkey for session: ${session.sessionId}`);
      return jsonResponse(200, { success: true }, session);
    } catch (err: any) {
      return jsonResponse(500, { success: false, error: err.message }, session);
    }
  }

  // Route 4: Web Console Home
  const passkey = await passkeyStore.getPasskeyByUserId(session.sessionId);
  const { url: authUrl } = await OAuthProvisioner.getAuthorizationUrl(callbackUrl, session.sessionId);

  // Localization labels for Web Console
  const labels = isJa ? {
    headerTitle: 'AWS AI Agent Console',
    subtitle: 'Scoped Passkey & WebAuthn Browser Automation',
    sessionLabel: '🆔 <strong>現在のセッション:</strong>',
    btnNewSession: '🔄 新規セッション開始',
    targetBankTitle: '🏦 対象銀行サービス',
    passkeyVaultTitle: '🔐 エージェント用パスキー保管状態 (セッション個別)',
    passkeyIssuedLabel: '発行日時: ',
    btnDeletePasskey: '🗑️ このセッションのパスキーを削除',
    emptyPasskeyNotice: '⚠️ このセッションに割り当てられたパスキーがありません。',
    btnOpenAuth: '🔗 Web認可画面を開いてパスキーを発行',
    inquireSectionTitle: '💰 エージェントによる自動残高照会',
    inquireSectionDesc: 'Headless Chrome (CDP Virtual Authenticator) にセッション保管中の秘密鍵を注入し、Webサイトに自動ログインして口座残高を取得します。',
    btnInquire: '🚀 口座残高を照会する',
    loadingText: 'エージェントが Headless Chrome を起動し、パスキーでログイン中...',
    inquirySuccessBadge: '照会成功',
    balanceLabel: '普通預金残高',
    authScopeLabel: '🛡️ <strong>認証権限:</strong> ',
    authDeviceLabel: '🔑 <strong>認証デバイス:</strong> ',
    recentTxTitle: '📜 最近の取引履歴',
    agentSpeechTitle: 'AI エージェントの回答:',
    agentSpeechText: (name: string, balance: string, scope: string) => `「${name} 様、現在の普通預金残高は <strong>${balance}</strong>（${scope}）です。」`,
    confirmDelete: 'このセッションに保管されているパスキーを削除しますか？',
    errorPrefix: '❌ エラー: ',
    netErrorPrefix: '❌ 通信エラー: '
  } : {
    headerTitle: 'AWS AI Agent Console',
    subtitle: 'Scoped Passkey & WebAuthn Browser Automation',
    sessionLabel: '🆔 <strong>Current Session:</strong>',
    btnNewSession: '🔄 Start New Session',
    targetBankTitle: '🏦 Target Banking Service',
    passkeyVaultTitle: '🔐 Agent Passkey Vault Status (Per-Session)',
    passkeyIssuedLabel: 'Issued: ',
    btnDeletePasskey: '🗑️ Delete Passkey for this session',
    emptyPasskeyNotice: '⚠️ No passkey assigned to this session.',
    btnOpenAuth: '🔗 Open Web Authorization to Issue Passkey',
    inquireSectionTitle: '💰 Automated Balance Inquiry by Agent',
    inquireSectionDesc: 'Headless Chrome (CDP Virtual Authenticator) injects the session EC private key to log in and retrieve account balance automatically.',
    btnInquire: '🚀 Inquire Account Balance',
    loadingText: 'Agent is launching Headless Chrome and logging in with passkey...',
    inquirySuccessBadge: 'Inquiry Successful',
    balanceLabel: 'Savings Balance',
    authScopeLabel: '🛡️ <strong>Permission Scope:</strong> ',
    authDeviceLabel: '🔑 <strong>Authenticated Device:</strong> ',
    recentTxTitle: '📜 Recent Transactions',
    agentSpeechTitle: 'AI Agent Response:',
    agentSpeechText: (name: string, balance: string, scope: string) => `"Dear ${name}, your current savings balance is <strong>${balance}</strong> (${scope})."`,
    confirmDelete: 'Are you sure you want to delete the passkey stored for this session?',
    errorPrefix: '❌ Error: ',
    netErrorPrefix: '❌ Network Error: '
  };

  return htmlResponse(200, `
    <div class="card">
      <div class="header">
        <span class="logo-icon">🤖</span>
        <div style="flex: 1;">
          <h2>${labels.headerTitle}</h2>
          <p class="subtitle">${labels.subtitle}</p>
        </div>
      </div>

      <div class="session-bar">
        <span>${labels.sessionLabel} <code>${session.sessionId}</code></span>
        <a href="/?new_session=1" class="btn btn-secondary btn-sm" style="margin-left: auto;">${labels.btnNewSession}</a>
      </div>

      <div class="section">
        <h3>${labels.targetBankTitle}</h3>
        <p>URL: <a href="${Config.BANK_BASE_URL}" target="_blank"><code>${Config.BANK_BASE_URL}</code></a></p>
      </div>

      <div class="section">
        <h3>${labels.passkeyVaultTitle}</h3>
        ${passkey ? `
          <div class="passkey-card">
            <div class="passkey-header">
              <span class="status-dot"></span>
              <strong>${passkey.displayName}</strong>
              <span class="badge ${passkey.scope === 'read_only' ? 'badge-info' : 'badge-warn'}">${passkey.scope}</span>
            </div>
            <p class="meta">Credential ID: <code>${passkey.credentialId}</code></p>
            <p class="meta">${labels.passkeyIssuedLabel}${new Date(passkey.createdAt).toLocaleString(isJa ? 'ja-JP' : 'en-US')}</p>
            <button id="btn-reset" class="btn btn-secondary btn-sm" style="margin-top: 10px;">${labels.btnDeletePasskey}</button>
          </div>
        ` : `
          <div class="empty-passkey">
            <p>${labels.emptyPasskeyNotice}</p>
            <a href="${authUrl}" class="btn btn-primary" style="margin-top: 10px;">${labels.btnOpenAuth}</a>
          </div>
        `}
      </div>

      ${passkey ? `
        <div class="section">
          <h3>${labels.inquireSectionTitle}</h3>
          <p>${labels.inquireSectionDesc}</p>
          <button id="btn-inquire" class="btn btn-success btn-lg">${labels.btnInquire}</button>

          <div id="inquiry-loading" class="loading-state hidden">
            <div class="spinner"></div>
            <p>${labels.loadingText}</p>
          </div>

          <div id="inquiry-result" class="result-card hidden"></div>
        </div>
      ` : ''}
    </div>

    <script>
      const CURRENT_SESSION_ID = "${session.sessionId}";
      const IS_JA = ${isJa};
      try {
        localStorage.setItem('agent_session_id', CURRENT_SESSION_ID);
      } catch (e) {}

      const btnInquire = document.getElementById('btn-inquire');
      const btnReset = document.getElementById('btn-reset');
      const loadingEl = document.getElementById('inquiry-loading');
      const resultEl = document.getElementById('inquiry-result');

      if (btnInquire) {
        btnInquire.addEventListener('click', async () => {
          btnInquire.disabled = true;
          loadingEl.classList.remove('hidden');
          resultEl.classList.add('hidden');

          try {
            const res = await fetch('/api/inquire', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-session-id': CURRENT_SESSION_ID
              }
            });
            const data = await res.json();

            loadingEl.classList.add('hidden');
            btnInquire.disabled = false;

            if (data.success) {
              const scopeTitle = data.scopeBannerTitle || data.activeScope;
              const agentSpeech = IS_JA 
                ? \`「\${data.userDisplayName} 様、現在の普通預金残高は <strong>\${data.balanceFormatted}</strong>（\${scopeTitle}）です。」\`
                : \`"Dear \${data.userDisplayName}, your current savings balance is <strong>\${data.balanceFormatted}</strong> (\${scopeTitle})."\`;

              resultEl.innerHTML = \`
                <div class="badge success">${labels.inquirySuccessBadge}</div>
                <div class="balance-display">
                  <span class="balance-label">${labels.balanceLabel}</span>
                  <span class="balance-amount">\${data.balanceFormatted}</span>
                </div>
                <div class="auth-info">
                  <p>${labels.authScopeLabel}\${scopeTitle}</p>
                  <p>${labels.authDeviceLabel}\${data.activePasskeyName}</p>
                </div>
                <div class="tx-section">
                  <h4>${labels.recentTxTitle}</h4>
                  <ul class="tx-list">
                    \${data.transactions.map(t => \`
                      <li class="tx-item">
                        <div>
                          <strong>\${t.title}</strong>
                          <div class="tx-date">\${t.date}</div>
                        </div>
                        <span class="tx-amount \${t.isDeposit ? 'deposit' : ''}">\${t.amount}</span>
                      </li>
                    \`).join('')}
                  </ul>
                </div>
                <div class="agent-speech">
                  <div class="agent-avatar">🤖</div>
                  <div>
                    <strong>${labels.agentSpeechTitle}</strong>
                    <p>\${agentSpeech}</p>
                  </div>
                </div>
              \`;
              resultEl.classList.remove('hidden');
            } else {
              resultEl.innerHTML = \`<div class="error-box">${labels.errorPrefix}\${data.error || (IS_JA ? '残高の取得に失敗しました。' : 'Failed to retrieve balance.')}</div>\`;
              resultEl.classList.remove('hidden');
            }
          } catch (err) {
            loadingEl.classList.add('hidden');
            btnInquire.disabled = false;
            resultEl.innerHTML = \`<div class="error-box">${labels.netErrorPrefix}\${err.message}</div>\`;
            resultEl.classList.remove('hidden');
          }
        });
      }

      if (btnReset) {
        btnReset.addEventListener('click', async () => {
          if (confirm("${labels.confirmDelete}")) {
            await fetch('/api/reset', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-session-id': CURRENT_SESSION_ID
              }
            });
            window.location.reload();
          }
        });
      }
    </script>
  `, session);
}

function htmlResponse(statusCode: number, bodyHtml: string, sessionContext: SessionContext): HttpApiResponse {
  const cookieValue = `agent_session_id=${sessionContext.sessionId}; Path=/; SameSite=Lax; Max-Age=2592000; Secure; HttpOnly`;
  const html = `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>AWS AI Agent - Scoped Passkey Console</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        :root {
          --bg-dark: #090d16;
          --card-bg: #111827;
          --card-border: #1f293d;
          --primary: #3b82f6;
          --primary-hover: #2563eb;
          --success: #10b981;
          --text-main: #f3f4f6;
          --text-muted: #9ca3af;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
          background: radial-gradient(circle at 50% 0%, #1e1b4b 0%, var(--bg-dark) 70%);
          color: var(--text-main);
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 24px;
        }
        .container { max-width: 640px; width: 100%; }
        .card {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 20px;
          padding: 32px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }
        .header { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; border-bottom: 1px solid var(--card-border); padding-bottom: 20px; }
        .logo-icon { font-size: 36px; background: #1e293b; padding: 10px; border-radius: 12px; }
        h2 { font-family: 'Outfit', sans-serif; font-size: 24px; font-weight: 700; color: #fff; }
        .subtitle { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
        .session-bar { display: flex; align-items: center; background: rgba(15, 23, 42, 0.8); border: 1px solid #1e293d; padding: 10px 14px; border-radius: 10px; font-size: 12px; color: #94a3b8; margin-bottom: 16px; }
        .section { margin-top: 20px; }
        h3 { font-size: 14px; font-weight: 600; color: #cbd5e1; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
        code { background: #0b1120; border: 1px solid #1e293b; padding: 3px 8px; border-radius: 6px; color: #38bdf8; font-size: 12px; word-break: break-all; }
        .passkey-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 18px; }
        .passkey-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
        .status-dot { width: 10px; height: 10px; background: #10b981; border-radius: 50%; box-shadow: 0 0 8px #10b981; }
        .meta { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
        .empty-passkey { background: rgba(245, 158, 11, 0.08); border: 1px dashed rgba(245, 158, 11, 0.3); border-radius: 12px; padding: 20px; text-align: center; }
        .btn { display: inline-flex; align-items: center; justify-content: center; padding: 12px 20px; border-radius: 10px; font-weight: 600; font-size: 14px; text-decoration: none; cursor: pointer; border: none; transition: all 0.2s ease; }
        .btn-primary { background: var(--primary); color: white; width: 100%; }
        .btn-primary:hover { background: var(--primary-hover); }
        .btn-success { background: #059669; color: white; width: 100%; font-size: 16px; padding: 14px; box-shadow: 0 4px 14px rgba(5, 150, 105, 0.4); }
        .btn-success:hover { background: #047857; transform: translateY(-1px); }
        .btn-secondary { background: #334155; color: #cbd5e1; }
        .btn-secondary:hover { background: #475569; }
        .btn-sm { font-size: 12px; padding: 6px 12px; }
        .badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
        .badge-info { background: #0369a1; color: #e0f2fe; }
        .badge-warn { background: #b45309; color: #fef3c7; }
        .badge.success { background: #065f46; color: #a7f3d0; margin-bottom: 12px; }
        .info-box { background: #0b1120; border: 1px solid #1e293b; padding: 16px; border-radius: 10px; margin-top: 16px; font-size: 14px; line-height: 1.6; }
        .loading-state { text-align: center; padding: 30px 20px; background: #0b1120; border-radius: 12px; margin-top: 16px; }
        .spinner { width: 36px; height: 36px; border: 3px solid rgba(59, 130, 246, 0.2); border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s infinite linear; margin: 0 auto 12px auto; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .result-card { background: #090e1a; border: 1px solid #10b981; border-radius: 16px; padding: 24px; margin-top: 20px; }
        .balance-display { text-align: center; padding: 20px 0; border-bottom: 1px solid #1f293d; }
        .balance-label { display: block; font-size: 13px; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; }
        .balance-amount { display: block; font-family: 'Outfit', sans-serif; font-size: 38px; font-weight: 700; color: #10b981; margin-top: 6px; }
        .auth-info { padding: 12px 0; font-size: 13px; color: #94a3b8; border-bottom: 1px solid #1f293d; }
        .tx-section { margin-top: 16px; }
        .tx-section h4 { font-size: 13px; color: #cbd5e1; margin-bottom: 8px; }
        .tx-list { list-style: none; }
        .tx-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #161f30; font-size: 13px; }
        .tx-date { font-size: 11px; color: #64748b; margin-top: 2px; }
        .tx-amount.deposit { color: #10b981; font-weight: 600; }
        .agent-speech { display: flex; gap: 12px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 12px; padding: 16px; margin-top: 20px; font-size: 14px; align-items: center; }
        .agent-avatar { font-size: 24px; }
        .error-box { background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; color: #fca5a5; padding: 16px; border-radius: 12px; }
        .hidden { display: none; }
      </style>
    </head>
    <body>
      <div class="container">
        ${bodyHtml}
      </div>
    </body>
    </html>
  `;

  return {
    statusCode,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Set-Cookie': cookieValue
    },
    cookies: [cookieValue],
    body: html
  };
}

function jsonResponse(statusCode: number, data: unknown, sessionContext?: SessionContext): HttpApiResponse {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  };
  const cookies: string[] = [];

  if (sessionContext) {
    const cookieValue = `agent_session_id=${sessionContext.sessionId}; Path=/; SameSite=Lax; Max-Age=2592000; Secure; HttpOnly`;
    headers['Set-Cookie'] = cookieValue;
    cookies.push(cookieValue);
  }

  return {
    statusCode,
    headers,
    cookies: cookies.length > 0 ? cookies : undefined,
    body: JSON.stringify(data)
  };
}
