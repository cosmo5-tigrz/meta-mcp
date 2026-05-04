import { VercelRequest, VercelResponse } from '@vercel/node';
import { UserAuthManager } from '../../src/utils/user-auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    const user = await UserAuthManager.authenticateUser(authHeader);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Please login to access your profile'
      });
    }

    res.status(200).json({
      success: true,
      user: {
        id: user.userId,
        name: user.name,
        email: user.email,
        metaUserId: user.metaUserId,
        createdAt: user.createdAt,
        lastUsed: user.lastUsed,
      },
      mcpEndpoint: `https://${req.headers.host}/api/mcp`,
      tokenStatus: {
        hasToken: !!user.accessToken,
        expiration: user.tokenExpiration,
        isExpired: user.tokenExpiration ? new Date() > user.tokenExpiration : false,
      }
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get profile',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
