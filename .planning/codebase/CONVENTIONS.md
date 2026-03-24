# Coding Conventions

**Analysis Date:** 2026-03-24

## Naming Patterns

**Files:**
- PascalCase for classes and main exports: `WikiJsApi.ts`, `WikiJsAgent.ts`
- camelCase for utilities and modules: `schemas.ts`, `types.ts`, `tools.ts`, `server.ts`, `agent.ts`, `demo.ts`
- JavaScript files in `lib/` use snake_case: `mcp_wikijs_stdin.js`, `mcp_client.js`, `fixed_mcp_http_server.js`

**Functions:**
- camelCase for all function names: `checkConnection()`, `getPageById()`, `validateToolParams()`, `safeValidateToolParams()`
- async functions follow same convention: `async checkConnection()`, `async getPageContent()`
- Constructor methods use `constructor()` (class pattern)

**Variables:**
- camelCase for all variables: `baseUrl`, `wikijsApi`, `toolName`, `WIKIJS_TOKEN`, `inputBuffer`
- UPPER_CASE for environment variable names: `PORT`, `WIKIJS_BASE_URL`, `WIKIJS_TOKEN`, `MCP_URL`
- Constants initialized from environment use camelCase: `const port = parseInt(process.env.PORT || "8000")`
- Private class properties use underscore prefix: `private baseUrl: string`, `private client: GraphQLClient`

**Types:**
- PascalCase for interfaces and types: `WikiJsPage`, `WikiJsUser`, `WikiJsGroup`, `ResponseResult`, `ServerConfig`, `WikiJsToolDefinition`
- Zod schema constants use PascalCase with "Schema" suffix: `WikiPageSchema`, `WikiUserSchema`, `CreatePageParamsSchema`
- Inferred types use camelCase derived from schema: `type WikiPage = z.infer<typeof WikiPageSchema>`

## Code Style

**Formatting:**
- No explicit formatter (no .prettierrc or .eslintrc detected)
- Uses ES module syntax: `import`/`export` (not CommonJS)
- Indentation appears to be 2 spaces
- Semicolons present throughout

**Linting:**
- TypeScript strict mode enabled: `"strict": true` in `tsconfig.json`
- Target: ES2020
- Module system: NodeNext
- No explicit linting tool configured

## Import Organization

**Order:**
1. External packages (dotenv, fastify, graphql, fetch)
2. Local type definitions: `./types.js`
3. Local API/service classes: `./api.js`
4. Local utilities: `./schemas.js`, `./tools.js`

**Path Aliases:**
- None configured; uses relative imports with `.js` extensions
- Imports from compiled `dist/` when needed in JavaScript files: `import { wikiJsTools } from "../dist/tools.js"`

**Example pattern from `src/server.ts`:**
```typescript
import fastify from "fastify";
import { WikiJsApi } from "./api.js";
import { wikiJsTools } from "./tools.js";
import { ServerConfig } from "./types.js";
import { config as dotenvConfig } from "dotenv";
```

## Error Handling

**Patterns:**
- Try-catch blocks used extensively for async operations
- Catch blocks convert errors to strings: `String(error)` or `error.message`
- HTTP error checking before JSON parsing: `if (!response.ok) { throw new Error(...) }`
- Graceful degradation: servers continue running even if external services fail (see `server.ts` line 294-301)
- Validation errors thrown with descriptive messages referencing tool names

