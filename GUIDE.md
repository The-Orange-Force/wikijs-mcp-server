# End-to-End Testing Guide: wikijs-mcp-server with Azure AD OAuth

This guide walks through configuring Azure AD, running the MCP server locally, and connecting Claude Desktop — all the way to calling Wiki.js tools through Claude.

---

## Overview

The MCP server is an **OAuth 2.1 Resource Server**. It never issues tokens — it only validates them. The token flow is:

```
Claude Desktop → (Bearer token) → MCP Server → validates JWT via Azure JWKS → calls Wiki.js
```

You will need:
- An Azure AD (Microsoft Entra ID) tenant — your Microsoft 365 license gives you this
- A running Wiki.js instance with an API token
- Node.js >= 20

---

## Step 1: Register the App in Azure AD

### 1.1 Create the App Registration

1. Go to [portal.azure.com](https://portal.azure.com)
2. Navigate to **Microsoft Entra ID** → **App registrations** → **New registration**
3. Fill in:
   - **Name**: `WikiJS MCP Server` (or any name you like)
   - **Supported account types**: `Accounts in this organizational directory only (Single tenant)`
   - **Redirect URI**: Leave blank for now
4. Click **Register**
5. On the overview page, copy and save:
   - **Application (client) ID** → this is your `AZURE_CLIENT_ID`
   - **Directory (tenant) ID** → this is your `AZURE_TENANT_ID`

### 1.2 Expose an API — Define Custom Scopes

The MCP server requires three custom scopes. You must define them on the app registration.

1. In your app registration, go to **Expose an API**
2. Click **Add** next to *Application ID URI*
   - Accept the default (`api://<client-id>`) or use a custom URI
   - Click **Save**
3. Under **Scopes defined by this API**, add three scopes:

**Scope 1 — wikijs:read**
- Scope name: `wikijs:read`
- Who can consent: `Admins and users`
- Admin consent display name: `Read Wiki.js pages`
- Admin consent description: `Read and search pages in the Wiki.js instance`
- User consent display name: `Read Wiki.js pages`
- User consent description: `Read and search pages in the Wiki.js instance`
- State: **Enabled**

**Scope 2 — wikijs:write**
- Scope name: `wikijs:write`
- Who can consent: `Admins and users`
- Admin consent display name: `Write Wiki.js pages`
- Admin consent description: `Create and update pages in the Wiki.js instance`
- User consent display name: `Write Wiki.js pages`
- User consent description: `Create and update pages in the Wiki.js instance`
- State: **Enabled**

**Scope 3 — wikijs:admin**
- Scope name: `wikijs:admin`
- Who can consent: `Admins only`
- Admin consent display name: `Administer Wiki.js`
- Admin consent description: `Delete pages, manage users and groups in the Wiki.js instance`
- State: **Enabled**

### 1.3 Create a Client App Registration (for getting tokens)

The MCP server registration above is the **resource**. To obtain tokens, you need a **client** app that requests access to it. For local testing, create a second app registration (or reuse the same one with a public client flow).

1. Go to **App registrations** → **New registration**
2. Fill in:
   - **Name**: `WikiJS MCP Client` (for testing)
   - **Supported account types**: `Accounts in this organizational directory only`
   - **Redirect URI**: Platform = `Mobile and desktop applications`, URI = `http://localhost`
3. Click **Register**
4. Copy the **Application (client) ID** of this new app (the *client* app ID)
5. Go to **Authentication** for this client app:
   - Under **Advanced settings**, set **Allow public client flows** → **Yes**
   - Click **Save**
6. Go to **API permissions** → **Add a permission** → **My APIs**
   - Select the `WikiJS MCP Server` app
   - Select **Delegated permissions**: check `wikijs:read`, `wikijs:write`, `wikijs:admin`
   - Click **Add permissions**
7. Click **Grant admin consent for [your tenant]** → **Yes**

---

## Step 2: Configure the MCP Server

### 2.1 Get a Wiki.js API Token

1. Log in to your Wiki.js admin panel
2. Go to **Administration** → **API Access**
3. Create a new API key with full permissions
4. Copy the token

### 2.2 Create the .env File

```bash
cp .env.example .env
```

Edit `.env`:

```dotenv
# HTTP port
PORT=3200

# Wiki.js
WIKIJS_BASE_URL=http://localhost:3000        # Your Wiki.js URL
WIKIJS_TOKEN=your_wikijs_api_token_here      # From Step 2.1

# Azure AD — from Step 1.1
AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  # The MCP SERVER app's client ID

# MCP server public URL (used in OAuth discovery metadata)
# For local testing, use localhost
MCP_RESOURCE_URL=http://localhost:3200
```

> **Note**: `AZURE_CLIENT_ID` must be the **MCP Server** app's client ID (the resource),
> not the client testing app's ID.

### 2.3 Install Dependencies and Start the Server

```bash
npm install
npm run dev
```

You should see output like:

```
=== Server Configuration ===
  Port:             3200
  WikiJS URL:       http://localhost:3000
  Azure Tenant ID:  xxxxxxxx****
  ...
============================
```

### 2.4 Verify the Server is Running

```bash
# Health check (no auth required)
curl http://localhost:3200/health

# Expected:
# {"status":"ok","message":"Connected to Wiki.js"}

# OAuth discovery (no auth required)
curl http://localhost:3200/.well-known/oauth-protected-resource

# Expected:
# {
#   "resource": "http://localhost:3200",
#   "authorization_servers": ["https://login.microsoftonline.com/<tenant>/v2.0"],
#   "scopes_supported": ["wikijs:read","wikijs:write","wikijs:admin"],
#   "bearer_methods_supported": ["header"],
#   "resource_signing_alg_values_supported": ["RS256"]
# }
```

---

## Step 3: Get an Access Token

### Option A: Using the Azure CLI (Simplest)

If you have the [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli) installed:

```bash
# Log in (opens a browser)
az login

# Get a token for your MCP server app
# Replace <CLIENT_APP_ID> with the MCP *Client* app's ID (from Step 1.3)
# Replace <SERVER_APP_CLIENT_ID> with the MCP *Server* app's ID (from Step 1.1)
az account get-access-token \
  --resource api://<SERVER_APP_CLIENT_ID> \
  --query accessToken \
  --output tsv
```

> The `az` CLI may not support custom API scopes easily. Use Option B for full scope control.

### Option B: Device Code Flow via a Script (Recommended)

Install MSAL for Node.js in a temp directory or use this one-shot script:

```bash
npm install -g @azure/msal-node 2>/dev/null || true
```

Or run with `npx`:

```bash
# Save this as get-token.mjs and run with: node get-token.mjs
```

Create `get-token.mjs`:

```javascript
import msal from "@azure/msal-node";

const TENANT_ID = "YOUR_AZURE_TENANT_ID";
const CLIENT_APP_ID = "YOUR_CLIENT_APP_ID";          // The *client* testing app from Step 1.3
const SERVER_APP_CLIENT_ID = "YOUR_SERVER_APP_CLIENT_ID";  // The *server* app from Step 1.1

const config = {
  auth: {
    clientId: CLIENT_APP_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
  },
};

const pca = new msal.PublicClientApplication(config);

const request = {
  scopes: [
    `api://${SERVER_APP_CLIENT_ID}/wikijs:read`,
    `api://${SERVER_APP_CLIENT_ID}/wikijs:write`,
    `api://${SERVER_APP_CLIENT_ID}/wikijs:admin`,
  ],
};

