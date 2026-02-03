/**
 * Supabase VDL Authentication Provider
 * Fetches OAuth tokens from VDL Supabase database
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { OAuth2Client } from 'google-auth-library';

export interface GSCAccount {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  isValid: boolean;
  sitesCount?: number;
}

export class SupabaseAuthProvider {
  private supabase: SupabaseClient;
  private tokenCache: Map<string, { token: string; expiresAt: number }> = new Map();
  
  // Google OAuth client ID/secret from VDL
  private clientId: string;
  private clientSecret: string;

  constructor(supabaseUrl: string, supabaseKey: string, clientId: string, clientSecret: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  /**
   * List all available GSC accounts from VDL
   */
  async listAccounts(): Promise<GSCAccount[]> {
    const { data: connections, error } = await this.supabase
      .from('gsc_connections')
      .select(`
        id,
        google_account_email,
        access_token,
        is_valid,
        vault_secret_id
      `)
      .eq('is_valid', true)
      .order('google_account_email');

    if (error) {
      throw new Error(`Failed to fetch GSC accounts: ${error.message}`);
    }

    // Get refresh tokens from vault
    const accountsWithTokens: GSCAccount[] = [];
    
    for (const conn of connections || []) {
      const { data: secret } = await this.supabase
        .from('vault.decrypted_secrets')
        .select('decrypted_secret')
        .eq('id', conn.vault_secret_id)
        .single();

      // Get sites count
      const { count } = await this.supabase
        .from('gsc_properties')
        .select('*', { count: 'exact', head: true })
        .eq('gsc_connection_id', conn.id)
        .eq('is_active', true);

      accountsWithTokens.push({
        id: conn.id,
        email: conn.google_account_email,
        accessToken: conn.access_token,
        refreshToken: secret?.decrypted_secret || '',
        isValid: conn.is_valid,
        sitesCount: count || 0,
      });
    }

    return accountsWithTokens;
  }

  /**
   * Get a specific account by email
   */
  async getAccount(email: string): Promise<GSCAccount | null> {
    const accounts = await this.listAccounts();
    return accounts.find(a => a.email.toLowerCase() === email.toLowerCase()) || null;
  }

  /**
   * Get OAuth2Client for a specific account
   */
  async getAuthClient(email: string): Promise<OAuth2Client> {
    const account = await this.getAccount(email);
    if (!account) {
      throw new Error(`Account not found: ${email}`);
    }

    const oauth2Client = new OAuth2Client(
      this.clientId,
      this.clientSecret,
      'http://localhost'
    );

    oauth2Client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
    });

    // Set up token refresh callback
    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        await this.updateAccessToken(account.id, tokens.access_token);
      }
    });

    return oauth2Client;
  }

  /**
   * Update access token in VDL database
   */
  private async updateAccessToken(accountId: string, newToken: string): Promise<void> {
    const { error } = await this.supabase
      .from('gsc_connections')
      .update({ 
        access_token: newToken,
        last_token_refresh: new Date().toISOString()
      })
      .eq('id', accountId);

    if (error) {
      console.error(`Failed to update access token: ${error.message}`);
    }
  }

  /**
   * Get sites for a specific account
   */
  async getSitesForAccount(email: string): Promise<string[]> {
    const account = await this.getAccount(email);
    if (!account) {
      throw new Error(`Account not found: ${email}`);
    }

    const { data: properties, error } = await this.supabase
      .from('gsc_properties')
      .select('site_url')
      .eq('gsc_connection_id', account.id)
      .eq('is_active', true)
      .order('site_url');

    if (error) {
      throw new Error(`Failed to fetch sites: ${error.message}`);
    }

    return (properties || []).map(p => p.site_url);
  }
}
