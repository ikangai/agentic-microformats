# Proposed Improvements to Agentic Microformats

**Version:** 0.2.0 Proposals  
**Date:** February 2026  
**Status:** Draft for Discussion

---

## Overview

This document proposes specific enhancements to address the critical gaps identified in critical-analysis.md. Each proposal includes:
- **Problem statement**
- **Proposed solution** with concrete syntax
- **Example implementation**
- **Backward compatibility considerations**

---

## Proposal 1: Asynchronous Operation Support

### Problem
Many real-world operations are asynchronous (file uploads, report generation, batch jobs). The current spec assumes synchronous request/response.

### Solution

#### 1.1 Async Action Declaration

```html
<button data-agent="action"
        data-agent-name="generate_report"
        data-agent-async="true"
        data-agent-async-mode="poll"
        data-agent-status-endpoint="/api/jobs/{job_id}/status"
        data-agent-poll-interval="5000">
  Generate Report
</button>
```

**New Attributes:**

| Attribute | Required | Description |
|-----------|----------|-------------|
| `data-agent-async` | Cond. | `true` if action is async |
| `data-agent-async-mode` | RECOMMENDED | `poll`, `websocket`, or `webhook` |
| `data-agent-status-endpoint` | RECOMMENDED | URL to poll for status |
| `data-agent-poll-interval` | OPTIONAL | Polling interval in ms (default: 5000) |
| `data-agent-poll-max` | OPTIONAL | Max polling attempts |
| `data-agent-callback-endpoint` | OPTIONAL | Webhook URL for notifications |

#### 1.2 Job Status Response Format

The status endpoint returns:

```json
{
  "job_id": "job-12345",
  "action": "generate_report",
  "status": "processing",
  "progress": {
    "percent": 45,
    "current_step": 3,
    "total_steps": 7,
    "step_name": "Aggregating data"
  },
  "started_at": "2026-02-02T10:00:00Z",
  "estimated_completion": "2026-02-02T10:05:00Z",
  "result_endpoint": "/api/jobs/job-12345/result",
  "cancel_endpoint": "/api/jobs/job-12345/cancel"
}
```

**Status Values:**
- `pending` - Queued, not started
- `processing` - Currently executing
- `completed` - Success, result available
- `failed` - Execution failed
- `cancelled` - Cancelled by user
- `timeout` - Exceeded max polling

#### 1.3 Async Progress Display

HTML can show progress:

```html
<div data-agent="async-job"
     data-agent-job-id="job-12345"
     data-agent-status="processing">
  
  <div data-agent-prop="progress.percent" 
       data-agent-typehint="integer">45</div>% complete
  
  <div data-agent-prop="progress.step_name">Aggregating data</div>
  
  <progress data-agent-prop="progress.percent" 
            max="100" value="45"></progress>
  
  <button data-agent="action"
          data-agent-name="cancel_job"
          data-agent-target="job-12345"
          data-agent-method="POST"
          data-agent-endpoint="/api/jobs/job-12345/cancel"
          data-agent-reversible="true">
    Cancel
  </button>
</div>
```

---

## Proposal 2: Batch and Multi-Action Support

### Problem
Agents need to execute multiple actions atomically or as a sequence.

### Solution

#### 2.1 Batch Action Container

```html
<div data-agent="batch"
     data-agent-batch-id="batch-001"
     data-agent-atomic="true"
     data-agent-rollback="true">
  
  <button data-agent="action"
          data-agent-name="update_status"
          data-agent-batch-order="1"
          data-agent-rollback-action="revert_status">
    Update Status
  </button>
  
  <button data-agent="action"
          data-agent-name="send_notification"
          data-agent-batch-order="2"
          data-agent-condition="previous.success">
    Send Notification
  </button>
</div>
```

**Batch Attributes:**

| Attribute | Description |
|-----------|-------------|
| `data-agent="batch"` | Declares batch container |
| `data-agent-atomic` | All succeed or all fail |
| `data-agent-rollback` | Support rollback on failure |
| `data-agent-parallel` | Execute actions in parallel |
| `data-agent-max-failures` | Allow N failures before abort |

**Action-in-Batch Attributes:**

| Attribute | Description |
|-----------|-------------|
| `data-agent-batch-order` | Execution sequence (1, 2, 3...) |
| `data-agent-condition` | Condition for execution |
| `data-agent-rollback-action` | Action to call on rollback |

#### 2.2 Conditional Logic

```html
<button data-agent="action"
        data-agent-name="ship_order"
        data-agent-condition="resource.status == 'paid' AND resource.inventory > 0">
  Ship Order
</button>
```

**Condition Operators:**
- Comparison: `==`, `!=`, `<`, `>`, `<=`, `>=`
- Logical: `AND`, `OR`, `NOT`
- Pattern: `resource.{prop} {op} {value}`
- Exists: `HAS resource.{prop}`

---

## Proposal 3: Structured Error Recovery

### Problem
HTTP codes are insufficient; agents need semantic error information.

### Solution

#### 3.1 Error Response Format

