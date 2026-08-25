import http from 'node:http';
import { Config } from './config.js';
import { passkeyStore } from './storage/passkey-store.js';
import { OAuthProvisioner } from './provisioning/oauth-provisioner.js';
import { BrowserWebAuthnAutomation } from './browser/virtual-authenticator.js';

const PORT = 3000;

async function startServer() {
  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url || '/', `http://localhost:${PORT}`);
    const pathname = parsedUrl.pathname;

    if (pathname === '/oauth/callback') {
      const code = parsedUrl.searchParams.get('code');
      const state = parsedUrl.searchParams.get('state');
      const error = parsedUrl.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`<h1>認可エラー</h1><p>${error}</p>`);
      }

      if (!code || !state) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`<h1>エラー</h1><p>code または state が不足しています。</p>`);
      }

      const pkceSession = await passkeyStore.consumePkceSession(state);
      if (!pkceSession) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`<h1>エラー</h1><p>無効または期限切れのセッションです。</p>`);
      }

      try {
        const passkey = await OAuthProvisioner.exchangeCodeAndProvisionPasskey(
          code,
          pkceSession.codeVerifier,
          `http://localhost:${PORT}/oauth/callback`
        );

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>パスキープロビジョニング完了</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
              .card { background: #1e293b; padding: 40px; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); text-align: center; max-width: 480px; border: 1px solid #334155; }
              h1 { color: #4ade80; margin-bottom: 12px; font-size: 22px; }
              .btn { display: inline-block; margin-top: 20px; background: #2563eb; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>✅ パスキーを発行しました！</h1>
              <p>AI エージェント用のスコープ付きパスキーの登録が完了しました。</p>
              <p><strong>ユーザー名:</strong> ${passkey.displayName}</p>
              <p><strong>権限スコープ:</strong> ${passkey.scope}</p>
              <p style="color: #94a3b8; font-size: 13px; margin-top: 20px;">ターミナルで <code>npm run dev -- inquire</code> を実行して自動ログイン・残高照会をテストできます。</p>
            </div>
          </body>
          </html>
        `);
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>プロビジョニング失敗</h1><p>${err.message}</p>`);
      }
      return;
    }

    // Home route
    const passkey = await passkeyStore.getLatestPasskey();
    const { url } = await OAuthProvisioner.getAuthorizationUrl(`http://localhost:${PORT}/oauth/callback`);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>AWS AI Agent Scoped Passkey Console</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; display: flex; justify-content: center; }
          .container { max-width: 600px; width: 100%; }
          .card { background: #1e293b; padding: 30px; border-radius: 16px; margin-bottom: 24px; border: 1px solid #334155; }
          .btn { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px; margin-top: 12px; }
          .btn-success { background: #16a34a; }
          code { background: #0f172a; padding: 2px 6px; border-radius: 4px; color: #38bdf8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            <h2>🤖 AWS AI Agent Passkey Console</h2>
            <p>対象サービス: <code>${Config.BANK_BASE_URL}</code></p>
            
            ${passkey ? `
              <div style="background: #064e3b; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #059669;">
                <h3 style="margin: 0 0 8px 0; color: #34d399;">🔑 保管されているパスキー情報</h3>
                <p style="margin: 4px 0;"><strong>ユーザー:</strong> ${passkey.displayName}</p>
                <p style="margin: 4px 0;"><strong>スコープ:</strong> ${passkey.scope}</p>
                <p style="margin: 4px 0;"><strong>Credential ID:</strong> <code style="word-break: break-all;">${passkey.credentialId}</code></p>
              </div>
            ` : `
              <p style="color: #f59e0b;">⚠️ パスキーがまだプロビジョニングされていません。</p>
            `}

            <a href="${url}" class="btn" target="_blank">🔗 Web認可画面を開いてパスキーを発行</a>
          </div>
        </div>
      </body>
      </html>
    `);
  });

  server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 AI Agent Local Console: http://localhost:${PORT}`);
    console.log(`======================================================\n`);
  });
}

async function runInquiry() {
  const passkey = await passkeyStore.getLatestPasskey();
  if (!passkey) {
    console.error('❌ 保管されているパスキーがありません。先に `npm run dev -- start-server` から認可・パスキー発行を行ってください。');
    process.exit(1);
  }

  console.log(`\n--- 🤖 AI エージェント: 残高照会タスク開始 ---`);
  console.log(`対象ユーザー: ${passkey.displayName}`);
  console.log(`権限スコープ: ${passkey.scope}`);
  console.log(`Credential ID: ${passkey.credentialId}\n`);

  const result = await BrowserWebAuthnAutomation.loginAndFetchBalance(passkey);

  if (result.success) {
    console.log(`\n======================================================`);
    console.log(`💰 口座残高: ${result.balanceFormatted}`);
    console.log(`🛡️ 認証状態: ${result.scopeBannerTitle}`);
    console.log(`🔑 認証デバイス名: ${result.activePasskeyName}`);
    console.log(`------------------------------------------------------`);
    console.log(`📜 最近の取引履歴:`);
    result.transactions.forEach((tx, idx) => {
      console.log(`  ${idx + 1}. [${tx.date}] ${tx.title} : ${tx.amount}`);
    });
    console.log(`======================================================\n`);
    console.log(`🗣️ エージェントの回答:`);
    console.log(`「${passkey.displayName} 様、現在の普通預金残高は ${result.balanceFormatted}（${result.scopeBannerTitle}）です。」\n`);
  } else {
    console.error(`❌ 残高照会に失敗しました: ${result.errorMessage}`);
    process.exit(1);
  }
}

// CLI Command Router
const cmd = process.argv[2] || 'start-server';
if (cmd === 'inquire' || cmd === 'inquiry') {
  runInquiry();
} else {
  startServer();
}
