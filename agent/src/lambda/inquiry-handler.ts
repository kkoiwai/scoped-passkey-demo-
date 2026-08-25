import { passkeyStore } from '../storage/passkey-store.js';
import { BrowserWebAuthnAutomation } from '../browser/virtual-authenticator.js';
import { OAuthProvisioner } from '../provisioning/oauth-provisioner.js';

export interface BedrockAgentEvent {
  actionGroup: string;
  apiPath: string;
  httpMethod: string;
  parameters?: Array<{ name: string; type: string; value: string }>;
  requestBody?: {
    content?: {
      'application/json'?: {
        properties?: Array<{ name: string; type: string; value: string }>;
      };
    };
  };
  sessionAttributes?: Record<string, string>;
  promptSessionAttributes?: Record<string, string>;
}

export interface BedrockAgentResponse {
  messageVersion: string;
  response: {
    actionGroup: string;
    apiPath: string;
    httpMethod: string;
    httpStatusCode: number;
    responseBody: {
      'application/json': {
        body: string;
      };
    };
  };
}

/**
 * AWS Lambda Handler for Amazon Bedrock Agent Action Group.
 */
export async function handler(event: BedrockAgentEvent): Promise<BedrockAgentResponse> {
  console.log('[BedrockActionGroup] Received event:', JSON.stringify(event, null, 2));

  const actionGroup = event.actionGroup || 'BankOperations';
  const apiPath = event.apiPath || '/balance';
  const httpMethod = event.httpMethod || 'GET';

  try {
    // 1. Retrieve stored passkey
    const passkey = await passkeyStore.getLatestPasskey();

    if (!passkey) {
      // Passkey not provisioned yet -> Return consent URL
      const { url } = await OAuthProvisioner.getAuthorizationUrl();
      const responseData = {
        status: 'AUTHORIZATION_REQUIRED',
        message: '銀行口座にアクセスするためのパスキーがまだ発行されていません。以下のURLを開き、マスターパスキーで認可を行ってください。',
        authorizationUrl: url
      };

      return {
        messageVersion: '1.0',
        response: {
          actionGroup,
          apiPath,
          httpMethod,
          httpStatusCode: 200,
          responseBody: {
            'application/json': {
              body: JSON.stringify(responseData)
            }
          }
        }
      };
    }

    // 2. Execute WebAuthn Browser Automation with provisioned passkey
    const result = await BrowserWebAuthnAutomation.loginAndFetchBalance(passkey);

    if (!result.success) {
      throw new Error(result.errorMessage || 'ブラウザでのパスキーログインに失敗しました。');
    }

    const responseData = {
      status: 'SUCCESS',
      accountName: passkey.displayName,
      balance: result.balance,
      balanceFormatted: result.balanceFormatted,
      scope: result.activeScope,
      scopeTitle: result.scopeBannerTitle,
      recentTransactions: result.transactions.slice(0, 5)
    };

    return {
      messageVersion: '1.0',
      response: {
        actionGroup,
        apiPath,
        httpMethod,
        httpStatusCode: 200,
        responseBody: {
          'application/json': {
            body: JSON.stringify(responseData)
          }
        }
      }
    };
  } catch (err: any) {
    console.error('[BedrockActionGroup] Error:', err);
    return {
      messageVersion: '1.0',
      response: {
        actionGroup,
        apiPath,
        httpMethod,
        httpStatusCode: 500,
        responseBody: {
          'application/json': {
            body: JSON.stringify({
              status: 'ERROR',
              error: err.message
            })
          }
        }
      }
    };
  }
}