```json
{
  "error": {
    "code": "INSUFFICIENT_INVENTORY",
    "category": "business_rule",
    "severity": "blocking",
    "message": "Cannot add 5 items. Only 3 available.",
    "retryable": false,
    "remediation": {
      "type": "adjust_quantity",
      "suggested_value": 3,
      "action": "add_to_cart"
    },
    "details": {
      "requested": 5,
      "available": 3,
      "product_id": "SKU-123"
    }
  }
}
```

#### 3.2 Error Categories

| Category | Description | Examples |
|----------|-------------|----------|
| `validation` | Input invalid | Missing field, wrong format |
| `authentication` | Auth failure | Token expired, invalid credentials |
| `authorization` | Permission denied | Insufficient privileges |
| `business_rule` | Business logic violation | Out of stock, duplicate entry |
| `resource` | Resource issues | Not found, conflict |
| `system` | System error | Timeout, unavailable |
| `rate_limit` | Rate limiting | Too many requests |

#### 3.3 Error Display in HTML

```html
<div data-agent="error"
     data-agent-error-for="add_to_cart"
     data-agent-error-code="INSUFFICIENT_INVENTORY"
     data-agent-error-category="business_rule"
     data-agent-retryable="false">
  
  <span data-agent-prop="error.message">Only 3 items available</span>
  
  <button data-agent="action"
          data-agent-name="adjust_and_add"
          data-agent-error-remediation="true"
          data-agent-suggested-quantity="3">
    Add 3 instead
  </button>
</div>
```

---

## Proposal 4: Parameter Validation Metadata

### Problem
Agents need rich validation info to provide good UX.

### Solution

#### 4.1 Extended Parameter Annotations

```html
<input data-agent-param="email"
       data-agent-typehint="email"
       data-agent-validation='{
         "required": true,
         "pattern": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
         "pattern_message": "Please enter a valid email address",
         "unique": true,
         "unique_endpoint": "/api/check-email"
       }'
       required>

<input data-agent-param="quantity"
       data-agent-typehint="integer"
       data-agent-validation='{
         "min": 1,
         "max": 100,
         "step": 1,
         "required_message": "Quantity is required",
         "min_message": "Must order at least 1 item",
         "max_message": "Maximum 100 items per order"
       }'
       type="number" min="1" max="100" required>

<input data-agent-param="password"
       data-agent-typehint="string"
       data-agent-validation='{
         "min_length": 8,
         "max_length": 128,
         "pattern": "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}$",
         "pattern_message": "Password must contain uppercase, lowercase, and number",
         "strength_check": true,
         "strength_endpoint": "/api/check-password-strength"
       }'
       type="password" required>
```

#### 4.2 Cross-Field Validation

```html
<form data-agent="action"
      data-agent-validation='{
        "rules": [
          {
            "type": "match",
            "fields": ["password", "password_confirm"],
            "message": "Passwords must match"
          },
          {
            "type": "dependency",
            "if_field": "country",
            "if_value": "US",
            "then_field": "state",
            "then_required": true,
            "message": "State is required for US addresses"
          }
        ]
      }'>
```

---

## Proposal 5: Workflow State Management

### Problem
Multi-step processes need explicit state tracking.

### Solution

#### 5.1 Workflow Resource

```html
<div data-agent="resource"
     data-agent-type="workflow"
     data-agent-id="checkout-flow"
     data-agent-workflow='{
       "steps": [
         {"id": "shipping", "name": "Shipping Address", "order": 1, "status": "completed"},
         {"id": "payment", "name": "Payment Method", "order": 2, "status": "current"},
         {"id": "review", "name": "Review Order", "order": 3, "status": "pending"},
         {"id": "confirmation", "name": "Confirmation", "order": 4, "status": "locked"}
       ],
       "current_step": "payment",
       "completed_steps": ["shipping"],
       "available_steps": ["payment"],
       "locked_steps": ["review", "confirmation"]
     }'>
  
  <ol data-agent="workflow-steps">
    <li data-agent-step="shipping" 
        data-agent-step-status="completed"
        data-agent-step-order="1">
      ✓ Shipping Address
    </li>
    <li data-agent-step="payment" 
        data-agent-step-status="current"
        data-agent-step-order="2">
      → Payment Method
    </li>
    ...
  </ol>
  
  <div data-agent-step-content="payment">
    <!-- Payment form -->
  </div>
</div>
```

#### 5.2 Step Prerequisites

```html
<button data-agent="action"
        data-agent-name="go_to_review"
        data-agent-requires-steps="shipping,payment"
        data-agent-requires-all="true">
  Continue to Review
</button>
```

---

## Proposal 6: State Change Notifications

### Problem
Agents need to react to resource changes without polling.

### Solution

#### 6.1 WebSocket Subscription

```html
<script type="application/json" data-agent-meta>
{
  "subscriptions": {
    "websocket": {
      "endpoint": "wss://api.example.com/subscribe",
      "protocol": "agentic-v1"
    }
  }
}
</script>
```

#### 6.2 Resource-Level Subscriptions

```html
<div data-agent="resource"
     data-agent-type="order"
     data-agent-id="ORD-789"
     data-agent-subscribe="true"
     data-agent-subscribe-events="status_changed,payment_received,shipped">
  ...
</div>
```