**Example from `src/api.ts`:**
```typescript
async checkConnection(): Promise<boolean> {
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

**Example from `src/server.ts` (graceful error handling):**
```typescript
try {
  return await wikiJsApi.getPageById(parseInt(id));
} catch (error) {
  server.log.error(error);
  return { error: String(error) };
}
```

**Validation errors using Zod:**
```typescript
export function validateToolParams(toolName: string, params: any) {
  const schema = ToolParamsSchemas[toolName as keyof typeof ToolParamsSchemas];
  if (!schema) {
    throw new Error(`Схема для параметров инструмента ${toolName} не найдена`);
  }
  return schema.parse(params); // Throws ZodError if invalid
}
```

## Logging

**Framework:** `console` module and Fastify's built-in logger

**Patterns:**
- `console.log()` for informational messages
- `console.error()` for errors
- `console.warn()` for warnings with emoji prefix: `console.warn("⚠️ Message")`
- Fastify logger: `server.log.error(error)`
- Timestamp logging in lib files: `[${new Date().toISOString()}]`

**When to log:**
- Connection status checks: `console.log("Конфигурация MCP сервера:", ...)`
- Configuration at startup
- API request attempts
- Errors with context: `server.log.error(error)`
- Tool execution attempts: `console.log("[WikiJsAPI] Устанавливается заголовок Authorization.")`

## Comments

**When to Comment:**
- File headers documenting purpose (see `lib/mcp_wikijs_stdin.js` lines 1-6)
- GraphQL query explanations
- Complex logic or workarounds
- Function purpose (method-level, not statement-level)

**JSDoc/TSDoc:**
- Used in `src/schemas.ts` for validation functions:
```typescript
/**
 * Функция для валидации параметров инструмента
 * @param toolName Имя инструмента
 * @param params Параметры для валидации
 * @returns Валидированные параметры или ошибка
 */
export function validateToolParams(toolName: string, params: any) { ... }
```
- One-line JSDoc comments on Zod schemas explaining field purpose

## Function Design

**Size:**
- Utility functions range 5-50 lines
- API methods typically 10-25 lines
- Large files decomposed into logical sections (e.g., `tools.ts` with 2238 lines organized by tool definition type)

**Parameters:**
- Use destructuring in request handlers: `const { id } = request.query as { id: string }`
- Optional parameters use defaults: `limit: number = 50`, `orderBy: string = "TITLE"`
- Type narrowing with `as` keyword for request bodies and query params

**Return Values:**
- Promise types explicitly declared: `Promise<WikiJsPage>`, `Promise<boolean>`
- Tuple returns avoided; use typed objects instead
- Consistent error shape in HTTP handlers: `{ error: String(error) }`
- API methods return domain types: `WikiJsPage`, `WikiJsUser[]`

## Module Design

**Exports:**
- Named exports for types: `export interface WikiJsPage { ... }`
- Named exports for classes: `export class WikiJsApi { ... }`
- Named exports for constants: `export const wikiJsTools: WikiJsToolDefinition[] = [ ... ]`
- Named exports for validation functions: `export function validateToolParams(...)`

**Barrel Files:**
- Not used; each module exports its own types
- Imports always reference specific files: `from "./api.js"` not `from "./index.js"`

## Security & Validation Patterns (for OAuth2.1 Implementation)

**Token/Credential Handling:**
- Use environment variables: `process.env.WIKIJS_TOKEN`
- Pass via Bearer header: `Authorization: Bearer ${token}`
- Log truncated tokens for debugging: `config.wikijs.token.substring(0, 10)...` (see `server.ts` line 23)
- Never log full tokens or credentials

**Validation Pattern:**
- Use Zod schemas for input validation
- Create dedicated schema per operation type: `CreatePageParamsSchema`, `UpdatePageParamsSchema`
- Validation functions throw on failure (strict) or return `{ success: false, error: ... }` (safe)
- Result validation ensures output conforms to contract

**Example for OAuth2.1 token validation:**
```typescript
// Create in schemas.ts
export const OAuth2TokenSchema = z.object({
  access_token: z.string().min(1).describe("OAuth2 access token"),
  refresh_token: z.string().optional().describe("Refresh token"),
  expires_in: z.number().int().positive().optional().describe("Token expiration in seconds"),
});

// Use in validation
const validatedToken = safeValidateToolParams("oauth2_token", params);
if (!validatedToken.success) {
  throw new Error(`Invalid token: ${validatedToken.error}`);
}
```

**Middleware Pattern for Auth:**
- Not currently implemented; servers handle errors in route handlers
- For OAuth2.1, recommend creating auth middleware similar to error handling pattern
- Check authorization early in request flow (before database/external API calls)

**HTTP Status Patterns:**
- 200/OK for successful requests returning data
- 400/BadRequest for validation failures (implied by error object returns)
- 500/Internal Server Error via `server.log.error()` handling
- Errors returned as JSON: `{ error: String(error) }` (not HTTP status codes)

