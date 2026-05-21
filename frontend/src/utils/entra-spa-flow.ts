/**
 * Entra SPA OAuth2 + PKCE token exchange utility.
 * Handles the frontend-side token exchange for Single-Page Application (SPA) clients.
 *
 * Azure requires SPA clients to exchange the authorization code directly from the browser,
 * not from a backend server (AADSTS9002327).
 */
import { api } from '../lib/api-client';

interface StoredEntraState {
  state: string;
  codeVerifier: string;
  nonce: string;
}

const ENTRA_STATE_STORAGE_KEY = 'entra_auth_state';

/**
 * Store Entra authentication state in sessionStorage
 */
function storeEntraAuthState(state: StoredEntraState): void {
  try {
    sessionStorage.setItem(ENTRA_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('[Entra SPA] Failed to store auth state:', error);
  }
}

/**
 * Retrieve and clear stored Entra authentication state
 */
function retrieveAndClearEntraAuthState(): StoredEntraState | null {
  try {
    const stored = sessionStorage.getItem(ENTRA_STATE_STORAGE_KEY);
    sessionStorage.removeItem(ENTRA_STATE_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error('[Entra SPA] Failed to retrieve auth state:', error);
    return null;
  }
}

interface TokenExchangeRequest {
  code: string;
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
  authority: string;
}

interface TokenExchangeResponse {
  access_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

/**
 * Exchange authorization code for tokens directly from the browser (SPA flow).
 * This is required for Azure SPA clients — the code exchange must happen via cross-origin request.
 */
export async function exchangeCodeForToken(
  params: TokenExchangeRequest,
): Promise<TokenExchangeResponse> {
  const { code, codeVerifier, clientId, redirectUri, authority } = params;

  const body = new URLSearchParams({
    client_id: clientId,
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    // SPA clients don't send client_secret
  });

  try {
    const response = await fetch(`${authority}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        error: String(errorData.error || 'token_exchange_failed'),
        error_description: String(errorData.error_description || 'Token exchange failed'),
      };
    }

    const data = (await response.json()) as TokenExchangeResponse;
    return data;
  } catch (error) {
    return {
      error: 'fetch_failed',
      error_description: error instanceof Error ? error.message : 'Failed to exchange code',
    };
  }
}

interface ExchangeCallbackParams {
  code: string;
  state: string;
}

/**
 * Handle callback from Azure: exchange code for tokens and send to backend.
 * Call this from the Entra callback page after Azure redirects back with the code.
 */
export async function exchangeCodeAndCreateSession(
  params: ExchangeCallbackParams,
): Promise<{ success: boolean; error?: string; code?: string }> {
  const { code, state } = params;

  // Retrieve stored auth state from session
  const storedState = retrieveAndClearEntraAuthState();
  if (!storedState) {
    return {
      success: false,
      error: 'Authentication state not found. Please restart the login process.',
    };
  }

  // Validate state parameter
  if (!state || state !== storedState.state) {
    return {
      success: false,
      error: 'State validation failed. Possible CSRF attack.',
    };
  }

  // Fetch Entra config to get token endpoint details
  let authState: { clientId: string; authority: string; redirectUri: string } | null = null;
  try {
    authState = await api.get('/api/auth/entra/spa-config');
  } catch (error) {
    console.error('[Entra SPA] Failed to fetch auth state:', error);
  }

  if (!authState) {
    return {
      success: false,
      error: 'Failed to retrieve authentication configuration.',
    };
  }

  // Exchange code for tokens directly from browser
  const tokenResult = await exchangeCodeForToken({
    code,
    codeVerifier: storedState.codeVerifier,
    clientId: authState.clientId,
    redirectUri: authState.redirectUri,
    authority: authState.authority,
  });

  if (tokenResult.error) {
    return {
      success: false,
      error: tokenResult.error_description || tokenResult.error,
      code: tokenResult.error,
    };
  }

  if (!tokenResult.id_token) {
    return {
      success: false,
      error: 'No ID token received from Azure.',
    };
  }

  // Send tokens to backend to create session (use api.post to include CSRF token)
  try {
    await api.post('/api/auth/entra/callback', {
      id_token: tokenResult.id_token,
      access_token: tokenResult.access_token,
    });

    return { success: true };
  } catch (error) {
    const err = error as { message?: string; code?: string };
    return {
      success: false,
      error: err.message ?? 'Failed to create session',
      code: err.code,
    };
  }
}

/**
 * Initialize SPA Entra login: get authorization URL and PKCE parameters
 * Stores PKCE verifier in sessionStorage for later use during callback
 */
export async function initiateSpaEntraLogin(): Promise<void> {
  try {
    const response = await fetch('/api/auth/entra/init-spa');
    if (!response.ok) {
      throw new Error('Failed to initialize Entra login');
    }

    const data = (await response.json()) as {
      authUrl: string;
      state: string;
      nonce: string;
      codeVerifier: string;
    };

    // Store state, nonce, and code verifier in sessionStorage
    storeEntraAuthState({
      state: data.state,
      codeVerifier: data.codeVerifier,
      nonce: data.nonce,
    });

    // Redirect to Azure authorization endpoint
    window.location.href = data.authUrl;
  } catch (error) {
    console.error('[Entra SPA] Failed to initiate login:', error);
    throw error;
  }
}
