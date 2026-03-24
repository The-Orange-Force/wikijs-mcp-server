# Testing Patterns

**Analysis Date:** 2026-03-24

## Test Framework

**Runner:**
- No unit testing framework detected (Jest, Vitest, Mocha not installed)
- No test files found in codebase (*.test.ts, *.spec.ts patterns absent)

**Manual Testing:**
- Integration test scripts in `scripts/` directory
- Shell scripts: `test.sh` (runs TypeScript directly)
- Node scripts: `test_mcp.js`, `test_mcp_stdin.js` (spawn server and verify)

**Run Commands:**
```bash
npm run test              # Runs scripts/test.sh
npm run test:http        # Runs scripts/test_mcp.js (HTTP integration test)
npm run test:stdin       # Runs scripts/test_mcp_stdin.js (stdio integration test)
npm run build            # TypeScript compilation
npm run dev              # nodemon with ts-node (development watch mode)
```

## Test File Organization

**Location:**
- No co-located test files; integration tests in separate `scripts/` directory
- Test scripts: `/scripts/test_mcp.js`, `/scripts/test_mcp_stdin.js`
- No unit test directory

**Naming:**
- Integration test scripts named with `test_` prefix: `test_mcp.js`, `test_mcp_stdin.js`

**Structure:**
```
scripts/
├── test_mcp.js           # HTTP server integration test
├── test_mcp_stdin.js     # STDIO server integration test
├── test.sh               # Bash wrapper for npm test
├── start_http.sh         # Start HTTP server
├── start_typescript.sh    # Start with ts-node
└── setup.sh              # Initial setup
```

## Test Structure

**Manual Integration Test Pattern (from `scripts/test_mcp.js`):**
```javascript
async function checkServerHealth(retries = 5, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(`http://localhost:${PORT}/health`);
      if (response.ok) {
        const data = await response.json();
        return { ok: true, status: data.status, message: data.message };
      }
    } catch (error) {
      console.log(
        `Попытка подключения ${i + 1}/${retries} не удалась: ${error.message}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return {
    ok: false,
    message: "Не удалось подключиться к серверу MCP после нескольких попыток",
  };
}

async function getTools() {
  try {
    const response = await fetch(`http://localhost:${PORT}/tools`);
    if (response.ok) {
      return await response.json();
    }
    return [];
  } catch (error) {
    console.error("Ошибка при получении инструментов:", error.message);
    return [];
  }
}
```

**Patterns:**
- Retry logic with configurable attempts and delay between retries
- Health check via HTTP endpoint before running tests
- Tool enumeration to verify MCP interface is available
- Environment variable configuration for test parameters

## Mocking

**Framework:**
- No mocking library (Sinon, Jest mocks, Vitest mocks not installed)
- Mocks not used in existing codebase

**What to Mock (for OAuth2.1 tests):**
- HTTP requests to OAuth2 provider endpoints
- Database calls for token storage/retrieval
- Environment variable access
- External Wiki.js API calls

**What NOT to Mock:**
- Zod validation schemas (test against real schema definitions)
- Error handling logic itself
- Core business logic (token validation, refresh flows)

**Recommended for Future Tests:**
Create mock pattern using `node-fetch` stubs in test utilities:
```typescript
// test-utils.ts
export function mockFetchResponse(status: number, data: any) {
  return Promise.resolve(new Response(JSON.stringify(data), { status }));
}
```

## Fixtures and Factories

**Test Data:**
- No test data factories found
- Demo data created inline in `src/demo.ts` through hardcoded simulations

**Demo Pattern from `src/demo.ts` (reference for test data structure):**
```typescript
async function simulateLLMCall(
  prompt: string,
  tools: any[]
): Promise<LLMResponse> {
  // Demonstrates tool call structure
  if (prompt.toLowerCase().includes("найди")) {
    return {
      tool_calls: [
        {
          id: "call_" + Date.now(),
          function: {
            name: "search_pages",
            arguments: JSON.stringify({ query: searchTerm }),
          },
        },
      ],
    };
  }
  // ...
}
```

**Location:**
- Demo simulations in `src/demo.ts` (lines 56-105)
- No dedicated fixtures directory

**Recommended Pattern for OAuth2.1 Tests:**
```typescript
// test-fixtures/oauth2.ts
export const mockTokenResponse = {
  access_token: "test_access_token_xyz",
  refresh_token: "test_refresh_token_abc",
  expires_in: 3600,
  token_type: "Bearer",
};

