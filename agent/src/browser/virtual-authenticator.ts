import fs from 'node:fs';
import puppeteer, { Browser, PuppeteerLaunchOptions } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { Config } from '../config.js';
import { StoredPasskey } from '../storage/passkey-store.js';

export interface BankInquiryResult {
  success: boolean;
  balance: number;
  balanceFormatted: string;
  activePasskeyName: string;
  activeScope: string;
  scopeBannerTitle: string;
  transactions: Array<{
    title: string;
    date: string;
    amount: string;
    isDeposit: boolean;
  }>;
  errorMessage?: string;
}

export class BrowserWebAuthnAutomation {
  /**
   * Launches Headless Chrome with Chrome DevTools Protocol (CDP) Virtual Authenticator,
   * injects the provisioned EC P-256 private key, performs passkey login to the Bank Web site,
   * and extracts balance & transactions.
   */
  static async loginAndFetchBalance(passkey: StoredPasskey): Promise<BankInquiryResult> {
    console.log(`[BrowserAutomation] Launching Headless Chrome for RP: ${passkey.rpId} (User: ${passkey.displayName})...`);

    let browser: Browser | null = null;

    try {
      // Resolve Chrome Executable Path
      const linuxChromePath = '/var/task/chrome/linux-126.0.6478.182/chrome-linux64/chrome';
      const macChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      let executablePath: string | undefined = undefined;

      if (fs.existsSync(linuxChromePath)) {
        executablePath = linuxChromePath;
      } else if (process.platform === 'darwin' && fs.existsSync(macChromePath)) {
        executablePath = macChromePath;
      }

      console.log(`[BrowserAutomation] Using Chrome executable: ${executablePath || 'default puppeteer bundle'}`);

      const launchOptions: PuppeteerLaunchOptions = {
        headless: true,
        pipe: true,
        dumpio: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-zygote',
          '--single-process',
          '--user-data-dir=/tmp/chrome-user-data',
          '--data-path=/tmp/chrome-data-path',
          '--disk-cache-dir=/tmp/chrome-cache-dir',
          '--headless=new'
        ]
      };

      if (executablePath) {
        launchOptions.executablePath = executablePath;
      }

      browser = (await puppeteer.launch(launchOptions)) as unknown as Browser;

      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });

      page.on('console', msg => console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`));
      page.on('pageerror', err => console.error(`[Browser PageError]`, err));
      page.on('error', err => console.error(`[Browser PageCrash]`, err));
      page.on('close', () => console.log('[Browser Page Closed]'));
      page.on('dialog', async dialog => {
        console.log(`[Browser Dialog] ${dialog.type()}: ${dialog.message()}`);
        await dialog.dismiss();
      });

      // 1. Navigate to Bank Website first
      console.log(`[BrowserAutomation] Navigating to ${Config.BANK_BASE_URL}...`);
      await page.goto(Config.BANK_BASE_URL, {
        waitUntil: 'networkidle2',
        timeout: Config.BROWSER_TIMEOUT_MS
      });

      // Check if already logged in from previous session, log out if needed
      const isAlreadyLoggedIn = await page.evaluate(() => {
        const dash = document.getElementById('dashboard-section');
        return dash && !dash.classList.contains('hidden');
      });
      if (isAlreadyLoggedIn) {
        console.log('[BrowserAutomation] Previous session active, logging out...');
        const logoutBtn = await page.$('#btn-logout');
        if (logoutBtn) {
          await logoutBtn.click();
          await page.waitForSelector('#auth-section:not(.hidden)', { timeout: 10000 });
        }
      }

      // Ensure login tab is selected
      await page.evaluate(() => {
        const tabLogin = document.getElementById('tab-login');
        if (tabLogin) tabLogin.click();
      });

      // 2. Establish CDP Session on the loaded page
      console.log('[BrowserAutomation] Setting up CDP Virtual Authenticator...');
      const client = await page.target().createCDPSession();

      // Enable WebAuthn domain in CDP
      await client.send('WebAuthn.enable');

      // 3. Add Virtual Authenticator (CTAP2, platform/internal transport with resident key and user verification)
      const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
        options: {
          protocol: 'ctap2',
          transport: 'internal',
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true
        }
      });

      console.log(`[BrowserAutomation] Created Virtual Authenticator (ID: ${authenticatorId})`);

      // Helper to convert base64url to standard base64 for CDP
      const toStandardBase64 = (b64url: string) => {
        return Buffer.from(b64url, 'base64url').toString('base64');
      };

      // 4. Inject the provisioned passkey credentials & PKCS#8 DER private key
      const signCount = Math.floor(Date.now() / 1000);
      await client.send('WebAuthn.addCredential', {
        authenticatorId,
        credential: {
          credentialId: toStandardBase64(passkey.credentialId),
          isResidentCredential: true,
          rpId: passkey.rpId,
          privateKey: passkey.privateKeyDerBase64,
          userHandle: toStandardBase64(passkey.userHandleBase64Url),
          signCount
        }
      });

      console.log(`[BrowserAutomation] Injected provisioned passkey into Virtual Authenticator (signCount: ${signCount}).`);

      // 5. Trigger Passkey Login
      console.log('[BrowserAutomation] Clicking Passkey Login button (#btn-login-passkey)...');
      await page.waitForSelector('#btn-login-passkey', { visible: true, timeout: 10000 });
      await page.click('#btn-login-passkey');

      // 6. Wait for Login outcome (either Dashboard appears or Error Alert appears)
      console.log('[BrowserAutomation] Waiting for login outcome (Dashboard or Authentication Alert)...');
      
      let loginOutcome: { success: boolean; error?: string } = { success: false };

      try {
        const outcomeHandle = await page.waitForFunction(
          () => {
            const dash = document.getElementById('dashboard-section');
            if (dash && !dash.classList.contains('hidden')) {
              return { success: true };
            }
            const alert = document.getElementById('global-alert');
            if (alert && !alert.classList.contains('hidden')) {
              const text = alert.textContent?.trim() || '';
              const isError = alert.classList.contains('alert-danger') || alert.classList.contains('alert-warning');
              if (isError && text && !text.includes('取得中') && !text.includes('検証中') && !text.includes('解除してください')) {
                return { success: false, error: text };
              }
            }
            return null;
          },
          { timeout: 15000, polling: 200 }
        );
        loginOutcome = (await outcomeHandle.jsonValue()) as { success: boolean; error?: string };
      } catch (waitErr: any) {
        const alertText = await page.evaluate(() => {
          const alert = document.getElementById('global-alert');
          return alert && !alert.classList.contains('hidden') ? alert.textContent?.trim() : null;
        });
        loginOutcome = {
          success: false,
          error: alertText || 'ログイン待機タイムアウト: パスキー認証に失敗したか、サーバーから応答がありません。'
        };
      }

      if (!loginOutcome.success) {
        const errorMsg = loginOutcome.error || 'このパスキーはサーバー上で削除されているか、登録されていません。';
        console.warn(`[BrowserAutomation] Login failed: ${errorMsg}`);
        return {
          success: false,
          balance: 0,
          balanceFormatted: '¥0',
          activePasskeyName: '-',
          activeScope: passkey.scope,
          scopeBannerTitle: '',
          transactions: [],
          errorMessage: `パスキーでログインできませんでした（${errorMsg}）`
        };
      }

      // 7. Wait for Balance to render
      await page.waitForSelector('#user-balance', { timeout: 10000 });

      // 8. Extract Balance & State
      const rawBalanceText = await page.$eval('#user-balance', el => el.textContent?.trim() || '¥0');
      const activePasskeyName = await page.$eval('#active-passkey-name', el => el.textContent?.trim() || '-');
      const scopeBannerTitle = await page.$eval('#scope-banner-title', el => el.textContent?.trim() || '');
      const scopeBadge = await page.$eval('#scope-banner-badge', el => el.textContent?.trim() || '');

      // Parse numerical balance (e.g. "¥100,000" -> 100000)
      const balanceNum = parseInt(rawBalanceText.replace(/[^0-9]/g, ''), 10) || 0;

      // Extract transaction items
      const transactions = await page.$$eval('#tx-list li.tx-item', items => {
        return items.map(item => {
          const mainDiv = item.querySelector('.tx-main div:nth-child(2)');
          const title = mainDiv?.firstElementChild?.textContent?.trim() || '';
          const subtitle = mainDiv?.lastElementChild?.textContent?.trim() || '';
          const plusEl = item.querySelector('.tx-amount-plus');
          const minusEl = item.querySelector('.tx-amount-minus');
          const amount = plusEl?.textContent?.trim() || minusEl?.textContent?.trim() || '';
          const isDeposit = !!plusEl;
          return { title, date: subtitle, amount, isDeposit };
        });
      });

      console.log(`[BrowserAutomation] Successfully fetched dashboard! Balance: ${rawBalanceText}, Scope: ${scopeBadge}`);

      return {
        success: true,
        balance: balanceNum,
        balanceFormatted: rawBalanceText,
        activePasskeyName,
        activeScope: passkey.scope,
        scopeBannerTitle: `${scopeBannerTitle} (${scopeBadge})`,
        transactions
      };
    } catch (err: any) {
      console.error('[BrowserAutomation] Browser automation failed:', err);
      return {
        success: false,
        balance: 0,
        balanceFormatted: '¥0',
        activePasskeyName: '-',
        activeScope: passkey.scope,
        scopeBannerTitle: '',
        transactions: [],
        errorMessage: err.message
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}
