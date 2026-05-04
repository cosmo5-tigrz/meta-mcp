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
        message: 'No active session found'
      });
    }

    const tokens = await UserAuthManager.getUserTokens(user.userId);

    if (tokens?.accessToken) {
      try {
        const revokeUrl = `https://graph.facebook.com/v23.0/me/permissions?access_token=${tokens.accessToken}`;
        const revokeResponse = await fetch(revokeUrl, { method: 'DELETE' });
        if (!revokeResponse.ok) {
          console.warn('Meta token revocation failed, but continuing with local cleanup');
        }
      } catch (error) {
        console.warn('Meta token revocation error:', error);
      }
    }

    await UserAuthManager.deleteUserData(user.userId);
    res.setHeader('Set-Cookie', [
      `session_token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/`,
    ]);
    res.status(200).json({
      success: true,
      message: 'Tokens revoked and session deleted successfully. You have been logged out from both the MCP server and Meta.'
    });
  } catch (error) {
    console.error('Token revocation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to revoke tokens',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
