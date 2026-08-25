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

export async function handler(event: HttpApiEvent): Promise<HttpApiResponse> {
  const method = event.requestContext?.http?.method || 'GET';
  const path = event.rawPath || event.requestContext?.http?.path || '/';
  const query = event.queryStringParameters || {};
  const host = event.headers['x-forwarded-host'] || event.headers['host'] || event.requestContext?.domainName || 'localhost';
  const proto = event.headers['x-forwarded-proto'] || 'https';
  const baseUrl = `${proto}://${host}`;
  const callbackUrl = `${baseUrl}/oauth/callback`;

  const session = getSessionContext(event);
  console.log(`[LambdaWebApp] ${method} ${path} (Session: ${session.sessionId}, Host: ${host})`);

  // Route 1: OAuth Callback
  if (path === '/oauth/callback' && method === 'GET') {
    const { code, state, error, error_description } = query;

    if (error) {
      return htmlResponse(400, `<h1>認可エラー</h1><p>${error}: ${error_description || ''}</p>`, session);
    }

    if (!code || !state) {
      return htmlResponse(400, '<h1>エラー</h1><p>code または state パラメータが不足しています。</p>', session);
    }

    const pkceSession = await passkeyStore.consumePkceSession(state);
    if (!pkceSession) {
      return htmlResponse(400, '<h1>セッションエラー</h1><p>PKCE セッションが見つからないか、期限切れです。コンソールからやり直してください。</p>', session);
    }

    try {
      const targetSessionId = pkceSession.sessionId || session.sessionId;
      const passkey = await OAuthProvisioner.exchangeCodeAndProvisionPasskey(code, pkceSession.codeVerifier, callbackUrl, targetSessionId);

      const successSessionContext: SessionContext = { sessionId: targetSessionId, isNew: true };

      return htmlResponse(200, `
        <div class="card">
          <div class="badge success">プロビジョニング完了</div>
          <h2>✅ パスキーを発行しました！</h2>
          <p>このセッション（<code>${targetSessionId}</code>）専用のスコープ付きパスキーを登録しました。</p>
          <div class="info-box">
            <p><strong>ユーザー名:</strong> ${passkey.displayName}</p>
            <p><strong>権限スコープ:</strong> ${passkey.scope}</p>
            <p><strong>Credential ID:</strong> <code>${passkey.credentialId}</code></p>
          </div>
          <a href="/" class="btn btn-primary" style="margin-top: 20px;">🏠 コンソールに戻って残高を照会する</a>
        </div>
      `, successSessionContext);
    } catch (err: any) {
      console.error('[LambdaWebApp] Provisioning error:', err);
      return htmlResponse(500, `<h1>プロビジョニング失敗</h1><p>${err.message}</p>`, session);
    }
  }

  // Route 2: API Inquire (Trigger browser login & scraping for current session)
  if (path === '/api/inquire' && method === 'POST') {
    try {
      const passkey = await passkeyStore.getPasskeyByUserId(session.sessionId);
      if (!passkey) {
        return jsonResponse(200, {
          success: false,
          error: 'このセッション用のパスキーがまだ発行されていません。先に「Web認可画面を開いてパスキーを発行」を実行してください。'
        }, session);
      }

      console.log(`[LambdaWebApp] Starting headless browser login for session: ${session.sessionId}, passkey: ${passkey.credentialId}`);
      const result = await BrowserWebAuthnAutomation.loginAndFetchBalance(passkey);

      if (!result.success) {
        return jsonResponse(200, {
          success: false,
          error: result.errorMessage || '残高の取得に失敗しました。',
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

  return htmlResponse(200, `
    <div class="card">
      <div class="header">
        <span class="logo-icon">🤖</span>
        <div style="flex: 1;">
          <h2>AWS AI Agent Console</h2>
          <p class="subtitle">Scoped Passkey & WebAuthn Browser Automation</p>
        </div>
      </div>

      <div class="session-bar">
        <span>🆔 <strong>現在のセッション:</strong> <code>${session.sessionId}</code></span>
        <a href="/?new_session=1" class="btn btn-secondary btn-sm" style="margin-left: auto;">🔄 新規セッション開始</a>
      </div>

      <div class="section">
        <h3>🏦 対象銀行サービス</h3>
        <p>URL: <a href="${Config.BANK_BASE_URL}" target="_blank"><code>${Config.BANK_BASE_URL}</code></a></p>
      </div>

      <div class="section">
        <h3>🔐 エージェント用パスキー保管状態 (セッション個別)</h3>
        ${passkey ? `
          <div class="passkey-card">
            <div class="passkey-header">
              <span class="status-dot"></span>
              <strong>${passkey.displayName}</strong>
              <span class="badge ${passkey.scope === 'read_only' ? 'badge-info' : 'badge-warn'}">${passkey.scope}</span>
            </div>
            <p class="meta">Credential ID: <code>${passkey.credentialId}</code></p>
            <p class="meta">発行日時: ${new Date(passkey.createdAt).toLocaleString('ja-JP')}</p>
            <button id="btn-reset" class="btn btn-secondary btn-sm" style="margin-top: 10px;">🗑️ このセッションのパスキーを削除</button>
          </div>
        ` : `
          <div class="empty-passkey">
            <p>⚠️ このセッションに割り当てられたパスキーがありません。</p>
            <a href="${authUrl}" class="btn btn-primary" style="margin-top: 10px;">🔗 Web認可画面を開いてパスキーを発行</a>
          </div>
        `}
      </div>

      ${passkey ? `
        <div class="section">
          <h3>💰 エージェントによる自動残高照会</h3>
          <p>Headless Chrome (CDP Virtual Authenticator) にセッション保管中の秘密鍵を注入し、Webサイトに自動ログインして口座残高を取得します。</p>
          <button id="btn-inquire" class="btn btn-success btn-lg">🚀 口座残高を照会する</button>

          <div id="inquiry-loading" class="loading-state hidden">
            <div class="spinner"></div>
            <p>エージェントが Headless Chrome を起動し、パスキーでログイン中...</p>
          </div>

          <div id="inquiry-result" class="result-card hidden"></div>
        </div>
      ` : ''}
    </div>

    <script>
      const CURRENT_SESSION_ID = "${session.sessionId}";
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
              resultEl.innerHTML = \`
                <div class="badge success">照会成功</div>
                <div class="balance-display">
                  <span class="balance-label">普通預金残高</span>
                  <span class="balance-amount">\${data.balanceFormatted}</span>
                </div>
                <div class="auth-info">
                  <p>🛡️ <strong>認証権限:</strong> \${data.scopeBannerTitle || data.activeScope}</p>
                  <p>🔑 <strong>認証デバイス:</strong> \${data.activePasskeyName}</p>
                </div>
                <div class="tx-section">
                  <h4>📜 最近の取引履歴</h4>
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
                    <strong>AI エージェントの回答:</strong>
                    <p>「\${data.userDisplayName} 様、現在の普通預金残高は <strong>\${data.balanceFormatted}</strong>（\${data.scopeBannerTitle || data.activeScope}）です。」</p>
                  </div>
                </div>
              \`;
              resultEl.classList.remove('hidden');
            } else {
              resultEl.innerHTML = \`<div class="error-box">❌ エラー: \${data.error || '残高の取得に失敗しました。'}</div>\`;
              resultEl.classList.remove('hidden');
            }
          } catch (err) {
            loadingEl.classList.add('hidden');
            btnInquire.disabled = false;
            resultEl.innerHTML = \`<div class="error-box">❌ 通信エラー: \${err.message}</div>\`;
            resultEl.classList.remove('hidden');
          }
        });
      }

      if (btnReset) {
        btnReset.addEventListener('click', async () => {
          if (confirm('このセッションに保管されているパスキーを削除しますか？')) {
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
