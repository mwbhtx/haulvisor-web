# Async DynamoDB Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the brute-force route search async with DynamoDB as shared state, so the API responds immediately and a worker Lambda runs the computation in the background while the frontend shows a live progress bar.

**Architecture:** POST creates a DynamoDB job row and async-invokes the same Lambda with a search job payload. The Lambda handler routes search jobs to the worker function, which writes progress every 5K pairs and gzipped results on completion. GET reads the job from DynamoDB. Frontend polls every 1.5s.

**Tech Stack:** TypeScript, NestJS, AWS Lambda (self-invoke), DynamoDB, Terraform, React Query

**Spec:** `docs/superpowers/specs/2026-04-05-async-dynamo-search-design.md`

---

## File Map

### Infrastructure (`/Users/matthewbennett/Documents/GitHub/haulvisor-backend/infrastructure`)

| File | Action | Responsibility |
|------|--------|----------------|
| `dynamodb.tf` | Modify | Add `haulvisor-search-jobs` table with TTL |
| `iam.tf` | Modify | Add self-invoke + search-jobs DynamoDB permissions |
| `lambda-backend.tf` | Modify | Bump timeout to 120s, add `SEARCH_JOBS_TABLE` env var |

### Backend (`/Users/matthewbennett/Documents/GitHub/haulvisor-backend/api/src`)

| File | Action | Responsibility |
|------|--------|----------------|
| `routes/search-job.dynamo.ts` | Create | DynamoDB helpers: createJob, updateProgress, writeResult, getJob |
| `routes/search-job.worker.ts` | Modify | Rewrite to use DynamoDB for progress/results instead of in-memory |
| `routes/route-search.service.ts` | Modify | startSearch() creates DynamoDB job + async self-invoke; getSearchResult() reads DynamoDB |
| `routes/routes.controller.ts` | Modify | POST to start search, GET to poll |
| `routes/routes.module.ts` | Modify | Update providers |
| `lambda.ts` | Modify | Add search job routing before NestJS handler |
| `routes/search-job.store.ts` | Delete | No longer needed (was in-memory) |

### Frontend (`/Users/matthewbennett/Documents/GitHub/haulvisor`)

| File | Action | Responsibility |
|------|--------|----------------|
| `src/core/hooks/use-routes.ts` | Modify | POST start + poll GET pattern |
| `src/features/routes/views/desktop/desktop-routes-view.tsx` | Modify | Re-add progress bar + text |
| `src/features/routes/views/mobile/mobile-routes-view.tsx` | Modify | Re-add progress text |

---

## Task 1: Infrastructure — DynamoDB table + IAM + Lambda config

**Files:**
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/infrastructure/dynamodb.tf`
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/infrastructure/iam.tf`
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/infrastructure/lambda-backend.tf`

- [ ] **Step 1: Add search-jobs DynamoDB table**

Append to the end of `infrastructure/dynamodb.tf`:

```hcl
# Search jobs table — async brute-force route search results
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

- [ ] **Step 2: Add IAM permissions for self-invoke + search-jobs table**

In `infrastructure/iam.tf`, inside the `aws_iam_role_policy.backend_lambda` policy statements array, add two new statements:

After the existing `lambda:InvokeFunction` statement for route_solver (around line 72), change it to include the backend Lambda itself:

```hcl
      {
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = [
          aws_lambda_function.route_solver.arn,
          aws_lambda_function.backend.arn,
        ]
      },
```

Add a new statement for the search-jobs table (after the distance_cache statement, around line 83):

```hcl
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
        ]
        Resource = [aws_dynamodb_table.search_jobs.arn]
      },
```

- [ ] **Step 3: Bump Lambda timeout and add env var**

In `infrastructure/lambda-backend.tf`, change the `aws_lambda_function.backend` resource:

Change `timeout = 30` to `timeout = 120`.

Add `SEARCH_JOBS_TABLE` to the environment variables block:

```hcl
      SEARCH_JOBS_TABLE             = aws_dynamodb_table.search_jobs.name
```

