import { passkeyStore } from '../storage/passkey-store.js';
import { OAuthProvisioner } from '../provisioning/oauth-provisioner.js';

export interface ApiGatewayEvent {
  queryStringParameters?: Record<string, string>;
  headers?: Record<string, string>;
  requestContext?: any;
}

export interface ApiGatewayResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * AWS Lambda Handler for API Gateway OAuth Callback endpoint (/oauth/callback).
 */
export async function handler(event: ApiGatewayEvent): Promise<ApiGatewayResponse> {
  const query = event.queryStringParameters || {};
  const { code, state, error, error_description } = query;

  if (error) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: `<h1>認可エラー</h1><p>${error}: ${error_description || ''}</p>`
    };
  }

  if (!code || !state) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: '<h1>エラー</h1><p>code または state パラメータが不足しています。</p>'
    };
  }

  // Retrieve matching PKCE session
  const pkceSession = await passkeyStore.consumePkceSession(state);
  if (!pkceSession) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: '<h1>セッションエラー</h1><p>PKCE セッションが見つからないか、期限切れです。</p>'
    };
  }

  try {
    const passkey = await OAuthProvisioner.exchangeCodeAndProvisionPasskey(code, pkceSession.codeVerifier);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>パスキープロビジョニング完了</title>
          <style>
            body { font-family: sans-serif; text-align: center; padding: 40px; background: #f0fdf4; color: #166534; }
            .card { background: white; max-width: 480px; margin: 0 auto; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>✅ パスキーを発行しました</h1>
            <p>AI エージェント用のスコープ付きパスキーの登録が完了しました。</p>
            <p><strong>ユーザー:</strong> ${passkey.displayName}</p>
            <p><strong>権限スコープ:</strong> ${passkey.scope}</p>
            <p>このウィンドウを閉じて、エージェントに対話をお続けください。</p>
          </div>
        </body>
        </html>
      `
    };
  } catch (err: any) {
    console.error('[OAuthCallback] Provisioning failed:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: `<h1>プロビジョニング失敗</h1><p>${err.message}</p>`
    };
  }
}
