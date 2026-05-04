import { VercelRequest, VercelResponse } from '@vercel/node';

// Debug endpoint - DO NOT USE IN PRODUCTION
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const envCheck = {
      META_APP_ID: !!process.env.META_APP_ID,
      META_APP_SECRET: !!process.env.META_APP_SECRET,
      META_REDIRECT_URI: process.env.META_REDIRECT_URI,
      JWT_SECRET: !!process.env.JWT_SECRET,
      REDIS_URL: !!process.env.REDIS_URL,
      KV_REST_API_URL: !!process.env.KV_REST_API_URL,
    };

    let testAuthUrl = null;
    if (process.env.META_APP_ID && process.env.META_REDIRECT_URI) {
      const params = new URLSearchParams({
        client_id: process.env.META_APP_ID,
        redirect_uri: process.env.META_REDIRECT_URI,
        scope: 'ads_management,ads_read,business_management',
        response_type: 'code',
        state: 'debug_test_state_123',
      });
      testAuthUrl = `https://www.facebook.com/v23.0/dialog/oauth?${params.toString()}`;
    }

    let storageTest = 'not_tested';
    try {
      if (process.env.REDIS_URL) {
        storageTest = 'redis_configured';
      } else if (process.env.KV_REST_API_URL) {
        storageTest = 'vercel_kv_configured';
      } else {
        storageTest = 'no_storage_configured';
      }
    } catch (error) {
      storageTest = `storage_error: ${error instanceof Error ? error.message : 'unknown'}`;
    }

    res.status(200).json({
      success: true,
      message: 'Debug information',
      host: req.headers.host,
      environment: process.env.NODE_ENV,
      environment_variables: envCheck,
      storage_status: storageTest,
      test_auth_url: testAuthUrl,
      instructions: {
        step1: 'Check that all required environment variables are set (should be true)',
        step2: 'Use the test_auth_url to test the OAuth flow',
        step3: 'After Meta authentication, you should be redirected to the callback',
        step4: 'If you get the callback error, check Meta app configuration',
        common_issues: [
          'META_REDIRECT_URI in Meta app must exactly match the one shown above',
          'Meta app must be in Live mode or you must be a test user',
          "Don't access /api/auth/callback directly - it's only for Meta redirects"
        ]
      }
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Debug endpoint failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