- [ ] **Step 4: Commit**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
git add infrastructure/dynamodb.tf infrastructure/iam.tf infrastructure/lambda-backend.tf
git commit -m "infra: add search-jobs DynamoDB table, self-invoke IAM, bump Lambda timeout to 120s"
```

---

## Task 2: Backend — DynamoDB helpers

**Files:**
- Create: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/api/src/routes/search-job.dynamo.ts`
- Delete: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/api/src/routes/search-job.store.ts`

- [ ] **Step 1: Create the DynamoDB helper module**

```typescript
// api/src/routes/search-job.dynamo.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';
import { gzipSync, gunzipSync } from 'zlib';
import type { RouteSearchResult } from '@mwbhtx/haulvisor-core';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.SEARCH_JOBS_TABLE || 'haulvisor-search-jobs';

export interface SearchProgress {
  total_orders: number;
  pairs_total: number;
  pairs_checked: number;
  pairs_pruned: number;
  pairs_simulated: number;
  routes_found: number;
  elapsed_ms: number;
}

export interface SearchJobRecord {
  search_id: string;
  user_id: string;
  company_id: string;
  status: 'running' | 'complete' | 'failed';
  progress: SearchProgress;
  result?: RouteSearchResult;
  error?: string;
  created_at: number;
}

const JOB_TTL_SECONDS = 600; // 10 minutes

export async function createJob(
  searchId: string,
  userId: string,
  companyId: string,
): Promise<void> {
  const now = Date.now();
  await client.send(new PutCommand({
    TableName: TABLE,
    Item: {
      search_id: searchId,
      user_id: userId,
      company_id: companyId,
      status: 'running',
      progress: {
        total_orders: 0,
        pairs_total: 0,
        pairs_checked: 0,
        pairs_pruned: 0,
        pairs_simulated: 0,
        routes_found: 0,
        elapsed_ms: 0,
      },
      created_at: now,
      ttl: Math.floor(now / 1000) + JOB_TTL_SECONDS,
    },
  }));
}

export async function updateProgress(
  searchId: string,
  progress: SearchProgress,
): Promise<void> {
  await client.send(new UpdateCommand({
    TableName: TABLE,
    Key: { search_id: searchId },
    UpdateExpression: 'SET progress = :p',
    ExpressionAttributeValues: { ':p': progress },
  }));
}

export async function writeResult(
  searchId: string,
  result: RouteSearchResult,
  progress: SearchProgress,
): Promise<void> {
  const gzipped = gzipSync(JSON.stringify(result));
  await client.send(new UpdateCommand({
    TableName: TABLE,
    Key: { search_id: searchId },
    UpdateExpression: 'SET #s = :s, progress = :p, result_gz = :r',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: {
      ':s': 'complete',
      ':p': progress,
      ':r': gzipped,
    },
  }));
}

export async function writeError(
  searchId: string,
  error: string,
  progress: SearchProgress,
): Promise<void> {
  await client.send(new UpdateCommand({
    TableName: TABLE,
    Key: { search_id: searchId },
    UpdateExpression: 'SET #s = :s, #e = :e, progress = :p',
    ExpressionAttributeNames: { '#s': 'status', '#e': 'error' },
    ExpressionAttributeValues: {
      ':s': 'failed',
      ':e': error,
      ':p': progress,
    },
  }));
}

export async function getJob(searchId: string): Promise<SearchJobRecord | null> {
  const resp = await client.send(new GetCommand({
    TableName: TABLE,
    Key: { search_id: searchId },
  }));
  if (!resp.Item) return null;

  const item = resp.Item;
  const record: SearchJobRecord = {
    search_id: item.search_id,
    user_id: item.user_id,
    company_id: item.company_id,
    status: item.status,
    progress: item.progress,
    created_at: item.created_at,
    error: item.error,
  };

  // Gunzip result if present
  if (item.result_gz) {
    const json = gunzipSync(Buffer.from(item.result_gz)).toString('utf-8');
    record.result = JSON.parse(json);
  }

  return record;
}
```

- [ ] **Step 2: Delete the old in-memory store**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
rm api/src/routes/search-job.store.ts
```

- [ ] **Step 3: Verify compile**

```bash
npx tsc -p api/tsconfig.json --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add api/src/routes/search-job.dynamo.ts
git rm api/src/routes/search-job.store.ts
git commit -m "feat: add DynamoDB search job helpers, remove in-memory store"
```

---

## Task 3: Backend — Rewrite worker for DynamoDB

