import fs from 'node:fs';
import path from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { Config } from '../config.js';

export interface StoredPasskey {
  userId: string;
  credentialId: string; // Base64URL
  privateKeyDerBase64: string; // PKCS#8 DER Base64
  userHandleBase64Url: string;
  rpId: string;
  scope: string; // full, read_only, limited_transfer
  transferLimit?: number;
  displayName: string;
  createdAt: string;
}

export interface PkceSession {
  state: string;
  codeVerifier: string;
  sessionId: string;
  createdAt: number;
}

class PasskeyStore {
  private localVault: Record<string, StoredPasskey> = {};
  private pkceSessions: Record<string, PkceSession> = {};
  private ddbDocClient: DynamoDBDocumentClient | null = null;

  constructor() {
    if (!Config.USE_LOCAL_STORAGE) {
      const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });
      this.ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
    } else {
      this.loadLocalVault();
    }
  }

  private loadLocalVault() {
    try {
      const dir = path.dirname(Config.LOCAL_STORAGE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(Config.LOCAL_STORAGE_PATH)) {
        const content = fs.readFileSync(Config.LOCAL_STORAGE_PATH, 'utf-8');
        this.localVault = JSON.parse(content);
      }
    } catch (err: any) {
      console.warn('[PasskeyStore] Failed to load local vault, using in-memory store:', err.message);
    }
  }

  private saveLocalVault() {
    try {
      const dir = path.dirname(Config.LOCAL_STORAGE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(Config.LOCAL_STORAGE_PATH, JSON.stringify(this.localVault, null, 2), 'utf-8');
    } catch (err: any) {
      console.warn('[PasskeyStore] Failed to save local vault:', err.message);
    }
  }

  // PKCE Session Helpers (DynamoDB or in-memory)
  async savePkceSession(session: PkceSession) {
    if (this.ddbDocClient) {
      await this.ddbDocClient.send(
        new PutCommand({
          TableName: Config.DYNAMODB_TABLE,
          Item: {
            userId: `pkce#${session.state}`,
            ...session
          }
        })
      );
    } else {
      this.pkceSessions[session.state] = session;
    }
  }

  async consumePkceSession(state: string): Promise<PkceSession | null> {
    if (this.ddbDocClient) {
      const key = { userId: `pkce#${state}` };
      const res = await this.ddbDocClient.send(
        new GetCommand({
          TableName: Config.DYNAMODB_TABLE,
          Key: key
        })
      );
      if (res.Item) {
        await this.ddbDocClient.send(
          new DeleteCommand({
            TableName: Config.DYNAMODB_TABLE,
            Key: key
          })
        );
        return {
          state: res.Item.state,
          codeVerifier: res.Item.codeVerifier,
          sessionId: res.Item.sessionId || 'default',
          createdAt: res.Item.createdAt
        };
      }
      return null;
    } else {
      const session = this.pkceSessions[state] || null;
      if (session) {
        delete this.pkceSessions[state];
      }
      return session;
    }
  }

  // Passkey Persistence
  async savePasskey(passkey: StoredPasskey): Promise<void> {
    if (this.ddbDocClient) {
      await this.ddbDocClient.send(
        new PutCommand({
          TableName: Config.DYNAMODB_TABLE,
          Item: passkey
        })
      );
    } else {
      this.localVault[passkey.userId] = passkey;
      this.saveLocalVault();
    }
  }

  async getPasskeyByUserId(userId: string): Promise<StoredPasskey | null> {
    if (this.ddbDocClient) {
      const res = await this.ddbDocClient.send(
        new GetCommand({
          TableName: Config.DYNAMODB_TABLE,
          Key: { userId }
        })
      );
      return (res.Item as StoredPasskey) || null;
    } else {
      return this.localVault[userId] || null;
    }
  }

  async getLatestPasskey(): Promise<StoredPasskey | null> {
    if (this.ddbDocClient) {
      const res = await this.ddbDocClient.send(
        new ScanCommand({
          TableName: Config.DYNAMODB_TABLE
        })
      );
      const items = ((res.Items as any[]) || []).filter(item => !item.userId.startsWith('pkce#')) as StoredPasskey[];
      if (items.length === 0) return null;
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return items[0];
    } else {
      const keys = Object.values(this.localVault).filter(item => !item.userId.startsWith('pkce#'));
      return keys.length > 0 ? keys[keys.length - 1] : null;
    }
  }

  async deletePasskey(userId: string): Promise<void> {
    if (this.ddbDocClient) {
      await this.ddbDocClient.send(
        new DeleteCommand({
          TableName: Config.DYNAMODB_TABLE,
          Key: { userId }
        })
      );
    } else {
      delete this.localVault[userId];
      this.saveLocalVault();
    }
  }
}

export const passkeyStore = new PasskeyStore();
