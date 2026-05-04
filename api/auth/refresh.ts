import { VercelRequest, VercelResponse } from '@vercel/node';
import { UserAuthManager } from '../../src/utils/user-auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    const user = await UserAuthManager.authenticateUser(authHeader);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Please login to refresh your tokens'
      });
    }

    const refreshSuccess = await UserAuthManager.refreshUserToken(user.userId);

    if (!refreshSuccess) {
      return res.status(400).json({
        success: false,
        error: 'Token refresh failed',
        message: 'Unable to refresh your Meta access token. You may need to re-authenticate.'
      });
    }

    const updatedTokens = await UserAuthManager.getUserTokens(user.userId);

    res.status(200).json({
      success: true,
      message: 'Tokens refreshed successfully',
      tokenInfo: {
        hasToken: !!updatedTokens?.accessToken,
        tokenType: updatedTokens?.tokenType,
        updatedAt: new Date().toISOString(),
      }
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh tokens',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