**Files:**
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/api/src/routes/search-job.worker.ts`

- [ ] **Step 1: Rewrite the worker**

Replace the entire file. The worker is now a standalone function called directly from the Lambda handler (not through NestJS). It creates its own Postgres connection and writes progress/results to DynamoDB.

```typescript
// api/src/routes/search-job.worker.ts
import {
  RouteChain,
  RouteLeg,
  RouteSearchResult,
  MS_PER_DAY,
  haversine,
  quickNetProfit,
} from '@mwbhtx/haulvisor-core';
import {
  evaluateChain,
  type OrderRow,
  type SearchConfig,
} from './route-search.engine';
import { buildAllOrdersSql } from './route-search.sql';
import {
  updateProgress,
  writeResult,
  writeError,
  type SearchProgress,
} from './search-job.dynamo';
import { Client } from 'pg';

const PROGRESS_INTERVAL = 5000;
const MAX_ROUTES_RETURNED = 50;
const TOP_LANES_LIMIT = 20;
const ROAD_CORRECTION_FACTOR = 1.3;

export interface SearchJobPayload {
  search_id: string;
  company_id: string;
  config: SearchConfig;
  departure_ts: number;
  destination?: { lat: number; lng: number; city?: string };
  origin_lat: number;
  origin_lng: number;
  user_settings: Record<string, unknown>;
}

function orderToLeg(row: OrderRow, legNumber: number, deadheadMiles: number): RouteLeg {
  return {
    leg_number:               legNumber,
    order_id:                 row.order_id,
    origin_city:              row.origin_city,
    origin_state:             row.origin_state,
    origin_lat:               row.origin_lat,
    origin_lng:               row.origin_lng,
    destination_city:         row.dest_city,
    destination_state:        row.dest_state,
    destination_lat:          row.dest_lat,
    destination_lng:          row.dest_lng,
    pay:                      row.pay,
    miles:                    row.miles,
    trailer_type:             row.trailer_type,
    deadhead_miles:           Math.round(deadheadMiles),
    weight:                   row.weight ?? undefined,
    pickup_date_early_utc:    row.pickup_date_early_utc ?? undefined,
    pickup_date_late_utc:     row.pickup_date_late_utc ?? undefined,
    delivery_date_early_utc:  row.delivery_date_early_utc ?? undefined,
    delivery_date_late_utc:   row.delivery_date_late_utc ?? undefined,
    pickup_date_early_local:  row.pickup_date_early_local ?? undefined,
    pickup_date_late_local:   row.pickup_date_late_local ?? undefined,
    delivery_date_early_local: row.delivery_date_early_local ?? undefined,
    delivery_date_late_local:  row.delivery_date_late_local ?? undefined,
    tarp_height:              row.tarp_height ?? undefined,
    stopoffs:                 row.stopoffs ?? undefined,
  };
}