export const mockTokenValidationResult = {
  succeeded: true,
  userId: 123,
  permissions: ["read", "write"],
};
```

## Coverage

**Requirements:**
- No coverage tool configured
- No coverage targets enforced
- `tsconfig.json` excludes `**/*.spec.ts` (line 14) despite no test files existing

**View Coverage:**
- Not applicable; no test runner configured

## Test Types

**Unit Tests:**
- Not implemented
- Recommendation: Add Jest or Vitest for TypeScript unit testing
- Focus areas: Validation functions in `src/schemas.ts`, API client methods in `src/api.ts`

**Integration Tests:**
- Manual HTTP integration tests in `scripts/test_mcp.js`
- Server startup verification
- Health endpoint verification
- Tool endpoint verification
- No assertions; console output verification only

**Integration Test Flow:**
```javascript
// From scripts/test_mcp.js
1. Spawn HTTP server process
2. Retry connect to health endpoint (5 attempts, 1s delay)
3. Fetch /tools endpoint
4. Log results
5. Kill server process
```

**E2E Tests:**
- Not implemented
- STDIO test (`scripts/test_mcp_stdin.js`) demonstrates spawn + communication pattern
- Could serve as basis for E2E testing

**Current E2E Pattern (stdio):**
```javascript
process.stdin.on("data", async (chunk) => {
  inputBuffer += chunk;
  if (inputBuffer.includes("\n")) {
    const lines = inputBuffer.split("\n");
    inputBuffer = lines.pop() || "";
    for (const line of lines) {
      if (line.trim()) {
        try {
          await processRequest(line);
        } catch (error) {
          console.error(`Ошибка обработки запроса: ${error}`);
        }
      }
    }
  }
});
```

## Common Patterns

**Async Testing:**
- Manual promise-based retry loops (see `checkServerHealth`)
- Async/await used throughout
- No special async test helpers

**Example async pattern:**
```typescript
async function checkConnection(): Promise<boolean> {
  try {
    const query = `{ pages { list (limit: 1) { title } } }`;
    const response = await this.client.request(query);
    return !!response;
  } catch (error) {
    console.error("Ошибка соединения с Wiki.js:", error);
    return false;
  }
}
```

**Error Testing:**
- Try-catch blocks for error verification in manual tests
- HTTP status checking: `if (!response.ok) { throw ... }`
- Zod validation errors thrown and caught

**Validation Testing Pattern (to adopt):**
```typescript
import { safeValidateToolParams } from "../src/schemas.js";

// Good: Returns result object, doesn't throw
const result = safeValidateToolParams("create_page", {
  title: "Test",
  content: "Content",
  path: "test",
});

if (!result.success) {
  console.error("Validation failed:", result.error);
} else {
  console.log("Valid params:", result.data);
}
```

## Recommendations for OAuth2.1 Testing

**Unit Test Suite Structure:**
```typescript
// tests/oauth2.test.ts
describe("OAuth2.1 Token Validation", () => {
  it("should validate access token format", () => {
    const result = safeValidateToolParams("oauth2_token", {
      access_token: "valid_token_123",
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing access_token", () => {
    const result = safeValidateToolParams("oauth2_token", {});
    expect(result.success).toBe(false);
  });
});

describe("OAuth2 Token Refresh", () => {
  it("should refresh expired token", async () => {
    // Mock fetch for OAuth provider
    const agent = new OAuth2Agent(mockConfig);
    const newToken = await agent.refreshToken("old_token");
    expect(newToken.access_token).toBeDefined();
  });
});
```

**Integration Test Points:**
1. Token validation via `/validate_token` endpoint
2. Token refresh via `/refresh_token` endpoint
3. OAuth callback handling at `/oauth2/callback`
4. Authorization header checking on protected endpoints
5. Token expiration and automatic refresh

**Manual Testing Checklist:**
```bash
# Start server
npm run start:http

# Test token endpoint
curl -X POST http://localhost:8000/oauth2_token \
  -H "Content-Type: application/json" \
  -d '{"access_token":"test_token"}'

# Test protected endpoint
curl -H "Authorization: Bearer test_token" \
  http://localhost:8000/list_pages
```

## Current Testing Gaps

**Not Tested:**
- Individual API methods (`getPageById`, `createPage`, etc.)
- Zod schema validation logic
- Error handling edge cases
- Concurrent request handling
- Token expiration scenarios
- Invalid parameter handling

**Safe to Add Without Breaking Changes:**
- Unit tests in `tests/` directory (tsconfig already excludes *.spec.ts)
- Integration tests alongside existing scripts
- E2E test suite for OAuth2.1 flows
- Fixtures in `tests/fixtures/` directory

