# Meta Marketing API MCP Server

A comprehensive Model Context Protocol (MCP) server that enables AI assistants like Claude to interact with Facebook/Instagram advertising data through the Meta Marketing API. This server provides full campaign lifecycle management, analytics, audience targeting, and creative optimization capabilities. 

## ⚡ Quick Start

### 1) Install
```bash
npm install -g meta-ads-mcp
```

### 2) Configure (Claude Desktop / Cursor)
Create or edit your MCP config:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

Minimal config:
```json
{
  "mcpServers": {
    "meta-ads": {
      "command": "npx",
      "args": ["-y", "meta-ads-mcp"],
      "env": {
        "META_ACCESS_TOKEN": "your_access_token_here"
      }
    }
  }
}
```

If your app requires `appsecret_proof`, add `META_APP_SECRET`:
```json
{
  "mcpServers": {
    "meta-ads": {
      "command": "npx",
      "args": ["-y", "meta-ads-mcp"],
      "env": {
        "META_ACCESS_TOKEN": "your_access_token_here",
        "META_APP_SECRET": "your_app_secret"
      }
    }
  }
}
```

### 3) Restart your client
- **Claude Desktop**: quit and reopen
- **Cursor**: restart the IDE

### 4) Verify
```bash
npm run health-check
```

## 🚀 Features

### **Campaign Management**
- ✅ Create, update, pause, resume, and delete campaigns
- ✅ Support for all campaign objectives (traffic, conversions, awareness, etc.)
- ✅ Budget management and scheduling
- ✅ Ad set creation with advanced targeting
- ✅ Individual ad management

### **Analytics & Reporting**
- 📊 Performance insights with customizable date ranges
- 📈 Multi-object performance comparison
- 📋 Data export in CSV/JSON formats
- 🎯 Attribution modeling and conversion tracking
- 📅 Daily performance trends analysis

### **Audience Management**
- 👥 Custom audience creation and management
- 🎯 Lookalike audience generation
- 📏 Audience size estimation
- 🔍 Targeting recommendations and insights
- 🏥 Audience health monitoring

### **Creative Management**
- 🎨 Ad creative creation and management
- 👁️ Cross-platform ad previews
- 🧪 A/B testing setup and guidance
- 📸 Creative performance analysis

### **Enterprise Features**
- 🔐 Secure OAuth 2.0 authentication
- ⚡ Automatic rate limiting with exponential backoff
- 🔄 Pagination support for large datasets
- 🛡️ Comprehensive error handling
- 📚 Rich MCP resources for contextual data access
- 🌐 Multi-account support

## 📦 Installation & Setup

### Option 1: Direct Installation (Recommended)
```bash
npm install -g meta-ads-mcp
```

### Option 2: From Source
```bash
git clone https://github.com/wipsoft/meta-mcp.git
cd meta-ads-mcp
npm install
npm run build
```

### Option 3: Automated Setup (Easiest)
```bash
# Clone the repository first
git clone https://github.com/wipsoft/meta-mcp.git
cd meta-ads-mcp

# Run the interactive setup
npm run setup
```

The setup script will:
- ✅ Check system requirements
- ✅ Validate your Meta access token
- ✅ Create Claude Desktop configuration
- ✅ Install dependencies
- ✅ Test the connection

## 🔧 Configuration Guide