export async function runSearchWorker(payload: SearchJobPayload): Promise<void> {
  const { search_id, company_id, config, departure_ts, destination, origin_lat, origin_lng, user_settings } = payload;
  const startTime = Date.now();

  // Create a direct Postgres connection (worker runs outside NestJS)
  const pg = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });

  const progress: SearchProgress = {
    total_orders: 0,
    pairs_total: 0,
    pairs_checked: 0,
    pairs_pruned: 0,
    pairs_simulated: 0,
    routes_found: 0,
    elapsed_ms: 0,
  };

  try {
    await pg.connect();

    // Query all open orders
    const { sql, extraParams } = buildAllOrdersSql(config.driver_profile);
    const { rows: orders } = await pg.query<OrderRow>(sql, [company_id, departure_ts, ...extraParams]);

    progress.total_orders = orders.length;
    console.log(`[search-worker] ${search_id.slice(0, 8)}: ${orders.length} open orders`);

    if (orders.length === 0) {
      const { rows: companyRows } = await pg.query<{ order_url_template: string | null }>(
        'SELECT order_url_template FROM companies WHERE company_id = $1 LIMIT 1', [company_id],
      );
      const result: RouteSearchResult = {
        routes: [],
        origin: {
          city: (user_settings.home_base_city as string) || '',
          state: (user_settings.home_base_state as string) || '',
          lat: origin_lat,
          lng: origin_lng,
        },
        order_url_template: companyRows[0]?.order_url_template ?? undefined,
      };
      progress.elapsed_ms = Date.now() - startTime;
      await writeResult(search_id, result, progress);
      await pg.end();
      return;
    }

    // Compute pairs total
    progress.pairs_total = config.num_orders === 1
      ? orders.length
      : orders.length * (orders.length - 1);
    await updateProgress(search_id, progress);

    // Enumerate, prune, simulate
    const chains: RouteChain[] = [];
    const maxInterlegDh = config.max_interleg_deadhead_miles ?? 500;
    const avgDrivingHours = config.cost_settings.avg_driving_hours_per_day ?? 8;
    let lastProgressWrite = 0;

    async function maybeWriteProgress(): Promise<void> {
      progress.elapsed_ms = Date.now() - startTime;
      progress.routes_found = chains.length;
      if (progress.pairs_checked - lastProgressWrite >= PROGRESS_INTERVAL) {
        lastProgressWrite = progress.pairs_checked;
        await updateProgress(search_id, progress);
      }
    }

    if (config.num_orders === 1) {
      for (const c of orders) {
        const originDh = haversine(origin_lat, origin_lng, c.origin_lat, c.origin_lng) * ROAD_CORRECTION_FACTOR;
        const totalMiles = c.miles + originDh;
        progress.pairs_checked++;

        // Pre-sim pruning
        if (quickNetProfit(c.pay, c.miles, originDh, config.cost_per_mile) <= 0) { progress.pairs_pruned++; await maybeWriteProgress(); continue; }
        if (config.max_deadhead_pct != null && (originDh / totalMiles) * 100 > config.max_deadhead_pct) { progress.pairs_pruned++; await maybeWriteProgress(); continue; }
        if (config.min_rpm != null && c.pay / totalMiles < config.min_rpm) { progress.pairs_pruned++; await maybeWriteProgress(); continue; }
        if (config.min_daily_profit != null) {
          const qnp = quickNetProfit(c.pay, c.miles, originDh, config.cost_per_mile);
          const roughDays = Math.max(1, totalMiles / (config.avg_speed_mph * avgDrivingHours));
          if (qnp / roughDays < config.min_daily_profit) { progress.pairs_pruned++; await maybeWriteProgress(); continue; }
        }

        progress.pairs_simulated++;
        const destMiles = destination
          ? haversine(c.dest_lat, c.dest_lng, destination.lat, destination.lng) * ROAD_CORRECTION_FACTOR
          : undefined;
        const result = evaluateChain(
          [c], [originDh], destination,
          config.cost_settings, config.work_start_hour, config.work_end_hour,
          departure_ts, destMiles,
        );
        if (!result) { await maybeWriteProgress(); continue; }

        if (result.estimated_days > config.max_trip_days) { await maybeWriteProgress(); continue; }
        if (config.max_deadhead_pct != null && result.deadhead_pct > config.max_deadhead_pct) { await maybeWriteProgress(); continue; }
        if (config.min_daily_profit != null && result.daily_net_profit < config.min_daily_profit) { await maybeWriteProgress(); continue; }
        if (config.min_rpm != null && result.rate_per_mile < config.min_rpm) { await maybeWriteProgress(); continue; }

        chains.push({
          ...result,
          rank: 0,
          legs: [orderToLeg(c, 1, originDh)],
        });
        await maybeWriteProgress();
      }
    } else {
      // 2-order brute-force
      for (let i = 0; i < orders.length; i++) {
        const a = orders[i];
        const originDh = haversine(origin_lat, origin_lng, a.origin_lat, a.origin_lng) * ROAD_CORRECTION_FACTOR;

        for (let j = 0; j < orders.length; j++) {
          if (i === j) continue;
          const b = orders[j];
          progress.pairs_checked++;

          if (b.pickup_date_late_utc && a.delivery_date_early_utc && b.pickup_date_late_utc <= a.delivery_date_early_utc) { progress.pairs_pruned++; await maybeWriteProgress(); continue; }

          const interlegDh = haversine(a.dest_lat, a.dest_lng, b.origin_lat, b.origin_lng) * ROAD_CORRECTION_FACTOR;
          if (interlegDh > maxInterlegDh) { progress.pairs_pruned++; await maybeWriteProgress(); continue; }

          const totalDeadhead = originDh + interlegDh;
          const totalLoaded = a.miles + b.miles;
          const totalMiles = totalLoaded + totalDeadhead;
          const totalPay = a.pay + b.pay;

          if (quickNetProfit(totalPay, totalLoaded, totalDeadhead, config.cost_per_mile) <= 0) { progress.pairs_pruned++; await maybeWriteProgress(); continue; }
          if (config.max_deadhead_pct != null && (totalDeadhead / totalMiles) * 100 > config.max_deadhead_pct) { progress.pairs_pruned++; await maybeWriteProgress(); continue; }
          if (config.min_rpm != null && totalPay / totalMiles < config.min_rpm) { progress.pairs_pruned++; await maybeWriteProgress(); continue; }
          if (config.min_daily_profit != null) {
            const qnp = quickNetProfit(totalPay, totalLoaded, totalDeadhead, config.cost_per_mile);
            const roughDays = Math.max(1, totalMiles / (config.avg_speed_mph * avgDrivingHours));
            if (qnp / roughDays < config.min_daily_profit) { progress.pairs_pruned++; await maybeWriteProgress(); continue; }
          }

          progress.pairs_simulated++;
          const destMiles = destination
            ? haversine(b.dest_lat, b.dest_lng, destination.lat, destination.lng) * ROAD_CORRECTION_FACTOR
            : undefined;
          const result = evaluateChain(
            [a, b], [originDh, interlegDh], destination,
            config.cost_settings, config.work_start_hour, config.work_end_hour,
            departure_ts, destMiles,
          );
          if (!result) { await maybeWriteProgress(); continue; }

          if (result.estimated_days > config.max_trip_days) { await maybeWriteProgress(); continue; }
          if (config.max_deadhead_pct != null && result.deadhead_pct > config.max_deadhead_pct) { await maybeWriteProgress(); continue; }
          if (config.min_daily_profit != null && result.daily_net_profit < config.min_daily_profit) { await maybeWriteProgress(); continue; }
          if (config.min_rpm != null && result.rate_per_mile < config.min_rpm) { await maybeWriteProgress(); continue; }

          chains.push({
            ...result,
            rank: 0,
            legs: [orderToLeg(a, 1, originDh), orderToLeg(b, 2, interlegDh)],
          });
          await maybeWriteProgress();
        }
      }
    }

    // Sort and cap
    chains.sort((a, b) => b.daily_net_profit - a.daily_net_profit);

    // Tag top lanes
    const { rows: laneRows } = await pg.query<{ lane: string }>(
      `SELECT origin_state || '\u2192' || dest_state AS lane, COUNT(*)::int AS cnt
       FROM orders WHERE company_id = $1 AND opened_at >= $2
       GROUP BY lane ORDER BY cnt DESC LIMIT ${TOP_LANES_LIMIT}`,
      [company_id, new Date(Date.now() - 30 * MS_PER_DAY)],
    );
    const topLanes = new Map<string, number>();
    laneRows.forEach((r, i) => topLanes.set(r.lane, i + 1));
    for (const chain of chains) {
      for (const leg of chain.legs) {
        const laneKey = `${leg.origin_state}\u2192${leg.destination_state}`;
        const rank = topLanes.get(laneKey);
        if (rank != null) leg.lane_rank = rank;
      }
    }

    const routes = chains.slice(0, MAX_ROUTES_RETURNED).map((chain, i) => ({ ...chain, rank: i + 1 }));

    // Get company for order_url_template
    const { rows: companyRows } = await pg.query<{ order_url_template: string | null }>(
      'SELECT order_url_template FROM companies WHERE company_id = $1 LIMIT 1', [company_id],
    );

    const finalResult: RouteSearchResult = {
      routes,
      origin: {
        city: (user_settings.home_base_city as string) || '',
        state: (user_settings.home_base_state as string) || '',
        lat: origin_lat,
        lng: origin_lng,
      },
      order_url_template: companyRows[0]?.order_url_template ?? undefined,
    };

    progress.pairs_checked = config.num_orders === 1 ? orders.length : orders.length * (orders.length - 1);
    progress.routes_found = routes.length;
    progress.elapsed_ms = Date.now() - startTime;

    await writeResult(search_id, finalResult, progress);
    console.log(`[search-worker] ${search_id.slice(0, 8)}: complete — ${routes.length} routes in ${progress.elapsed_ms}ms`);

  } catch (err) {
    progress.elapsed_ms = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[search-worker] ${search_id.slice(0, 8)}: failed — ${message}`);
    await writeError(search_id, message, progress);
  } finally {
    await pg.end().catch(() => {});
  }
}
```

- [ ] **Step 2: Verify compile**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
npx tsc -p api/tsconfig.json --noEmit
```

Note: You may need to `npm install pg @types/pg` if not already installed. Check `package.json` first.

- [ ] **Step 3: Commit**

```bash
git add api/src/routes/search-job.worker.ts
git commit -m "feat: rewrite search worker to use DynamoDB for progress/results"
```

---

## Task 4: Backend — Lambda handler routing

**Files:**
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/api/src/lambda.ts`

- [ ] **Step 1: Add search job routing**

Replace the entire file:

```typescript
import { createApp } from './bootstrap';
import serverlessExpress from '@vendia/serverless-express';
import { Handler } from 'aws-lambda';
import { runSearchWorker, type SearchJobPayload } from './routes/search-job.worker';

let server: Handler;

async function bootstrap(): Promise<Handler> {
  const { app, expressApp } = await createApp();
  await app.init();
  return serverlessExpress({ app: expressApp });
}

export const handler: Handler = async (event, context, callback) => {
  // Search worker path — invoked async with job payload
  if (event.searchJob) {
    return runSearchWorker(event.searchJob as SearchJobPayload);
  }

  // Normal API path — NestJS handles HTTP requests
  server = server ?? (await bootstrap());
  return server(event, context, callback);
};
```

- [ ] **Step 2: Verify compile**

```bash
npx tsc -p api/tsconfig.json --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add api/src/lambda.ts
git commit -m "feat: add search job routing to Lambda handler"
```

---

## Task 5: Backend — Service + Controller for async search

**Files:**
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/api/src/routes/route-search.service.ts`
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/api/src/routes/routes.controller.ts`
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor-backend/api/src/routes/routes.module.ts`

- [ ] **Step 1: Rewrite route-search.service.ts**

Replace the entire file:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { SettingsService } from '../settings/settings.service';
import { RouteSearchDto } from './dto/route-search.dto';
import {
  resolveSearchConfig,
  computeDepartureTimestamp,
} from './route-search.engine';
import { createJob, getJob, type SearchJobRecord } from './search-job.dynamo';
import type { SearchJobPayload } from './search-job.worker';

const lambdaClient = new LambdaClient({});

@Injectable()
export class RouteSearchService {
  private readonly logger = new Logger(RouteSearchService.name);

  constructor(
    private readonly settingsService: SettingsService,
  ) {}

  async startSearch(
    companyId: string,
    userId: string,
    query: RouteSearchDto,
  ): Promise<{ search_id: string }> {
    const userSettings = await this.settingsService.getSettings(userId);
    const config = resolveSearchConfig(query as unknown as Record<string, unknown>, userSettings);

    const departureTs = computeDepartureTimestamp(
      query.departure_date,
      config.work_start_hour,
      config.work_end_hour,
      query.origin_lat,
      query.origin_lng,
    );

    const destination = query.destination_lat != null && query.destination_lng != null
      ? { lat: query.destination_lat, lng: query.destination_lng, city: query.destination_city }
      : undefined;

    const searchId = randomUUID();

    // Create job in DynamoDB
    await createJob(searchId, userId, companyId);

    // Async self-invoke — fire and forget
    const payload: { searchJob: SearchJobPayload } = {
      searchJob: {
        search_id: searchId,
        company_id: companyId,
        config,
        departure_ts: departureTs,
        destination,
        origin_lat: query.origin_lat,
        origin_lng: query.origin_lng,
        user_settings: {
          home_base_city: userSettings.home_base_city,
          home_base_state: userSettings.home_base_state,
        },
      },
    };

    await lambdaClient.send(new InvokeCommand({
      FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify(payload)),
    }));

    this.logger.log(`Search [${searchId.slice(0, 8)}]: started for company ${companyId}`);

    return { search_id: searchId };
  }

  async getSearchResult(searchId: string): Promise<SearchJobRecord | null> {
    return getJob(searchId);
  }
}
```

- [ ] **Step 2: Rewrite routes.controller.ts**

Replace the entire file:

```typescript
import { Controller, Get, Post, Param, Query, Req, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../auth/roles.decorator';
import { assertCompanyAccess } from '../auth/company-access.guard';
import { RequestUser } from '@mwbhtx/haulvisor-core';
import { RouteSearchService } from './route-search.service';
import { RouteSearchDto } from './dto/route-search.dto';

@Controller('routes')
export class RoutesController {
  constructor(
    private readonly routeSearchService: RouteSearchService,
  ) {}

  @Post(':companyId/search')
  @Roles('admin', 'user', 'demo')
  async startSearch(
    @Param('companyId') companyId: string,
    @Query() query: RouteSearchDto,
    @Req() req: Request & { user: RequestUser },
  ) {
    assertCompanyAccess(req.user, companyId);
    return this.routeSearchService.startSearch(companyId, req.user.userId, query);
  }

  @Get(':companyId/search/:searchId')
  @Roles('admin', 'user', 'demo')
  async getSearch(
    @Param('companyId') companyId: string,
    @Param('searchId') searchId: string,
    @Req() req: Request & { user: RequestUser },
  ) {
    assertCompanyAccess(req.user, companyId);
    const job = await this.routeSearchService.getSearchResult(searchId);
    if (!job) throw new NotFoundException('Search not found');

    return {
      status: job.status,
      progress: job.progress,
      ...(job.status === 'complete' && job.result ? { result: job.result } : {}),
      ...(job.status === 'failed' && job.error ? { error: job.error } : {}),
    };
  }
}
```

- [ ] **Step 3: Update routes.module.ts**

Replace the entire file. The service no longer needs `PostgresService` or `CompaniesService` (the worker handles DB directly):

```typescript
import { Module } from '@nestjs/common';
import { RoutesController } from './routes.controller';
import { RouteSearchService } from './route-search.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [RoutesController],
  providers: [RouteSearchService],
})
export class RoutesModule {}
```

- [ ] **Step 4: Verify compile**

```bash
npx tsc -p api/tsconfig.json --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/route-search.service.ts api/src/routes/routes.controller.ts api/src/routes/routes.module.ts
git commit -m "feat: async search with DynamoDB job + Lambda self-invoke"
```

---

## Task 6: Frontend — Hook rewrite for POST + poll

**Files:**
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor/src/core/hooks/use-routes.ts`

- [ ] **Step 1: Rewrite the hook**

Replace the entire file:

```typescript
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { fetchApi } from "@/core/services/api";
import type { RouteSearchResult } from "@mwbhtx/haulvisor-core";

export interface RouteSearchParams {
  origin_lat: number;
  origin_lng: number;
  departure_date: string;
  destination_lat?: number;
  destination_lng?: number;
  destination_city?: string;
  search_radius_miles?: number;
  max_trip_days?: number;
  num_orders?: number;
  trailer_types?: string;
  max_weight?: number;
  hazmat_certified?: boolean;
  twic_card?: boolean;
  team_driver?: boolean;
  no_tarps?: boolean;
  ignore_radius?: boolean;
  origin_radius_miles?: number;
  dest_radius_miles?: number;
  cost_per_mile?: number;
  avg_mpg?: number;
  avg_driving_hours_per_day?: number;
  work_start_hour?: number;
  work_end_hour?: number;
  max_deadhead_pct?: number;
  min_daily_profit?: number;
  min_rpm?: number;
  max_interleg_deadhead_miles?: number;
}

export interface SearchProgress {
  total_orders: number;
  pairs_total: number;
  pairs_checked: number;
  pairs_pruned: number;
  pairs_simulated: number;
  routes_found: number;
  elapsed_ms: number;
}

interface SearchPollResponse {
  status: "running" | "complete" | "failed";
  progress: SearchProgress;
  result?: RouteSearchResult;
  error?: string;
}

export function useRouteSearch(companyId: string, params: RouteSearchParams | null) {
  const [data, setData] = useState<RouteSearchResult | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetched, setIsFetched] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState<SearchProgress | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const paramsKeyRef = useRef<string>("");

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const paramsKey = params ? JSON.stringify(params) : "";

  useEffect(() => {
    if (!companyId || !params || paramsKey === paramsKeyRef.current) return;
    paramsKeyRef.current = paramsKey;

    stopPolling();
    setIsLoading(true);
    setIsFetched(false);
    setError(null);
    setProgress(null);

    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value != null) qs.set(key, String(value));
    }

    fetchApi<{ search_id: string }>(`routes/${companyId}/search?${qs.toString()}`, {
      method: "POST",
    })
      .then(({ search_id }) => {
        pollRef.current = setInterval(async () => {
          try {
            const resp = await fetchApi<SearchPollResponse>(
              `routes/${companyId}/search/${search_id}`,
            );

            setProgress(resp.progress);

            if (resp.status === "complete" && resp.result) {
              stopPolling();
              setData(resp.result);
              setIsLoading(false);
              setIsFetched(true);
            } else if (resp.status === "failed") {
              stopPolling();
              setError(new Error(resp.error || "Search failed"));
              setIsLoading(false);
              setIsFetched(true);
            }
          } catch (err) {
            stopPolling();
            setError(err instanceof Error ? err : new Error(String(err)));
            setIsLoading(false);
            setIsFetched(true);
          }
        }, 1500);
      })
      .catch((err) => {
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
        setIsFetched(true);
      });

    return () => stopPolling();
  }, [companyId, paramsKey]);

  return { data, isLoading, isFetched, error, progress };
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/core/hooks/use-routes.ts
git commit -m "feat: rewrite useRouteSearch for async POST + poll pattern"
```

---

## Task 7: Frontend — Progress bar in desktop and mobile views

**Files:**
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor/src/features/routes/views/desktop/desktop-routes-view.tsx`
- Modify: `/Users/matthewbennett/Documents/GitHub/haulvisor/src/features/routes/views/mobile/mobile-routes-view.tsx`

