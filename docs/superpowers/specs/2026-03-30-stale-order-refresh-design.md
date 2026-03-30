# Stale Order Refresh — Design Spec

## Problem

Open orders assigned to Mercer can have stale pickup dates — the dates shown in haulvisor no longer match the current values on the load board. There is no automated mechanism to detect and re-fetch these stale orders. Additionally, the admin panel has no visibility into when scrapers last ran or what they found.

## Solution

A new lightweight Lambda in `haulvisor-mercer` that runs on a 30-minute EventBridge cadence, self-gates against a per-company config, identifies open orders with past pickup dates, and pushes them to the existing order-details SQS pipeline for re-scraping. The admin panel gets two new icon-triggered popovers: one for configuring/viewing the stale refresh job, and one for viewing the last available-orders scan results.

## Architecture

### New Lambda: `stale-order-refresh`

**Location:** `haulvisor-mercer/lambdas/stale-order-refresh/`

**Trigger:** EventBridge rule — `rate(30 minutes)`

**Runtime:** Node.js 22.x (no Playwright, no container — standard zip deployment)

**Logic:**

1. Read company record from `haulvisor-companies` table using `COMPANY_ID` env var
2. Check `stale_order_refresh_config.enabled` — exit early if `false`
3. Check if current time (in configured timezone) is past `run_time` AND `last_stale_refresh.timestamp` is not already today — exit early if already ran today
4. Query `haulvisor-orders` table: `company_id = COMPANY_ID`, filter `order_status = "open"` AND `pickup_date_early < start of today (UTC)`
5. For each stale order ID, publish to SNS topic (`haulvisor-order-requests`) with message attributes `company_id` and `task_type: "fetch_order_details"`
6. Write to company record: `last_stale_refresh = { timestamp, stale_count }`

**Environment variables:**
- `COMPANY_ID` — company UUID
- `COMPANIES_TABLE` — `haulvisor-companies`
- `ORDERS_TABLE` — `haulvisor-orders`
- `SNS_ORDER_REQUESTS_TOPIC_ARN` — shared SNS topic ARN (from SSM)
- `AWS_REGION_OVERRIDE` — `us-east-1`

**IAM permissions (additions to existing Mercer role):**
- `dynamodb:Query` on `haulvisor-orders` table
- `dynamodb:GetItem`, `dynamodb:UpdateItem` on `haulvisor-companies` table
- `sns:Publish` on `haulvisor-order-requests` topic

### Available-Orders-Scraper Change

After a successful scrape, the existing `available-orders-scraper` writes a summary to the company record:

```typescript
last_available_orders_scan: {
  timestamp: string;   // ISO 8601
  total_orders: number;
  new_orders: number;
}
```

The scraper already returns `{ totalOrders, newOrders }` from `runScrape()`. This is a single DynamoDB `UpdateItem` call added after the scrape completes.

**IAM addition:** `dynamodb:UpdateItem` on `haulvisor-companies` table.

### Company Record Schema Changes

Three new fields on `haulvisor-companies`:

```typescript
// Editable via admin panel
stale_order_refresh_config: {
  enabled: boolean;
  timezone: string;    // e.g. "America/Chicago"
  run_time: string;    // HH:mm e.g. "06:00"
}

// Written by stale-order-refresh Lambda
last_stale_refresh: {
  timestamp: string;   // ISO 8601
  stale_count: number;
}

// Written by available-orders-scraper Lambda
last_available_orders_scan: {
  timestamp: string;   // ISO 8601
  total_orders: number;
  new_orders: number;
}
```

### Backend API Changes

**`PUT /companies/:companyId/data-sync-settings`** — extend the existing DTO to accept `stale_order_refresh_config` (enabled, timezone, run_time). Validation: timezone must be one of 7 US timezones, run_time must be HH:mm format.

**`GET /companies`** — already returns full company records including any new fields (no change needed).

### Admin Panel UI

Two new icon columns in the companies table:

#### Stale Refresh Icon

- Icon in company row (clock/refresh style)
- Click opens a popover containing:
  - **Toggle:** enabled/disabled
  - **Timezone dropdown:** 7 US timezones (same list as fetch schedule editor)
  - **Time picker:** HH:mm input
  - **Last run:** timestamp displayed in configured timezone, e.g. "Mar 30, 2026 6:00 AM CT"
  - **Result:** "12 stale orders queued" (or "No stale orders found" if 0, or "Never run" if no data)
  - **Save button**

#### Last Scan Icon

- Icon in company row (search/scan style)
- Click opens a read-only popover containing:
  - **Last run:** timestamp in company's fetch_schedule timezone
  - **Total orders:** count
  - **New orders:** count
  - Shows "Never run" if no data

Both popovers follow the existing pattern used by the fetch schedule editor (Popover component with form content).

### Infrastructure (Terraform)

New resources in `haulvisor-mercer/infrastructure/`:

- **Lambda function:** `haulvisor-mercer-stale-order-refresh` — Node.js 22.x, standard zip (not container), 256 MB, 60s timeout
- **EventBridge rule:** `haulvisor-mercer-stale-order-refresh-schedule` — `rate(30 minutes)`
- **IAM policy additions:** Query on orders table, GetItem/UpdateItem on companies table, SNS Publish
- **CloudWatch alarm:** Error alarm matching existing pattern

## Event Flow

```
EventBridge (30 min)
  -> stale-order-refresh Lambda
    -> reads company config (DynamoDB)
    -> checks: enabled? right time? not already ran today?
    -> queries stale open orders (DynamoDB)
    -> publishes order IDs to SNS (task_type: fetch_order_details)
    -> writes last_stale_refresh to company record
      -> SNS -> SQS (haulvisor-mercer-order-requests)
        -> order-details-scraper Lambda (existing)
          -> re-scrapes order details from Mercer
          -> pushes updated data to haulvisor API
```

## Self-Gating Logic

The Lambda runs every 30 minutes but only performs work once per day:

1. `enabled` must be `true`
2. Current time in configured timezone must be >= `run_time`
3. `last_stale_refresh.timestamp` must not be today (in configured timezone)

This means the job runs at most once per day, within 30 minutes after the configured time. No need for precise cron scheduling.

## Testing Strategy

- **Unit tests:** Self-gating logic (timezone/time checks, already-ran-today detection)
- **Unit tests:** Stale order filtering (pickup_date_early comparison)
- **Integration:** Verify SNS message format matches what order-details-scraper expects
- **Manual:** Toggle from admin panel, verify Lambda skips/runs appropriately

## Out of Scope

- Multi-company support (only Mercer uses this currently)
- Manual trigger button in admin panel
- Historical run log (just last run)
- Configurable stale threshold (hardcoded to "pickup_date_early < today")