#### 6.3 Server-Sent Events (SSE)

```html
<div data-agent="resource"
     data-agent-type="order"
     data-agent-id="ORD-789"
     data-agent-sse-endpoint="/api/orders/ORD-789/events"
     data-agent-sse-events="status,payment,shipping">
```

---

## Proposal 7: Improved Discovery

### Problem
Site capability discovery is currently unstructured.

### Solution

#### 7.1 Agent Manifest

```html
<script type="application/json" data-agent-meta>
{
  "manifest": {
    "version": "0.2.0",
    "resources": [
      {
        "type": "product",
        "url_pattern": "/products/*",
        "actions": ["view", "add_to_cart", "add_to_wishlist"]
      },
      {
        "type": "order",
        "url_pattern": "/orders/*",
        "actions": ["view", "cancel", "track"]
      }
    ],
    "entry_points": [
      {"name": "Product Catalog", "url": "/products"},
      {"name": "User Dashboard", "url": "/dashboard"},
      {"name": "Order History", "url": "/orders"}
    ],
    "capabilities": [
      "async_operations",
      "batch_actions",
      "webhooks"
    ]
  }
}
</script>
```

#### 7.2 Resource Type Registry

```html
<script type="application/json" data-agent-meta>
{
  "resource_types": {
    "product": {
      "properties": ["name", "price", "availability"],
      "actions": ["add_to_cart", "add_to_wishlist"],
      "states": ["in_stock", "out_of_stock", "discontinued"]
    },
    "order": {
      "properties": ["status", "total", "items"],
      "actions": ["cancel", "track"],
      "states": ["pending", "processing", "shipped", "delivered", "cancelled"]
    }
  }
}
</script>
```

---

## Proposal 8: Enhanced Security

### Problem
Current trust model is too simple for production.

### Solution

#### 8.1 Capability-Based Access

```html
<button data-agent="action"
        data-agent-name="delete_user"
        data-agent-requires-capabilities="user:delete,admin:full"
        data-agent-requires-all="false">
  Delete User
</button>
```

#### 8.2 Data Sensitivity Labels

```html
<div data-agent="resource"
     data-agent-type="user"
     data-agent-sensitivity="pii"
     data-agent-gdpr-category="personal_data">
  
  <span data-agent-prop="ssn"
         data-agent-sensitivity="high"
         data-agent-encryption="required"
         data-agent-mask-display="true">
    ***-**-1234
  </span>
</div>
```

#### 8.3 Audit Trail Support

```html
<button data-agent="action"
        data-agent-name="transfer_funds"
        data-agent-audit-level="full"
        data-agent-audit-retention="7_years"
        data-agent-requires-justification="true">
  Transfer
</button>
```

---

## Proposal 9: Confirmation Patterns

### Problem
High-risk actions need standardized confirmation dialogs.

### Solution

#### 9.1 Confirmation Template

```html
<button data-agent="action"
        data-agent-name="delete_account"
        data-agent-risk="high"
        data-agent-reversible="false"
        data-agent-confirmation='{
          "title": "Delete Account?",
          "message": "This will permanently delete your account and all data. This cannot be undone.",
          "confirm_label": "Yes, Delete My Account",
          "cancel_label": "Keep My Account",
          "dangerous": true,
          "require_type": "DELETE",
          "show_impact": true,
          "impact_summary": {
            "data_loss": "All saved items, history, and preferences",
            "subscriptions": "All active subscriptions will be cancelled",
            "recovery": "Account cannot be recovered"
          }
        }'>
  Delete Account
</button>
```

---

## Proposal 10: Caching and Rate Limiting

### Problem
Agents need caching and rate limit guidance.

### Solution

#### 10.1 Cache Hints

```html
<div data-agent="resource"
     data-agent-type="product"
     data-agent-id="SKU-123"
     data-agent-cacheable="true"
     data-agent-cache-ttl="3600"
     data-agent-etag="abc123"
     data-agent-last-modified="2026-02-01T10:00:00Z">
```

#### 10.2 Rate Limit Headers

```javascript
// Response headers
X-Agent-RateLimit-Limit: 100
X-Agent-RateLimit-Remaining: 87
X-Agent-RateLimit-Reset: 1706876400
X-Agent-RateLimit-Policy: burst:10,sustained:1/minute
```

---

## Implementation Priority

### Phase 1: Essential (P0)
- Async operations (#1)
- Structured errors (#3)
- Parameter validation (#4)

### Phase 2: Important (P1)
- Batch actions (#2)
- Workflow state (#5)
- Notifications (#6)

### Phase 3: Enhancement (P2)
- Discovery (#7)
- Enhanced security (#8)
- Confirmations (#9)
- Caching (#10)

---

## Backward Compatibility

All proposals maintain backward compatibility:

1. **New attributes** use `data-agent-*` pattern
2. **Unknown attributes** are ignored per Section 3.2
3. **Default behaviors** remain unchanged
4. **Progressive enhancement** - sites can adopt incrementally

---

*End of Proposals Document*