- [ ] **Step 1: Add progress bar to desktop view**

In `desktop-routes-view.tsx`, update the hook destructure (around line 57):

```typescript
  const { data, isLoading, isFetched, progress } = useRouteSearch(activeCompanyId ?? "", searchParams);
```

Add the progress bar just before the `<RouteList` component (inside the `{hasActiveSearch && (` block, before `<RouteList`):

```tsx
            {isLoading && progress && progress.pairs_total > 0 && (
              <div className="px-4 pt-3 pb-1 space-y-1.5">
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (progress.pairs_checked / progress.pairs_total) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Checking {progress.pairs_checked.toLocaleString()} / {progress.pairs_total.toLocaleString()} pairs
                  {progress.routes_found > 0 && ` — ${progress.routes_found} routes found`}
                </p>
              </div>
            )}
```

- [ ] **Step 2: Add progress text to mobile view**

In `mobile-routes-view.tsx`, extract progress from the hook:

```typescript
  const routeQuery = useRouteSearch(activeCompanyId ?? "", searchParams);
  const { progress } = routeQuery;
```

Add progress text where loading state is shown:

```tsx
{routeQuery.isLoading && progress && progress.pairs_total > 0 && (
  <div className="px-4 py-2 text-sm text-muted-foreground">
    Checking {progress.pairs_checked.toLocaleString()} / {progress.pairs_total.toLocaleString()} pairs
    {progress.routes_found > 0 && ` — ${progress.routes_found} routes found`}
  </div>
)}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/features/routes/views/desktop/desktop-routes-view.tsx src/features/routes/views/mobile/mobile-routes-view.tsx
git commit -m "feat: add progress bar and text to desktop/mobile views"
```

---

## Task 8: Push and deploy

- [ ] **Step 1: Push backend**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor-backend
git push origin main
```

The deploy workflow will run Terraform (creates the DynamoDB table + IAM changes) then deploy the Lambda.

- [ ] **Step 2: Wait for backend deploy to complete**

```bash
gh run list --workflow=deploy.yml --limit 1 --repo mwbhtx/haulvisor-backend
```

Wait until status shows `completed success`.

- [ ] **Step 3: Push frontend**

```bash
cd /Users/matthewbennett/Documents/GitHub/haulvisor
git push origin main
```

- [ ] **Step 4: Verify end-to-end**

Test the search in the browser. Expect:
1. Search triggers immediately (POST returns search_id)
2. Progress bar fills as pairs are checked
3. Results appear when complete