const response = await pca.acquireTokenByDeviceCode({
  ...request,
  deviceCodeCallback: (response) => {
    console.log("\n=== Device Code Flow ===");
    console.log(response.message);
    console.log("========================\n");
  },
});

console.log("\nAccess token:");
console.log(response.accessToken);
```

Run it:
```bash
node get-token.mjs
```

Follow the device code instructions (visit the URL shown, enter the code). The access token will be printed.

### Option C: Browser-Based — Microsoft OAuth Playground

You can also use the [Microsoft OAuth 2.0 Playground](https://oauthplay.azurewebsites.net/) or Postman to perform an authorization code flow manually.

---

## Step 4: Test the MCP Server with curl

Set your token in an environment variable:

```bash
export TOKEN="eyJ0eX..."   # Paste the token from Step 3
```

### Test: Call a tool (list pages)

```bash
curl -s -X POST http://localhost:3200/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "list_pages",
      "arguments": { "limit": 5 }
    }
  }' | jq .
```

### Test: List available tools

```bash
curl -s -X POST http://localhost:3200/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq '.result.tools[].name'
```

### Test: Auth rejection (no token)

```bash
curl -s http://localhost:3200/mcp \
  -H "Content-Type: application/json" \
  -d '{}' | jq .

# Expected: 401 with WWW-Authenticate header and error: "invalid_token"
```

### Test: Insufficient scope

```bash
# Get a token with only wikijs:read scope (omit write/admin from the scopes list in get-token.mjs)
# Then try to call an admin tool:
curl -s -X POST http://localhost:3200/mcp \
  -H "Authorization: Bearer $READ_ONLY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": { "name": "list_users", "arguments": {} }
  }' | jq .

