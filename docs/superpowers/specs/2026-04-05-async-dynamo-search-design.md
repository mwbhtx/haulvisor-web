# Async Brute-Force Search with DynamoDB Job Queue — Design Spec

## Goal

Replace the synchronous 20-second brute-force search with an async pattern using DynamoDB as shared state. The API Lambda starts the job and returns immediately. A worker Lambda (self-invoked async) runs the brute-force and writes progress + results to DynamoDB. The frontend polls for updates and shows a progress bar.

## Why

The current sync search takes ~20 seconds, which is near the API Lambda's 30s timeout and provides no feedback to the user. The previous in-memory async attempt failed because Lambda is stateless. SSE streaming doesn't work because CloudFront buffers responses. DynamoDB solves both: it's shared state accessible from any Lambda invocation, and the worker Lambda can run up to 15 minutes independently.

---

## Architecture

```
POST /search → API Lambda → DynamoDB (create job) → Lambda self-invoke (async)
                  ↓                                        ↓
            { search_id }                          Worker runs brute-force
                                                   Writes progress every 5K pairs
                                                   Writes gzipped result on complete
                  
GET /search/:id → API Lambda → DynamoDB (read job) → { status, progress, result? }
                       ↓
                  Frontend polls every 1.5s
```

---

## DynamoDB Table: `haulvisor-search-jobs`

| Field | Type | Description |
|-------|------|-------------|
| `search_id` (PK) | String | UUID |
| `user_id` | String | Ownership check |
| `company_id` | String | Access control |
| `status` | String | `running` / `complete` / `failed` |
| `progress` | Map | `{ total_orders, pairs_total, pairs_checked, pairs_pruned, pairs_simulated, routes_found, elapsed_ms }` |
| `result` | Binary | Gzipped JSON of `RouteSearchResult` (only on complete) |
| `error` | String | Error message (only on failed) |
| `created_at` | Number | Epoch ms |
| `ttl` | Number | Epoch seconds = `created_at/1000 + 600` (10 min auto-delete) |

**Gzipped result:** A 50-route result with timelines can exceed DynamoDB's 400KB item limit. Gzipping brings it well under. The API Lambda gunzips before returning to the frontend.

**TTL:** DynamoDB's built-in TTL auto-deletes expired jobs. No cleanup code.

---

## Worker Invocation

The API Lambda async-invokes itself:

```typescript
await lambdaClient.send(new InvokeCommand({
  FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
  InvocationType: 'Event', // async — returns immediately
  Payload: JSON.stringify({
    searchJob: {
      search_id,
      company_id,
      config,        // resolved SearchConfig
      departure_ts,
      destination,
      origin_lat,
      origin_lng,
      user_settings, // for building the response origin city/state
    }
  })
}));
```

**Handler routing** in the Lambda entry point (`lambda.ts`):

```typescript
export async function handler(event) {
  if (event.searchJob) {
    return runSearchWorker(event.searchJob);
  }
  return nestHandler(event);
}
```

**Progress writes:** Every 5,000 pairs, `DynamoDB.update()` on the `progress` field only (~200 bytes).

**Result write:** On completion, one `DynamoDB.update()` with gzipped result binary + `status: complete`.

**Failure:** If the worker throws, catch at the top level and write `status: failed` + `error` to DynamoDB.

---

## API Endpoints

### `POST /routes/:companyId/search`

1. Resolve config from query params + user settings
2. Create DynamoDB job row with `status: running`
3. Async self-invoke with job payload
4. Return `{ search_id }`

### `GET /routes/:companyId/search/:searchId`

1. Read job from DynamoDB
2. If not found → 404
3. If `status: complete` → gunzip result, return `{ status, progress, result }`
4. If `status: running` → return `{ status, progress }`
5. If `status: failed` → return `{ status, progress, error }`

---

## Frontend

**Hook:** `useRouteSearch` uses POST to start + polls GET every 1.5s. Same external interface: `{ data, isLoading, isFetched, error, progress }`.

**Progress UI:** Progress bar + text in desktop and mobile views:
```
[████████░░░░░░░░░░] 45%
Checking 650,000 / 1,462,890 pairs — 42 routes found
```

**Cancellation:** When params change, POST starts a new search. The old worker keeps running but is never polled. TTL cleans up.

---

## Infrastructure Changes

### `infrastructure/dynamodb.tf`

Add the search jobs table:

```hcl
resource "aws_dynamodb_table" "search_jobs" {
  name         = "${var.project_name}-search-jobs"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "search_id"

  attribute {
    name = "search_id"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
}
```

### `infrastructure/iam.tf`

Add to the backend Lambda role:

```hcl
# Self-invoke for async search worker
{
  Effect   = "Allow"
  Action   = "lambda:InvokeFunction"
  Resource = aws_lambda_function.backend.arn
}

# Search jobs table
{
  Effect   = "Allow"
  Action   = ["dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:GetItem"]
  Resource = aws_dynamodb_table.search_jobs.arn
}
```

### `infrastructure/lambda-backend.tf`

- Bump `timeout` from `30` to `120` (worker needs time for brute-force)
- Add env var: `SEARCH_JOBS_TABLE = aws_dynamodb_table.search_jobs.name`

---

## File Changes

### Infrastructure

| File | Change |
|------|--------|
| `infrastructure/dynamodb.tf` | Add `haulvisor-search-jobs` table |
| `infrastructure/iam.tf` | Add `lambda:InvokeFunction` + DynamoDB permissions |
| `infrastructure/lambda-backend.tf` | Bump timeout to 120s, add `SEARCH_JOBS_TABLE` env var |

### Backend

| File | Action | Responsibility |
|------|--------|----------------|
| `api/src/lambda.ts` | Modify | Add search job handler routing before NestJS handler |
| `api/src/routes/search-job.dynamo.ts` | Create | DynamoDB helpers: `createJob`, `updateProgress`, `writeResult`, `getJob` |
| `api/src/routes/search-job.worker.ts` | Modify | Write progress/results to DynamoDB instead of in-memory |
| `api/src/routes/route-search.service.ts` | Modify | `startSearch()` creates DynamoDB job + async self-invoke; `getSearchResult()` reads DynamoDB + gunzips |
| `api/src/routes/routes.controller.ts` | Modify | POST to start, GET to poll |
| `api/src/routes/routes.module.ts` | Modify | Update providers |

### Frontend

| File | Action | Responsibility |
|------|--------|----------------|
| `src/core/hooks/use-routes.ts` | Modify | POST start + poll GET pattern |
| `src/features/routes/views/desktop/desktop-routes-view.tsx` | Modify | Re-add progress bar + text |
| `src/features/routes/views/mobile/mobile-routes-view.tsx` | Modify | Re-add progress text |

### No haulvisor-core changes

---

## What This Spec Does NOT Cover

- **SQS between API and worker** — Direct async Lambda invoke is simpler and sufficient. SQS adds retry/DLQ capabilities but isn't needed for a user-initiated search.
- **Result caching across searches** — Each search creates a new job. No deduplication of identical params.
- **WebSocket/SSE** — Polling at 1.5s is sufficient for a 20-60s search. Can upgrade later if needed.
- **Multiple concurrent searches per user** — New search overwrites. Old worker runs to completion but results are orphaned and TTL'd.
