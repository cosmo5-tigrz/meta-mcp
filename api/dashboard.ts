import { VercelRequest, VercelResponse } from '@vercel/node';
import { UserAuthManager } from "../src/utils/user-auth.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Check authentication from cookie or query param
    const cookies = req.headers.cookie || "";
    const sessionToken =
      cookies
        .split(";")
        .find((c) => c.trim().startsWith("session_token="))
        ?.split("=")[1] || (req.query.token as string);

    console.log("Dashboard auth check:", {
      hasCookies: !!cookies,
      cookies,
      hasQueryToken: !!req.query.token,
      queryToken: req.query.token
        ? (req.query.token as string).substring(0, 20) + "..."
        : null,
      hasSessionToken: !!sessionToken,
      sessionTokenSource: sessionToken
        ? cookies.includes("session_token=")
          ? "cookie"
          : "query"
        : "none",
    });

    if (!sessionToken) {
      console.log("No session token found, redirecting to homepage");
      return res.redirect(302, "/api");
    }

    // Verify session token
    const decoded = await UserAuthManager.verifySessionToken(sessionToken);
    if (!decoded) {
      return res.redirect(302, "/api");
    }

    // Get user session
    const user = await UserAuthManager.getUserSession(decoded.userId);
    if (!user) {
      return res.redirect(302, "/api");
    }

    const mcpEndpoint = `https://${req.headers.host}/api/mcp`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard - Meta Ads MCP Server</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f7fafc;
            min-height: 100vh;
        }

        .header {
            background: white;
            border-bottom: 1px solid #e2e8f0;
            padding: 1rem 0;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .header-content {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .logo {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-weight: bold;
            color: #1a202c;
        }

        .logo-icon {
            width: 32px;
            height: 32px;
            background: linear-gradient(45deg, #1877f2, #42a5f5);
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 14px;
            font-weight: bold;
        }

        .user-menu {
            display: flex;
            align-items: center;
            gap: 1rem;
        }

        .user-info {
            text-align: right;
            font-size: 0.9rem;
        }

        .user-name {
            font-weight: 500;
            color: #1a202c;
        }

        .user-email {
            color: #718096;
            font-size: 0.8rem;
        }

        .logout-btn {
            background: #e53e3e;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 0.85rem;
            cursor: pointer;
            transition: all 0.2s;
        }

        .logout-btn:hover {
            background: #c53030;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
        }

        .welcome {
            background: white;
            border-radius: 12px;
            padding: 2rem;
            margin-bottom: 2rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .welcome h1 {
            color: #1a202c;
            margin-bottom: 0.5rem;
            font-size: 1.8rem;
        }

        .welcome .subtitle {
            color: #718096;
            margin-bottom: 1.5rem;
        }

        .status {
            display: flex;
            gap: 1rem;
            margin-bottom: 1rem;
        }

        .status-item {
            background: #f0fff4;
            border: 1px solid #9ae6b4;
            border-radius: 6px;
            padding: 0.5rem 1rem;
            font-size: 0.85rem;
            color: #276749;
        }

        .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2rem;
            margin-bottom: 2rem;
        }

        .card {
            background: white;
            border-radius: 12px;
            padding: 1.5rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .card h2 {
            color: #1a202c;
            margin-bottom: 1rem;
            font-size: 1.2rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .endpoint-url {
            background: #1a202c;
            color: #9ae6b4;
            padding: 1rem;
            border-radius: 6px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.85rem;
            word-break: break-all;
            margin: 1rem 0;
            position: relative;
        }

        .copy-btn {
            position: absolute;
            top: 0.5rem;
            right: 0.5rem;
            background: #4a5568;
            color: white;
            border: none;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.7rem;
            cursor: pointer;
            transition: all 0.2s;
        }

        .copy-btn:hover {
            background: #2d3748;
        }

        .config-example {
            background: #f7fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 1rem;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.8rem;
            white-space: pre-wrap;
            overflow-x: auto;
            word-break: break-all;
            max-width: 100%;
        }

        .instructions {
            background: white;
            border-radius: 12px;
            padding: 1.5rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .instructions h2 {
            color: #1a202c;
            margin-bottom: 1rem;
            font-size: 1.2rem;
        }

        .step {
            margin-bottom: 1.5rem;
            padding-left: 2rem;
            position: relative;
        }

        .step::before {
            content: counter(step-counter);
            counter-increment: step-counter;
            position: absolute;
            left: 0;
            top: 0;
            background: #4299e1;
            color: white;
            width: 1.5rem;
            height: 1.5rem;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.8rem;
            font-weight: bold;
        }

        .instructions ol {
            counter-reset: step-counter;
            list-style: none;
        }

        .step h3 {
            color: #2d3748;
            margin-bottom: 0.5rem;
            font-size: 1rem;
        }

        .step p {
            color: #4a5568;
            font-size: 0.9rem;
            line-height: 1.5;
        }

                @media (max-width: 768px) {
            .grid {
                grid-template-columns: 1fr;
            }

            .header-content {
                padding: 0 1rem;
            }

            .container {
                padding: 1rem;
            }

            .user-menu {
                flex-direction: column;
                gap: 0.5rem;
            }

            .config-example {
                font-size: 0.7rem;
                padding: 0.75rem;
            }

            .card {
                padding: 1rem;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-content">
            <div class="logo">
                <div class="logo-icon">M</div>
                Meta Ads MCP Server
            </div>
            <div class="user-menu">
                <div class="user-info">
                    <div class="user-name">${user.name}</div>
                    <div class="user-email">${user.email}</div>
                </div>
                <button class="logout-btn" onclick="logout()">Logout</button>
            </div>
        </div>
    </div>

    <div class="container">
        <div class="welcome">
            <h1>Welcome, ${user.name.split(" ")[0]}! 👋</h1>
            <p class="subtitle">Your Meta Ads MCP server is ready to use. Connect your favorite MCP client to start managing campaigns, analyzing performance, and automating your Facebook and Instagram advertising.</p>

            <div class="status">
                <div class="status-item">✅ Authenticated</div>
                <div class="status-item">🔗 Meta Account Connected</div>
                <div class="status-item">🚀 MCP Server Active</div>
            </div>
        </div>

        <div class="grid">
            <div class="card">
                <h2>🔗 Your MCP Endpoint</h2>
                <p>Use this URL in your MCP client configuration:</p>
                <div class="endpoint-url">
                    ${mcpEndpoint}
                    <button class="copy-btn" onclick="copyEndpoint()">Copy</button>
                </div>
                <p><strong>Authentication:</strong> Bearer Token Required</p>
                <p><strong>Your Token:</strong> <code>${sessionToken.substring(
                  0,
                  20
                )}...</code></p>
            </div>

            <div class="card">
                <h2>⚙️ Claude Desktop Config</h2>
                <p>Add this to your Claude Desktop MCP configuration:</p>
                <div class="config-example" style="position: relative;">
                    <button class="copy-btn" style="top: 0.5rem; right: 0.5rem;" onclick="copyConfig()">Copy</button>{
  "mcpServers": {
    "meta-ads": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${mcpEndpoint}",
        "--header",
        "Authorization:\${META_AUTH_HEADER}"
      ],
      "env": {
        "META_AUTH_HEADER": "Bearer ${sessionToken}"
      }
    }
  }
}</div>
            </div>
        </div>

        <div class="instructions">
            <h2>📚 Setup Instructions</h2>
            <ol>
                <li class="step">
                    <h3>Copy Your Configuration</h3>
                    <p>Copy the npx mcp-remote configuration above and add it to your Claude Desktop MCP settings. This approach automatically handles the connection and authentication for you.</p>
                </li>
                <li class="step">
                    <h3>Test the Connection</h3>
                    <p>Try running the <code>health_check</code> tool to verify your connection. You should see your account information and available ad accounts.</p>
                </li>
                <li class="step">
                    <h3>Explore Available Tools</h3>
                    <p>Use <code>get_capabilities</code> to see all available tools. You can manage campaigns, analyze performance, create audiences, and much more!</p>
                </li>
                <li class="step">
                    <h3>Stay Secure</h3>
                    <p>Your session token provides access to your Meta account. Keep it secure and log out when you're done. You can always re-authenticate if needed.</p>
                </li>
            </ol>
        </div>
    </div>

    <script>
        // Store session token for client-side auth checks
        localStorage.setItem('sessionToken', '${sessionToken}');

        function copyEndpoint() {
            navigator.clipboard.writeText('${mcpEndpoint}').then(() => {
                const btn = document.querySelector('.copy-btn');
                const original = btn.textContent;
                btn.textContent = 'Copied!';
                setTimeout(() => {
                    btn.textContent = original;
                }, 2000);
            });
        }

        function copyConfig() {
            const config = \`{
  "mcpServers": {
    "meta-ads": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${mcpEndpoint}",
        "--header",
        "Authorization:\\\${META_AUTH_HEADER}"
      ],
      "env": {
        "META_AUTH_HEADER": "Bearer ${sessionToken}"
      }
    }
  }
}\`;
            navigator.clipboard.writeText(config).then(() => {
                const btn = event.target;
                const original = btn.textContent;
                btn.textContent = 'Copied!';
                setTimeout(() => {
                    btn.textContent = original;
                }, 2000);
            });
        }

        async function logout() {
            try {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ${sessionToken}'
                    }
                });
                localStorage.removeItem('sessionToken');
                window.location.href = '/api';
            } catch (error) {
                alert('Logout failed: ' + error.message);
            }
        }
    </script>
</body>
</html>
    `;

    res.setHeader("Content-Type", "text/html");
    res.status(200).send(html);
  } catch (error) {
    console.error("Dashboard error:", error);
    res.redirect(302, "/api");
  }
}