# Expected: 403 with error: "insufficient_scope"
```

---

## Step 5: Connect Claude Desktop

Claude Desktop supports HTTP MCP servers with Bearer token authentication via the `headers` configuration.

### 5.1 Find Your Claude Desktop Config File

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### 5.2 Add the MCP Server

Edit `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wikijs": {
      "type": "http",
      "url": "http://localhost:3200/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_ACCESS_TOKEN_HERE"
      }
    }
  }
}
```

Replace `YOUR_ACCESS_TOKEN_HERE` with the token you obtained in Step 3.

> **Token expiry**: Azure AD access tokens expire after 60–90 minutes by default. When the token expires, you will get auth errors in Claude Desktop. Re-run `get-token.mjs` to get a new token and update the config.

### 5.3 Restart Claude Desktop

Fully quit and relaunch Claude Desktop. The MCP server connection will be established on startup.

### 5.4 Verify the Connection

In Claude Desktop, open a new conversation and ask:

> "What MCP tools do you have available?"

You should see the 17 wikijs tools listed. Then try:

> "List the first 5 pages in my wiki."

If it works, you have a fully operational end-to-end OAuth-protected MCP server.

---

## Troubleshooting

### "JWKS fetch failed" (503)

The server could not reach Azure AD's JWKS endpoint. Check your network/firewall. The JWKS URL is:
```
https://login.microsoftonline.com/<TENANT_ID>/discovery/v2.0/keys
```

### "invalid_token" — token validation failed

Check that:
- `AZURE_TENANT_ID` matches your tenant (Entra ID → Overview → Tenant ID)
- `AZURE_CLIENT_ID` matches the **server** app's Application ID (not the client app)
- The token was obtained for the correct resource (`api://<SERVER_APP_CLIENT_ID>`)
- The token is not expired

Decode the JWT at [jwt.ms](https://jwt.ms) and verify:
- `aud` claim = your `AZURE_CLIENT_ID`
- `iss` claim = `https://login.microsoftonline.com/<TENANT_ID>/v2.0`
- `scp` claim includes at least one of `wikijs:read`, `wikijs:write`, `wikijs:admin`

### "insufficient_scope" (403)

The token does not contain any of the required scopes. Ensure:
- The scopes are defined on the server app (Step 1.2)
- The client app has permissions granted for those scopes (Step 1.3)
- Admin consent was granted for the scopes
- The token request includes the scopes in the `scopes` array

### Wiki.js health check fails

Verify `WIKIJS_BASE_URL` and `WIKIJS_TOKEN` in `.env`. Test directly:
```bash
curl http://localhost:3200/health
```

### Claude Desktop shows no tools

- Confirm the `claude_desktop_config.json` is valid JSON (no trailing commas)
- Confirm the token has not expired
- Check Claude Desktop logs for connection errors
- Try the curl commands in Step 4 with the same token to isolate whether it's a server or config issue

---

## Scope Reference

| Scope | Tools |
|---|---|
| `wikijs:read` | `get_page`, `get_page_content`, `list_pages`, `list_all_pages`, `search_pages`, `search_unpublished_pages`, `get_page_status` |
| `wikijs:write` | `create_page`, `update_page`, `publish_page` |
| `wikijs:admin` | `delete_page`, `force_delete_page`, `list_users`, `search_users`, `list_groups`, `create_user`, `update_user` |

For read-only access, request only `wikijs:read`. For full access, request all three scopes.