### Step 1: Get Meta Access Token
1. Create a Meta App at [developers.facebook.com](https://developers.facebook.com/)
2. Add Marketing API product
3. Generate an access token with `ads_read` and `ads_management` permissions
4. If your app requires `appsecret_proof`, set `META_APP_SECRET` (see below)
5. (Optional) Set up OAuth for automatic token refresh

![CleanShot 2025-06-17 at 15 52 35@2x](https://github.com/user-attachments/assets/160a260f-8f1b-44de-9041-f684a47e4a9d)

### Step 2: Configure Claude Desktop

#### Find your configuration file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

If the file doesn't exist, create it with the following content:

#### Basic Configuration (Token-based):
```json
{
  "mcpServers": {
    "meta-ads": {
      "command": "npx",
      "args": ["-y", "meta-ads-mcp"],
      "env": {
        "META_ACCESS_TOKEN": "your_access_token_here"
      }
    }
  }
}
```

#### Advanced Configuration (with OAuth + appsecret_proof):
```json
{
  "mcpServers": {
    "meta-ads": {
      "command": "npx",
      "args": ["-y", "meta-ads-mcp"],
      "env": {
        "META_ACCESS_TOKEN": "your_access_token_here",
        "META_APP_ID": "your_app_id",
        "META_APP_SECRET": "your_app_secret",
        "META_AUTO_REFRESH": "true",
        "META_BUSINESS_ID": "your_business_id"
      }
    }
  }
}
```

#### Local Development Configuration:
If you've cloned the repository locally:
```json
{
  "mcpServers": {
    "meta-ads": {
      "command": "node",
      "args": ["/absolute/path/to/meta-ads-mcp/build/index.js"],
      "env": {
        "META_ACCESS_TOKEN": "your_access_token_here"
      }
    }
  }
}
```

### Step 3: Configure for Cursor

Cursor uses the same MCP configuration as Claude Desktop. Add the configuration to your Cursor settings:

1. Open Cursor Settings
2. Go to "Extensions" > "Claude"
3. Add the MCP server configuration in the JSON settings

### Step 4: Restart Your Client
- **Claude Desktop**: Completely quit and restart the application
- **Cursor**: Restart the IDE

### Step 5: Verify Setup
```bash
# Run health check to verify everything is working
npm run health-check
```

## 🔍 Troubleshooting

### Common Issues

#### 1. "Command not found" or "npx" errors
```bash
# Install Node.js if not installed
# macOS: brew install node
# Windows: Download from nodejs.org
# Linux: Use your package manager

# Verify installation
node --version
npm --version
npx --version
```

#### 2. Permission errors
```bash
# Fix npm permissions (macOS/Linux)
sudo chown -R $(whoami) $(npm config get prefix)/{lib/node_modules,bin,share}

# Or install without sudo
npm config set prefix ~/.npm-global
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

#### 3. Meta API connection issues
```bash
# Test your token manually
curl -G \
  -d "access_token=YOUR_ACCESS_TOKEN" \
  "https://graph.facebook.com/v23.0/me/adaccounts"
```
If the response says `appsecret_proof` is required, set `META_APP_SECRET` in your MCP server environment.

#### 4. Check Claude Desktop logs
- **macOS**: `~/Library/Logs/Claude/mcp*.log`
- **Windows**: `%APPDATA%\Claude\logs\mcp*.log`

```bash
# macOS/Linux - View logs
tail -f ~/Library/Logs/Claude/mcp*.log

# Windows - View logs
type "%APPDATA%\Claude\logs\mcp*.log"
```

#### 5. Test the server manually
```bash
# Test the MCP server directly
npx -y meta-ads-mcp

# Or if installed locally
node build/index.js
```

### Debug Mode
Enable debug logging by adding to your environment:
```json
{
  "mcpServers": {
    "meta-ads": {
      "command": "npx",
      "args": ["-y", "meta-ads-mcp"],
      "env": {
        "META_ACCESS_TOKEN": "your_access_token_here",
        "META_MCP_DEBUG": "1",
        "NODE_ENV": "development"
      }
    }
  }
}
```

## 🌐 Web Deployment (Vercel)

For web applications, you can deploy this server to Vercel and expose an HTTP MCP endpoint:

### Configuration:
1. Deploy to Vercel
2. Set environment variables in Vercel dashboard
3. Configure OAuth app in Meta Developer Console
4. Use the web endpoint: `https://your-project.vercel.app/api/mcp`

### MCP Client Configuration for Web:
```json
{
  "mcpServers": {
    "meta-ads-remote": {
      "url": "https://your-project.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer your_session_token"
      }
    }
  }
}
```

**Note**: You need to authenticate against your deployment to get a session token.

### Remote MCP Configuration (mcp-remote)
For Vercel deployments, use `mcp-remote` to bridge HTTP to stdio:
```json
{
  "mcpServers": {
    "meta-ads": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://your-project.vercel.app/api/mcp",
        "--header",
        "Authorization:${META_AUTH_HEADER}"
      ],
      "env": {
        "META_AUTH_HEADER": "Bearer your_session_token_here"
      }
    }
  }
}
```

## 🛠️ Available Tools

This MCP server provides **25 comprehensive tools** across all major Meta advertising categories:

### 📊 Analytics & Insights (3 tools)
- **`get_insights`** - Get detailed performance metrics (impressions, clicks, ROAS, CTR, CPC, etc.)
- **`compare_performance`** - Side-by-side performance comparison of multiple campaigns/ads
- **`export_insights`** - Export performance data in JSON or CSV formats

### 📈 Campaign Management (4 tools)
- **`create_campaign`** - Create new advertising campaigns with full configuration (includes special_ad_categories)
- **`update_campaign`** - Modify existing campaigns (name, budget, status, etc.)
- **`pause_campaign`** - Pause active campaigns
- **`resume_campaign`** - Resume/activate paused campaigns

### 🎯 Ad Set Management (2 tools)
- **`create_ad_set`** - Create ad sets with detailed targeting, budgets, and optimization goals
- **`list_ad_sets`** - List and filter ad sets within campaigns

### 📱 Ad Management (2 tools)
- **`create_ad`** - Create individual ads within ad sets using creative IDs
- **`list_ads`** - List and filter ads by ad set, campaign, or account

### 👥 Audience Management (4 tools)
- **`list_audiences`** - List all custom audiences for an account
- **`create_custom_audience`** - Create custom audiences from various sources
- **`create_lookalike_audience`** - Generate lookalike audiences from source audiences
- **`get_audience_info`** - Get detailed information about specific audiences

### 🎨 Creative Management (2 tools)
- **`list_ad_creatives`** - List all ad creatives for an account
- **`create_ad_creative`** - Create new ad creatives with rich specifications (supports external image URLs)

### 🔧 Account & Basic Tools (3 tools)
- **`health_check`** - Comprehensive authentication and server status check
- **`get_ad_accounts`** - List accessible Meta ad accounts
- **`get_campaigns`** - List campaigns with filtering options

### 🔐 Authentication Tools (1 tool)
- **`get_token_info`** - Token validation and information retrieval

### 🩺 Diagnostic Tools (2 tools)
- **`diagnose_campaign_readiness`** - Check campaign status and identify ad set creation issues
- **`check_account_setup`** - Comprehensive account validation and setup verification

## 🛠️ Usage Examples

### Test the Connection
```
Check the health of the Meta Marketing API server and authentication status
```

### Analytics & Performance Insights  
```
Get detailed performance insights for my Deal Draft campaign including impressions, clicks, ROAS, and CTR for the last 30 days
```
```
Compare the performance of my top 3 campaigns side-by-side for the last quarter
```
```
Export campaign performance data for all my campaigns last month in CSV format
```

### Campaign Management
```
Create a new traffic campaign named "Holiday Sale 2024" with a $50 daily budget and OUTCOME_TRAFFIC objective
```
```
Update my existing campaign budget to $100 daily and change the name to "Black Friday Special"
```
```
Pause all campaigns that have a CPC above $2.00
```
```
Resume my paused "Summer Collection" campaign
```

### Complete Campaign Setup (Campaign → Ad Set → Ads)
```
Create a complete "Test 3" campaign setup: 1) Create the campaign with OUTCOME_LEADS objective, 2) Create an ad set targeting US users aged 25-45 interested in entrepreneurship, 3) Create 4 different ads using my existing creatives
```
```
Create an ad set for my existing campaign targeting women aged 30-50 in major US cities with interests in business and personal development
```
```
Create a new ad in my ad set using creative ID 123456 and name it "Headline Test A"
```

### Troubleshooting & Diagnostics
```
Diagnose my "Test 3" campaign to see if it's ready for ad set creation and identify any potential issues
```
```
Check my account setup to verify payment methods, business verification, and ad account permissions
```
```
Check why my ad set creation failed and get specific recommendations for my account setup
```

### Audience Management
```
List all my custom audiences and show their sizes and status
```
```
Create a custom audience named "Website Visitors" from people who visited my site
```
```
Create a 5% lookalike audience based on my "High Value Customers" audience targeting the US
```
```
Get detailed information about my "Newsletter Subscribers" audience including health status
```

### Creative Management
```
List all my ad creatives and show their performance data
```
```
Create a new ad creative for my holiday campaign with external image URL from my website and specific messaging
```

### Account Management
```
Show me all my accessible Meta ad accounts with their currencies and time zones
```
```
Get my current access token information including permissions and expiration
```

## 📚 Resources Access

The server provides rich contextual data through MCP resources:

- `meta://campaigns/{account_id}` - Campaign overview
- `meta://insights/account/{account_id}` - Performance dashboard
- `meta://audiences/{account_id}` - Audience insights
- `meta://audience-health/{account_id}` - Audience health report

## 🔧 Environment Variables

### Required
```bash
META_ACCESS_TOKEN=your_access_token_here
```

### Optional
```bash
META_APP_ID=your_app_id                    # For OAuth
META_APP_SECRET=your_app_secret            # For OAuth
META_BUSINESS_ID=your_business_id          # For business-specific operations
META_API_VERSION=v23.0                     # API version (default: v23.0)
META_API_TIER=standard                     # 'development' or 'standard'
META_AUTO_REFRESH=true                     # Enable automatic token refresh
META_REFRESH_TOKEN=your_refresh_token      # For token refresh
META_MCP_REQUEST_TIMEOUT_MS=30000          # Request timeout in ms (0 to disable)
META_MCP_DEBUG=1                           # Enable verbose MetaApiClient debug logs
```

## 📖 Documentation

- **All documentation is in this README** (setup, configuration, and tools)
- **[Example Configuration](examples/claude_desktop_config.json)** - Sample configuration file

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Claude AI     │◄──►│ MCP Server       │◄──►│ Meta Marketing  │
│                 │    │                  │    │ API             │
│ - Natural       │    │ - Authentication │    │                 │
│   Language      │    │ - Rate Limiting  │    │ - Campaigns     │
│ - Tool Calls    │    │ - Error Handling │    │ - Analytics     │
│ - Resource      │    │ - Data Transform │    │ - Audiences     │
│   Access        │    │ - Pagination     │    │ - Creatives     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Core Components

- **Meta API Client**: Handles authentication, rate limiting, and API communication
- **Tool Handlers**: 25 tools covering analytics, campaigns, ad sets, ads, audiences, creatives, and diagnostics
- **Resource Providers**: Contextual data access for AI understanding
- **Error Management**: Robust error handling with automatic retries
- **Rate Limiter**: Intelligent rate limiting with per-account tracking

## 🔒 Security & Best Practices

### Token Security
- ✅ Environment variable configuration
- ✅ No token logging or exposure
- ✅ Automatic token validation
- ✅ Secure credential management

### API Management
- ✅ Rate limit compliance
- ✅ Exponential backoff retries
- ✅ Request validation
- ✅ Error boundary protection

### Data Privacy
- ✅ Meta data use policy compliance
- ✅ No persistent data storage
- ✅ Secure API communication
- ✅ Audit trail support

## ⚡ Performance

### Rate Limits
- **Development Tier**: 60 API calls per 5 minutes
- **Standard Tier**: 9000 API calls per 5 minutes
- **Automatic Management**: Built-in rate limiting and retry logic

### Optimization
- 🚀 Concurrent request processing
- 📦 Efficient pagination handling
- 🎯 Smart data caching
- ⚡ Minimal memory footprint

## 🧪 Testing

Run the test suite:
```bash
npm test
```

Test with example client:
```bash
npx tsx examples/client-example.ts
```

Health check:
```bash
# In Claude:
Check the health of the Meta Marketing API server
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Make your changes and add tests
4. Run the test suite: `npm test`
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🆘 Support

- **Documentation**: See this README
- **Issues**: Open an issue on GitHub
- **Meta API**: Refer to [Meta Marketing API docs](https://developers.facebook.com/docs/marketing-apis/)
- **MCP Protocol**: See [Model Context Protocol specification](https://modelcontextprotocol.io/)

---

Built for reliable Meta Marketing API automation with MCP.
