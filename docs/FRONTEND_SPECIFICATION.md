# FRONTEND SPECIFICATION & UI/UX ARCHITECTURE
## E-Commerce CRM: Orders, Payments (Razorpay), Returns & Refunds Subsystem
**Document Version:** 1.0.0-PROD-SPEC  
**Target Milestone:** Final Academic & Industry Jury Submission (21 Nov 2026)  
**Authors:** Principal Product Engineer & Lead UI/UX Systems Architect  
**Audience:** Figma Design System Lead, Senior React Frontend Engineers, QA Automation Lead

---

## SECTION 1: DEMO SCRIPT (8 TO 12 MINUTES)

This end-to-end script outlines the chronological jury walkthrough demonstrating every state machine transition, payment gateway flow, exception path, and real-time event.

### Walkthrough Narrative Summary
1. **Phase 1: Order Placement & Online Checkout** — Presenter selects a customer, adds products, applies a coupon code, and creates an order in `PLACED` status. Presenter initiates payment via Razorpay test mode, authorizes with test card credentials, and verifies signature. Order advances to `CONFIRMED`.
2. **Phase 2: Warehouse Fulfillment Flow** — Presenter moves order sequentially through `PROCESSING`, `PACKED`, `SHIPPED` (adding courier AWB tracking), `OUT_FOR_DELIVERY`, and `DELIVERED`. Pre-shipment cancellation rules are validated.
3. **Phase 3: Return Initiation & Authorization** — Upon delivery, the 7-day return eligibility window unlocks. Presenter switches role to Support Executive to initiate a return request with line-item quantity limits and Cloudinary photo evidence. Presenter switches role to Support Manager to approve with a mandatory decision note.
4. **Phase 4: Intake & Inspection** — Return advances through `PICKUP_SCHEDULED`, `RECEIVED` (triggering the inventory restock hook), and `INSPECTED` (quality review confirmed).
5. **Phase 5: Refund Execution & Settlement** — Presenter switches role to Finance Manager to enforce separation of duties. A refund draft is created and executed through the Razorpay refund gateway. Order status reflects `PARTIALLY_REFUNDED` / `REFUNDED`. Invoice print view is displayed.

### Chronological Step-by-Step Script

| Step # | Time | Actor / Role | Screen / View | User Action | API Calls Fired (Method + Path) | Socket.IO Event | Expected UI Result & State Change |
|---|---|---|---|---|---|---|---|
| **1.0** | 00:00 | System Admin | Login (`/login`) | Enter demo credentials (`admin@crm.internal`), click "Sign In" | `POST /api/v1/auth/login` | — | Toast: "Welcome back, System Admin". Session saved in memory/RTK. Redirect to `/orders`. |
| **1.1** | 00:45 | Sales Executive | Orders List (`/orders`) | Click "+ Create Order" primary button | `GET /api/v1/customers?search=`<br>`GET /api/v1/products?inStock=true` | — | Navigate to `/orders/create`. Unsaved-changes protection initialized. |
| **1.2** | 01:15 | Sales Executive | Order Create (`/orders/create`) | Select customer "Aarav Sharma", add 2x Cotton T-Shirt, 1x Fleece Hoodie. Input coupon `SAVE10`. Click "Generate Order". | `POST /api/v1/orders` | `order:created` | Button shows spinner. On 201, redirect to `/orders/ORD-20261113-A8F2K1`. Toast: "Order created successfully in integer paise (₹4,094.46)". Order status displays `PLACED` badge (blue), payment status `PENDING` badge (amber). |
| **1.3** | 02:00 | Sales Executive | Order Detail (`/orders/:id`) | Click "Pay Now via Razorpay" button in `PaymentStatusPanel` | `POST /api/v1/payments/create-order` | — | Button shows loading state. Dialog opens mounting Razorpay Checkout.js iframe in TEST MODE with amount ₹4,094.46 (409446 paise). |
| **1.4** | 02:40 | Customer / Sales | Payment Dialog (Modal) | Select "Card", enter test card `4111 1111 1111 1111`, expiry `12/32`, CVV `123`, submit OTP `123456` | Razorpay Internal Gateway → `POST /api/v1/payments/verify` | `payment:updated`<br>`order:updated` | Modal closes. Toast: "Payment Captured & Signature Verified". `PaymentStatusPanel` updates to `PAID` (emerald). Order Status stepper transitions from `PLACED` to `CONFIRMED` automatically without manual page reload. |
| **1.5** | 03:20 | Sales Executive | Order Detail (`/orders/:id`) | Click "Advance Status" → select `PROCESSING` → then `PACKED` | `PATCH /api/v1/orders/:id/status` (fired per transition) | `order:updated` | Stepper nodes turn green with timestamps. Action dropdown dynamically updates to allow only legal next transitions. "Cancel Order" button remains enabled. |
| **1.6** | 04:00 | Inventory Manager | Order Detail (`/orders/:id`) | Click "Advance Status" → select `SHIPPED` (Enter Tracking AWB: `AWB-DELHIVERY-998877`) | `PATCH /api/v1/orders/:id/status` | `order:updated` | Stepper reaches `SHIPPED`. "Cancel Order" button immediately disappears (domain rule: no cancellations once shipped). Tracking card appears with tracking URL. |
| **1.7** | 04:30 | Inventory Manager | Order Detail (`/orders/:id`) | Click "Advance Status" → `OUT_FOR_DELIVERY` → `DELIVERED` | `PATCH /api/v1/orders/:id/status` | `order:updated` | Stepper marks final step `DELIVERED`. `ReturnEligibilityBanner` appears: "Eligible for Return (7 days remaining in return window)". |
| **1.8** | 05:15 | Support Executive | Order Detail (`/orders/:id`) | Click "Initiate Return" button on delivered line item `prod_101` (T-Shirt) | `GET /api/v1/orders/:id` (verify delivered qty) | — | Slide-over drawer opens: `ReturnItemSelector` displays max returnable qty = 2. User selects qty = 1, selects reason "Stitching frayed", drags 2 photos to `EvidenceUploader`. |
| **1.9** | 06:00 | Support Executive | Return Drawer | Click "Submit Return Request" | `POST /api/v1/returns` (multipart with image files) | `return:created`<br>`notification:new` | Upload progress bars fill to 100%. Drawer closes. Toast: "Return RET-20261113-9B3C21 created". Notification bell count increments to 1. Redirect to Return Detail view (`/returns/:id`). |
| **1.10** | 06:45 | Support Executive | Return Detail (`/returns/:id`) | Attempt to click "Execute Refund" | — | — | Button is hidden or disabled with tooltip: "Requires 'refunds.approve' permission. Your role (Support Executive) cannot process payouts". |
| **1.11** | 07:15 | Support Manager | Return Detail (`/returns/:id`) | Use Dev Quick-Role-Switcher in topbar to switch to `Support Manager`. Click "Approve Return". Enter note: "Photo evidence verified. Fabric stitching torn." | `PATCH /api/v1/returns/:id/approve` | `return:updated` | Return badge updates from `REQUESTED` (amber) to `APPROVED` (blue). Decision card populates with approver name, timestamp, and audit trail note. |
| **1.12** | 08:00 | Support Manager | Return Detail (`/returns/:id`) | Click "Advance Return Status" → select `PICKUP_SCHEDULED` → then `RECEIVED` | `PATCH /api/v1/returns/:id/status` | `return:updated`<br>`inventory:restocked` | Status transitions. Toast: "Item received at warehouse. Restock hook dispatched to Inventory module". Badge updates to `RECEIVED`. |
| **1.13** | 08:45 | Support Manager | Return Detail (`/returns/:id`) | Click "Advance Return Status" → select `INSPECTED` (Enter note: "QA passed. Item restocked.") | `PATCH /api/v1/returns/:id/status` | `return:updated` | Status updates to `INSPECTED` (purple). A persistent alert banner renders: "Return Inspected. Pending Financial Refund Disbursement." with a deep link to create refund. |
| **1.14** | 09:30 | Finance Manager | Return Detail (`/returns/:id`) | Use Dev Role Switcher to switch to `Finance Manager`. Click "Create Refund Record". | `POST /api/v1/refunds` | `refund:created` | Dialog opens showing pre-calculated refund amount ₹870.91 (87091 paise, exactly 1 unit price + prorated tax). Click "Confirm Draft". Redirects to `/refunds/:id`. Refund status: `PENDING`. |
| **1.15** | 10:15 | Finance Manager | Refund Detail (`/refunds/:id`) | Click "Process Gateway Payout". Enter authorization note: "Approved disbursement to original card". | `PATCH /api/v1/refunds/:id/process` | `refund:processed`<br>`order:updated`<br>`payment:updated` | Action spinner displays. Backend calls Razorpay Refund API. On success, Refund badge transitions to `PROCESSED` (emerald). Live Toast: "Refund of ₹870.91 processed via Razorpay. Refund ID: rfnd_test_XYZ789". |
| **1.16** | 11:00 | Finance Manager | Order Detail (`/orders/ORD-20261113-A8F2K1`) | Navigate back to original Order | `GET /api/v1/orders/:id`<br>`GET /api/v1/orders/:id/payment` | — | Order payment status badge renders `PARTIALLY_REFUNDED` (orange). Refund section shows linked refund ID. Audit timeline records the full lifecycle from creation to refund. |
| **1.17** | 11:45 | Sales Executive | Order Detail (`/orders/:id`) | Click "Print Invoice" button | `GET /api/v1/orders/:id/invoice` | — | Pop-up print-preview opens `/orders/:id/invoice`. Pure CSS print layout displays official GST breakdown, zero page-split line-item table, and company tax identifiers. |

---

## SECTION 2: API ENDPOINT CATALOGUE (DEMO-REQUIRED ONLY)

### 2.1 Orders Module
Base URL: `/api/v1/orders`

| # | Method | Path | Purpose | Required Permission | Request Body / Query Params | Success Response Shape | Error Cases & Status | Used By Screen / Component | Idempotent? | Demo-Critical? |
|---|---|---|---|---|---|---|---|---|---|---|
| **O-01** | `POST` | `/api/v1/orders` | Create an order with server-calculated integer-paise math | `orders.create` | **Body (JSON):**<br>`customerId`: string, req<br>`items`: array of `{product: string, qty: integer ≥ 1}`, req<br>`shippingAddress`: AddressObj, req<br>`billingAddress`: AddressObj, req<br>`couponCode`: string, opt<br>`paymentMethod`: enum(`RAZORPAY`,`COD`,`BANK_TRANSFER`), req | `201 Created`<br>`{success: true, data: {order: {_id, orderNumber, items, subtotal, discountTotal, taxTotal, shippingFee, grandTotal, status: "PLACED", paymentStatus: "PENDING"}}}` | `400` Missing fields / stock unavailable<br>`401` Unauthorized<br>`403` Forbidden<br>`422` Zod schema validation error | `OrderCreateScreen`<br>`LineItemsEditor` | No | **Y** |
| **O-02** | `GET` | `/api/v1/orders` | Paginated, filtered, searched order list | `orders.read` | **Query:**<br>`page`: int = 1<br>`limit`: int = 10 (max 100)<br>`status`: OrderStatusEnum, opt<br>`paymentStatus`: PaymentStatusEnum, opt<br>`search`: string, opt<br>`sortBy`: string = "createdAt"<br>`sortOrder`: "asc" \| "desc" = "desc" | `200 OK`<br>`{success: true, data: {orders: [...]}, pagination: {page, limit, total, totalPages}}` | `400` Invalid query params<br>`401` Unauthorized<br>`403` Forbidden | `OrdersListScreen`<br>`DataTable` | Yes | **Y** |
| **O-03** | `GET` | `/api/v1/orders/:id` | Fetch order detail by Mongo `_id` or `orderNumber` | `orders.read` | **Params:**<br>`id`: string (Mongo ObjectId or `ORD-YYYYMMDD-XXXXXX`), req | `200 OK`<br>`{success: true, data: {order: {_id, orderNumber, customer, items, grandTotal, status, paymentStatus, statusHistory: [...]}}}` | `404` Order not found<br>`401` Unauthorized | `OrderDetailScreen`<br>`OrderStatusStepper`<br>`StatusHistoryTimeline` | Yes | **Y** |
| **O-04** | `PATCH` | `/api/v1/orders/:id/status` | Advance order status along deterministic state machine | `orders.update_status` | **Body (JSON):**<br>`status`: OrderStatusEnum, req<br>`note`: string, opt (max 500 chars) | `200 OK`<br>`{success: true, data: {order: {_id, status, statusHistory}}}` | `400` Invalid status transition jump<br>`404` Not found<br>`409` Stale state conflict | `OrderDetailScreen`<br>`OrderStatusStepper` | Yes | **Y** |
| **O-05** | `POST` | `/api/v1/orders/:id/cancel` | Cancel order before shipment and release stock | `orders.cancel` | **Body (JSON):**<br>`reason`: string, req (min 5 chars) | `200 OK`<br>`{success: true, data: {order: {_id, status: "CANCELLED"}}}` | `400` Order already SHIPPED or DELIVERED<br>`403` Forbidden | `OrderDetailScreen`<br>`ConfirmDialog` | Yes | **Y** |
| **O-06** | `GET` | `/api/v1/orders/:id/invoice` | Fetch invoice printable schema | `orders.read` | **Params:**<br>`id`: string, req | `200 OK`<br>`{success: true, data: {invoiceNumber, orderNumber, customer, items, subtotal, taxBreakdown, grandTotal, formattedTotals: {grandTotalRupees}}}` | `404` Order not found | `InvoicePrintView` | Yes | **Y** |
| **O-07** | `GET` | `/api/v1/orders/:id/tracking` | Fetch tracking carrier info & milestones | `orders.read` | **Params:**<br>`id`: string, req | `200 OK`<br>`{success: true, data: {carrier, awb, estimatedDelivery, milestones: [{status, location, timestamp}]}}` | `404` Not found | `OrderDetailScreen`<br>`TrackingCard` | Yes | N |
| **O-08** | `GET` | `/api/v1/orders/:id/payment` | Fetch payments linked to an order | `orders.read` | **Params:**<br>`id`: string, req | `200 OK`<br>`{success: true, data: {payments: [{_id, amount, status, method, razorpayOrderId, razorpayPaymentId, paidAt}]}}` | `404` Not found | `OrderDetailScreen`<br>`PaymentStatusPanel` | Yes | **Y** |

---

### 2.2 Payments Module (Razorpay Test Mode)
Base URL: `/api/v1/payments`

| # | Method | Path | Purpose | Required Permission | Request Body / Query Params | Success Response Shape | Error Cases & Status | Used By Screen / Component | Idempotent? | Demo-Critical? |
|---|---|---|---|---|---|---|---|---|---|---|
| **P-01** | `POST` | `/api/v1/payments/create-order` | Create server-authoritative Razorpay Order | `payments.create` | **Body (JSON):**<br>`orderId`: string, req | `201 Created`<br>`{success: true, data: {keyId, razorpayOrderId, amount: integer_paise, currency: "INR", orderNumber, customer: {name, email, phone}}}` | `400` Order already paid<br>`404` Order not found | `PaymentCheckoutDialog` | No | **Y** |
| **P-02** | `POST` | `/api/v1/payments/verify` | Verify HMAC-SHA256 signature and mark PAID | `payments.create` | **Body (JSON):**<br>`razorpay_order_id`: string, req<br>`razorpay_payment_id`: string, req<br>`razorpay_signature`: string, req | `200 OK`<br>`{success: true, data: {payment: {_id, status: "PAID"}, order: {_id, status: "CONFIRMED", paymentStatus: "PAID"}}}` | `400` Invalid signature / amount mismatch<br>`404` Order not found | `PaymentCheckoutDialog` | Yes | **Y** |
| **P-03** | `POST` | `/api/v1/payments/webhook` | Server-to-server Razorpay event ingestion | *None (HMAC Header)* | **Headers:** `x-razorpay-signature`<br>**Body (Raw Binary/Buffer):** Razorpay Webhook Event | `200 OK`<br>`{received: true}` | `400` Invalid webhook signature | *Server-to-Server Only (No UI)* | Yes | **Y** |
| **P-04** | `POST` | `/api/v1/payments` | Record manual/offline payment (COD/NEFT) | `payments.create` | **Body (JSON):**<br>`orderId`: string, req<br>`amount`: integer paise, req<br>`method`: enum(`COD`,`BANK_TRANSFER`), req<br>`status`: "PAID", req<br>`transactionRef`: string, opt<br>`notes`: string, opt | `201 Created`<br>`{success: true, data: {payment: {_id, status: "PAID"}}}` | `400` Amount mismatch<br>`403` Forbidden | `ManualPaymentDialog` | No | N |
| **P-05** | `GET` | `/api/v1/payments` | List payments with filters | `payments.read` | **Query:** `page`, `limit`, `status`, `method`, `orderId` | `200 OK`<br>`{success: true, data: {payments: [...]}, pagination}` | `401` Unauthorized | `PaymentsListScreen` | Yes | **Y** |
| **P-06** | `GET` | `/api/v1/payments/:id` | Fetch payment detail | `payments.read` | **Params:** `id`: string, req | `200 OK`<br>`{success: true, data: {payment: {_id, amount, status, razorpayPaymentId, events: [...]}}}` | `404` Not found | `PaymentDetailScreen` | Yes | **Y** |
| **P-07** | `PATCH` | `/api/v1/payments/:id/status` | Manual status override by manager | `payments.create` | **Body (JSON):**<br>`status`: enum(`PAID`,`FAILED`), req<br>`notes`: string, req (min 5 chars) | `200 OK`<br>`{success: true, data: {payment}}` | `400` Invalid transition<br>`403` Forbidden | `PaymentDetailScreen` | Yes | N |
| **P-08** | `POST` | `/api/v1/payments/reconcile` | Reconcile aged PENDING payments with gateway | `payments.create` | **Body (JSON):**<br>`olderThanMinutes`: integer = 30 | `200 OK`<br>`{success: true, data: {checkedCount, reconciledCount, failedCount}}` | `502` Gateway unreachable | `PaymentsListScreen`<br>`ReconcileButton` | Yes | **Y** |

---

### 2.3 Returns Module
Base URL: `/api/v1/returns`

| # | Method | Path | Purpose | Required Permission | Request Body / Query Params | Success Response Shape | Error Cases & Status | Used By Screen / Component | Idempotent? | Demo-Critical? |
|---|---|---|---|---|---|---|---|---|---|---|
| **R-01** | `POST` | `/api/v1/returns` | Submit return request with Cloudinary evidence | `returns.create` | **Content-Type:** `multipart/form-data` or `application/json`<br>`orderId`: string, req<br>`items`: `[{product: string, qty: integer ≥ 1, reason: string}]`, req<br>`reason`: string, req<br>`evidence`: file[] (max 5) or URL strings | `201 Created`<br>`{success: true, data: {returnRecord: {_id, returnNumber, status: "REQUESTED", refundAmount: integer_paise, items: [...], evidence: [...]}}}` | `400` Order not DELIVERED / window expired / qty exceeds delivered / duplicate open return<br>`422` Invalid payload | `ReturnCreateDrawer`<br>`EvidenceUploader` | No | **Y** |
| **R-02** | `GET` | `/api/v1/returns` | List return requests | `returns.read` | **Query:** `page`, `limit`, `status`, `orderId`, `search` | `200 OK`<br>`{success: true, data: {returns: [...]}, pagination}` | `401` Unauthorized | `ReturnsListScreen` | Yes | **Y** |
| **R-03** | `GET` | `/api/v1/returns/:id` | Fetch return details by ID or returnNumber | `returns.read` | **Params:** `id`: string, req | `200 OK`<br>`{success: true, data: {returnRecord: {_id, returnNumber, order, items, refundAmount, status, decisionBy, decisionNote, restocked, history: [...]}}}` | `404` Return not found | `ReturnDetailScreen`<br>`ReturnToRefundTimeline` | Yes | **Y** |
| **R-04** | `PATCH` | `/api/v1/returns/:id/approve` | Authorize return request | `returns.approve` | **Body (JSON):**<br>`decisionNote`: string, req (min 5 chars) | `200 OK`<br>`{success: true, data: {returnRecord: {_id, status: "APPROVED", decisionNote}}}` | `400` Return not in REQUESTED status<br>`403` Lacks `returns.approve` | `ReturnDetailScreen`<br>`ConfirmDialog` | Yes | **Y** |
| **R-05** | `PATCH` | `/api/v1/returns/:id/reject` | Reject return request with mandatory reason | `returns.approve` | **Body (JSON):**<br>`decisionNote`: string, req (min 5 chars) | `200 OK`<br>`{success: true, data: {returnRecord: {_id, status: "REJECTED", decisionNote}}}` | `400` Illegal transition<br>`403` Forbidden | `ReturnDetailScreen`<br>`ConfirmDialog` | Yes | **Y** |
| **R-06** | `PATCH` | `/api/v1/returns/:id/status` | Advance return along warehouse pipeline | `returns.approve` | **Body (JSON):**<br>`status`: enum(`PICKUP_SCHEDULED`,`RECEIVED`,`INSPECTED`), req<br>`note`: string, opt | `200 OK`<br>`{success: true, data: {returnRecord: {_id, status, restocked}}}` | `400` Invalid state transition<br>`403` Forbidden | `ReturnDetailScreen`<br>`StatusStepper` | Yes | **Y** |

---

### 2.4 Refunds Module
Base URL: `/api/v1/refunds`

| # | Method | Path | Purpose | Required Permission | Request Body / Query Params | Success Response Shape | Error Cases & Status | Used By Screen / Component | Idempotent? | Demo-Critical? |
|---|---|---|---|---|---|---|---|---|---|---|
| **RF-01** | `POST` | `/api/v1/refunds` | Create pending refund record for inspected return or cancelled order | `refunds.approve` | **Body (JSON):**<br>`returnId`: string, opt<br>`orderId`: string, opt<br>`amount`: integer paise, opt (defaults to return snapshot)<br>`notes`: string, opt | `201 Created`<br>`{success: true, data: {refund: {_id, refundNumber, amount, status: "PENDING", order, return: returnId}}}` | `400` Return not INSPECTED / amount > refundable balance<br>`403` Lacks `refunds.approve` | `CreateRefundDialog`<br>`RefundAmountInput` | No | **Y** |
| **RF-02** | `PATCH` | `/api/v1/refunds/:id/process` | Execute disbursement through Razorpay API | `refunds.approve` | **Body (JSON):**<br>`notes`: string, opt | `200 OK`<br>`{success: true, data: {refund: {_id, status: "PROCESSED", razorpayRefundId}, orderStatus: "PARTIALLY_REFUNDED" \| "REFUNDED"}}` | `400` Amount exceeds balance<br>`502` Gateway failed | `RefundDetailScreen`<br>`ProcessRefundModal` | Yes | **Y** |
| **RF-03** | `GET` | `/api/v1/refunds` | List refund records | `payments.read` | **Query:** `page`, `limit`, `status`, `orderId` | `200 OK`<br>`{success: true, data: {refunds: [...]}, pagination}` | `401` Unauthorized | `RefundsListScreen` | Yes | **Y** |
| **RF-04** | `GET` | `/api/v1/refunds/:id` | Fetch refund details | `payments.read` | **Params:** `id`: string, req | `200 OK`<br>`{success: true, data: {refund: {_id, refundNumber, amount, status, razorpayRefundId, approvedBy}}}` | `404` Not found | `RefundDetailScreen` | Yes | **Y** |

---

### 2.5 Supporting Modules (Owned by Other Modules — Stub Allowed)

| # | Method | Path | Module Owner | Purpose | Required Permission | Request Body / Query Params | Success Response Shape | Used By Screen / Component |
|---|---|---|---|---|---|---|---|---|
| **S-01** | `POST` | `/api/v1/auth/login` | Auth / RBAC | User credential authentication | *Public* | `{email: string, password: string}` | `200 OK`<br>`{success: true, data: {token, refreshToken, user: {id, name, email, role, permissions: [...]}}}` | `LoginScreen` |
| **S-02** | `GET` | `/api/v1/auth/me` | Auth / RBAC | Verify session and active permissions | *Authenticated* | *None* | `200 OK`<br>`{success: true, data: {user: {id, name, email, role, permissions: [...]}}}` | `AppShell`<br>`PermissionGate` |
| **S-03** | `POST` | `/api/v1/auth/refresh` | Auth / RBAC | Silent token refresh | *Public* | `{refreshToken: string}` | `200 OK`<br>`{success: true, data: {token, refreshToken}}` | `AxiosInterceptor` |
| **S-04** | `GET` | `/api/v1/customers` | Customers | Search customer combobox | `orders.create` | `?search=string&limit=10` | `200 OK`<br>`{success: true, data: {customers: [{customerId, name, email, phone, addresses: [...]}]}}` | `CustomerPicker` |
| **S-05** | `GET` | `/api/v1/products` | Products | Search catalog with stock levels | `orders.create` | `?search=string&inStock=true` | `200 OK`<br>`{success: true, data: {products: [{productId, sku, name, unitPrice, stockQty, taxRatePercent}]}}` | `ProductPicker`<br>`LineItemsEditor` |
| **S-06** | `GET` | `/api/v1/notifications` | Notifications | Fetch unread system notifications | *Authenticated* | `?page=1&limit=20&unreadOnly=true` | `200 OK`<br>`{success: true, data: {notifications: [{_id, title, message, entityType, entityId, read, createdAt}]}}` | `NotificationPanel` |
| **S-07** | `PATCH` | `/api/v1/notifications/:id/read` | Notifications | Mark notification read | *Authenticated* | *None* | `200 OK`<br>`{success: true, data: {read: true}}` | `NotificationPanel` |

---

### 2.6 Canonical JSON Examples (Demo-Critical)

#### 1. Order Creation (`POST /api/v1/orders`)
**Request:**
```json
{
  "customerId": "cust_101",
  "items": [
    { "product": "prod_101", "qty": 2 },
    { "product": "prod_102", "qty": 1 }
  ],
  "couponCode": "SAVE10",
  "shippingAddress": {
    "street": "100 Feet Road, Indiranagar",
    "city": "Bengaluru",
    "state": "Karnataka",
    "postalCode": "560038",
    "country": "India"
  },
  "billingAddress": {
    "street": "100 Feet Road, Indiranagar",
    "city": "Bengaluru",
    "state": "Karnataka",
    "postalCode": "560038",
    "country": "India"
  },
  "paymentMethod": "RAZORPAY",
  "notes": "Deliver strictly between 2 PM and 5 PM"
}
```

**Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "order": {
      "_id": "6734c89a01f5a2b13c90e111",
      "orderNumber": "ORD-20261113-A8F2K1",
      "customer": {
        "customerId": "cust_101",
        "name": "Aarav Sharma",
        "email": "aarav.sharma@example.in",
        "phone": "+919876543210"
      },
      "items": [
        {
          "product": "prod_101",
          "name": "100% Organic Cotton T-Shirt",
          "sku": "SKU-TSHIRT-BLK-M",
          "qty": 2,
          "unitPrice": 79900,
          "discount": 0,
          "tax": 14382
        },
        {
          "product": "prod_102",
          "name": "Heavyweight Fleece Hoodie",
          "sku": "SKU-HOODIE-GRY-L",
          "qty": 1,
          "unitPrice": 199900,
          "discount": 20000,
          "tax": 35982
        }
      ],
      "subtotal": 359700,
      "discountTotal": 20000,
      "taxTotal": 50364,
      "shippingFee": 5000,
      "grandTotal": 395064,
      "currency": "INR",
      "status": "PLACED",
      "paymentStatus": "PENDING",
      "paymentMethod": "RAZORPAY",
      "statusHistory": [
        {
          "from": "NONE",
          "to": "PLACED",
          "by": {
            "userId": "usr_sales_01",
            "name": "Kavita Rao",
            "role": "Sales Executive"
          },
          "at": "2026-11-13T09:30:00.000Z",
          "note": "Order initiated via CRM sales portal"
        }
      ],
      "createdAt": "2026-11-13T09:30:00.000Z",
      "updatedAt": "2026-11-13T09:30:00.000Z"
    }
  }
}
```

---

#### 2. Razorpay Order Init (`POST /api/v1/payments/create-order`)
**Request:**
```json
{
  "orderId": "6734c89a01f5a2b13c90e111"
}
```

**Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Razorpay order initialized successfully",
  "data": {
    "keyId": "rzp_test_mockKeyId123456",
    "razorpayOrderId": "order_RPQ1234567890",
    "amount": 395064,
    "currency": "INR",
    "orderNumber": "ORD-20261113-A8F2K1",
    "customer": {
      "name": "Aarav Sharma",
      "email": "aarav.sharma@example.in",
      "phone": "+919876543210"
    }
  }
}
```

---

#### 3. Razorpay Signature Verification (`POST /api/v1/payments/verify`)
**Request:**
```json
{
  "razorpay_order_id": "order_RPQ1234567890",
  "razorpay_payment_id": "pay_RPQ9876543210",
  "razorpay_signature": "4a7d65b4c3e2f10987654321fedcba0987654321abcdef0123456789abcdef01"
}
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Payment verified and order confirmed successfully",
  "data": {
    "payment": {
      "_id": "6734c90101f5a2b13c90e222",
      "order": "6734c89a01f5a2b13c90e111",
      "amount": 395064,
      "currency": "INR",
      "method": "RAZORPAY",
      "status": "PAID",
      "razorpayOrderId": "order_RPQ1234567890",
      "razorpayPaymentId": "pay_RPQ9876543210",
      "paidAt": "2026-11-13T09:32:15.000Z"
    },
    "order": {
      "_id": "6734c89a01f5a2b13c90e111",
      "orderNumber": "ORD-20261113-A8F2K1",
      "status": "CONFIRMED",
      "paymentStatus": "PAID",
      "statusHistory": [
        {
          "from": "NONE",
          "to": "PLACED",
          "by": { "userId": "usr_sales_01", "name": "Kavita Rao", "role": "Sales Executive" },
          "at": "2026-11-13T09:30:00.000Z"
        },
        {
          "from": "PLACED",
          "to": "CONFIRMED",
          "by": { "userId": "system", "name": "Razorpay Webhook/Verify Gateway", "role": "system" },
          "at": "2026-11-13T09:32:15.000Z",
          "note": "Payment captured online. Gateway Ref: pay_RPQ9876543210"
        }
      ]
    }
  }
}
```

---

#### 4. Return Request Submission (`POST /api/v1/returns`)
**Request:**
```json
{
  "orderId": "ORD-20261113-A8F2K1",
  "items": [
    {
      "product": "prod_101",
      "qty": 1,
      "reason": "Stitching on left collar completely frayed"
    }
  ],
  "reason": "Defective manufacturing quality",
  "evidence": [
    "https://res.cloudinary.com/crm-demo/image/upload/v1731490000/returns/damage_collar_front.jpg",
    "https://res.cloudinary.com/crm-demo/image/upload/v1731490000/returns/damage_collar_close.jpg"
  ]
}
```

**Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Return request submitted successfully",
  "data": {
    "returnRecord": {
      "_id": "6734d00101f5a2b13c90e333",
      "returnNumber": "RET-20261113-9B3C21",
      "order": "6734c89a01f5a2b13c90e111",
      "items": [
        {
          "orderItemId": "6734c89a01f5a2b13c90e112",
          "product": "prod_101",
          "qty": 1,
          "reason": "Stitching on left collar completely frayed"
        }
      ],
      "reason": "Defective manufacturing quality",
      "evidence": [
        "https://res.cloudinary.com/crm-demo/image/upload/v1731490000/returns/damage_collar_front.jpg",
        "https://res.cloudinary.com/crm-demo/image/upload/v1731490000/returns/damage_collar_close.jpg"
      ],
      "refundAmount": 87091,
      "status": "REQUESTED",
      "restocked": false,
      "history": [
        {
          "from": "NONE",
          "to": "REQUESTED",
          "by": { "userId": "usr_support_01", "name": "Siddharth Verma", "role": "Support Executive" },
          "at": "2026-11-13T10:15:00.000Z",
          "note": "Customer initiated return via phone support ticket #8821"
        }
      ],
      "createdAt": "2026-11-13T10:15:00.000Z"
    }
  }
}
```

---

#### 5. Refund Disbursement Execution (`PATCH /api/v1/refunds/:id/process`)
**Request:**
```json
{
  "notes": "Verified return inspection #RET-20261113-9B3C21. Disbursed payout via Razorpay test rail."
}
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Refund processed successfully via Razorpay",
  "data": {
    "refund": {
      "_id": "6734e00101f5a2b13c90e444",
      "refundNumber": "REF-20261113-5E1D88",
      "order": "6734c89a01f5a2b13c90e111",
      "return": "6734d00101f5a2b13c90e333",
      "payment": "6734c90101f5a2b13c90e222",
      "amount": 87091,
      "currency": "INR",
      "status": "PROCESSED",
      "razorpayRefundId": "rfnd_test_XYZ789456123",
      "notes": "Verified return inspection #RET-20261113-9B3C21. Disbursed payout via Razorpay test rail.",
      "approvedBy": {
        "userId": "usr_finance_01",
        "name": "Sunita Menon",
        "role": "Finance Manager"
      },
      "processedAt": "2026-11-13T11:00:00.000Z"
    },
    "orderStatus": "PARTIALLY_REFUNDED"
  }
}
```

---

### 2.7 Socket.IO Real-Time Events Catalogue

| Event Name | Direction | Payload Schema | Subscribing Screens / Components | Triggering Backend Service Action |
|---|---|---|---|---|
| `order:created` | Server → Client | `{orderId: string, orderNumber: string, grandTotal: int, customerName: string}` | `OrdersListScreen`, `TopBar` badge | Order placement service (`orders.service.js`) |
| `order:updated` | Server → Client | `{orderId: string, orderNumber: string, status: string, paymentStatus: string, statusHistory: array}` | `OrderDetailScreen`, `OrdersListScreen` | `orders.service.updateStatus`, `orders.service.cancel` |
| `payment:updated` | Server → Client | `{paymentId: string, orderId: string, status: string, razorpayPaymentId: string}` | `OrderDetailScreen`, `PaymentsListScreen`, `PaymentStatusPanel` | `payments.service.verify`, Webhook handler |
| `return:created` | Server → Client | `{returnId: string, returnNumber: string, orderId: string, refundAmount: int}` | `ReturnsListScreen`, `TopBar` notification count | `returns.service.createReturnRequest` |
| `return:updated` | Server → Client | `{returnId: string, returnNumber: string, status: string, restocked: boolean}` | `ReturnDetailScreen`, `ReturnsListScreen` | `returns.service.approve`, `updateReturnStatus` |
| `refund:created` | Server → Client | `{refundId: string, refundNumber: string, orderId: string, amount: int, status: "PENDING"}` | `RefundsListScreen` | `refunds.service.createRefundRequest` |
| `refund:processed` | Server → Client | `{refundId: string, orderId: string, amount: int, status: "PROCESSED", orderStatus: string}` | `RefundDetailScreen`, `OrderDetailScreen`, `RefundsListScreen` | `refunds.service.processRefund`, Webhook handler |
| `notification:new` | Server → Client | `{_id: string, title: string, message: string, entityType: string, entityId: string, createdAt: string}` | `NotificationPanel`, `TopBar` notification bell | `notificationStub.js`, Alert publisher |

---

### 2.8 Global Conventions Table

| Domain Parameter | Specification Standard | Implementation Enforcement | Failure / Edge Behavior |
|---|---|---|---|
| **Authentication Header** | `Authorization: Bearer <JWT_TOKEN>` | Injected on every Axios call via `src/services/api.ts` interceptor | If absent or expired, triggers Axios 401 response queue. |
| **Pagination Parameters** | `?page=1&limit=10` | 1-based indexing; enforced min: 1, default: 10, max: 100 | Server silently clamps requests > 100 down to 100. |
| **Sort Syntax** | `?sortBy=<fieldName>&sortOrder=asc\|desc` | Default: `sortBy=createdAt&sortOrder=desc` | Invalid fields default silently to `createdAt`. |
| **Filter Syntax** | `?<field>=<value>&<field>=<value>` | Strict equality or range query: `?status=DELIVERED` | Sanitized against MongoDB operator injection (`$gt`). |
| **Timestamp Handling** | ISO-8601 UTC on the wire (`YYYY-MM-DDTHH:mm:ss.sssZ`) | Converted to Indian Standard Time (IST, UTC+05:30) in UI display | Rendered via `<DateTimeText value={iso} />`. Format: `DD MMM YYYY, hh:mm A IST`. |
| **Monetary Values** | Strict non-negative integer paise (`1 INR = 100 paise`) | Converted via `<MoneyText amountPaise={paise} />` | Never use floating points. Display: `₹` + Indian numbering format (`12,34,567.89`). |
| **Standard Error Envelope** | `{success: false, message: string, errors: [{field, message}], code: string}` | Handled via centralized `handleApiError(error)` utility | Maps field errors directly to React Hook Form `setError`. |
| **Rate Limiting Handling** | HTTP 429 Too Many Requests | Retry-After header parsed if present | Disables submit button, renders toast: "Rate limit reached. Please wait X seconds." |
| **Concurrency & Conflict (409)** | HTTP 409 Conflict / HTTP 400 State Jump | Stale data detection on state transitions | UI shows modal: "Order was updated by another team member. Reloading...", invalidates TanStack Query. |

---

### 2.9 Status Transition Matrix

#### Order Lifecycle Transition Matrix

| Current Order Status | Allowed Next Statuses | Permitted Action / Button | API Call Fired | Required Permission | Preconditions & Validation Rules |
|---|---|---|---|---|---|
| `NONE` | `PLACED` | "Create Order" | `POST /api/v1/orders` | `orders.create` | Line items valid, stock available. |
| `PLACED` | `CONFIRMED` | "Verify Payment" / "Confirm COD" | `POST /api/v1/payments/verify` | `payments.create` | Signature verified or manager confirmed manual payment. |
| `PLACED` | `CANCELLED` | "Cancel Order" | `POST /api/v1/orders/:id/cancel` | `orders.cancel` | Mandatory cancellation reason (`min: 5 chars`). Stock released. |
| `CONFIRMED` | `PROCESSING` | "Begin Processing" | `PATCH /api/v1/orders/:id/status` | `orders.update_status` | Warehouse pick-list generated. |
| `CONFIRMED` | `CANCELLED` | "Cancel Order" | `POST /api/v1/orders/:id/cancel` | `orders.cancel` | Pre-shipment cancellation allowed. Stock released. |
| `PROCESSING` | `PACKED` | "Mark Packed" | `PATCH /api/v1/orders/:id/status` | `orders.update_status` | Packing slip verified. |
| `PROCESSING` | `CANCELLED` | "Cancel Order" | `POST /api/v1/orders/:id/cancel` | `orders.cancel` | Pre-shipment cancellation allowed. Stock released. |
| `PACKED` | `SHIPPED` | "Dispatch & Handover" | `PATCH /api/v1/orders/:id/status` | `orders.update_status` | Courier AWB number entered. **Terminal cancellation boundary**. |
| `PACKED` | `CANCELLED` | "Cancel Order" | `POST /api/v1/orders/:id/cancel` | `orders.cancel` | Last point of cancellation before carrier dispatch. |
| `SHIPPED` | `OUT_FOR_DELIVERY`| "Out for Delivery" | `PATCH /api/v1/orders/:id/status` | `orders.update_status` | Carrier hub scan confirmed. **Cancellation prohibited**. |
| `OUT_FOR_DELIVERY` | `DELIVERED` | "Mark Delivered" | `PATCH /api/v1/orders/:id/status` | `orders.update_status` | Carrier POD confirmed. **Unlocks Return eligibility window**. |
| `DELIVERED` | *(Terminal)* | "Initiate Return" *(Opens Return flow)* | `POST /api/v1/returns` | `returns.create` | Within 7 days of delivery. Line item return qty ≤ available qty. |
| `CANCELLED` | *(Terminal)* | *(None)* | — | — | No further transitions permitted. Stock already released. |

---

#### Return Lifecycle Transition Matrix

| Current Return Status | Allowed Next Statuses | Permitted Action / Button | API Call Fired | Required Permission | Preconditions & Validation Rules |
|---|---|---|---|---|---|
| `NONE` | `REQUESTED` | "Submit Return" | `POST /api/v1/returns` | `returns.create` | Order `DELIVERED`, $\le 7$ days window, return qty $\le$ delivered $-$ returned, no open returns. |
| `REQUESTED` | `APPROVED` | "Approve Return" | `PATCH /api/v1/returns/:id/approve` | `returns.approve` | Mandatory decision note (`min: 5 chars`). Photo evidence checked. |
| `REQUESTED` | `REJECTED` | "Reject Return" | `PATCH /api/v1/returns/:id/reject` | `returns.approve` | Mandatory rejection reason note (`min: 5 chars`). |
| `APPROVED` | `PICKUP_SCHEDULED` | "Schedule Courier Pickup" | `PATCH /api/v1/returns/:id/status` | `returns.approve` | Courier logistics partner assigned. |
| `APPROVED` | `REJECTED` | "Reject Return" | `PATCH /api/v1/returns/:id/reject` | `returns.approve` | Customer failed to tender package or fraud flagged. |
| `PICKUP_SCHEDULED`| `RECEIVED` | "Mark Received at Hub" | `PATCH /api/v1/returns/:id/status` | `returns.approve` | Warehouse intake scan. **Dispatches `inventoryStub.restock`**. |
| `RECEIVED` | `INSPECTED` | "Record QA Inspection" | `PATCH /api/v1/returns/:id/status` | `returns.approve` | Physical inspection confirmed. Enables Refund creation. |
| `INSPECTED` | `REFUNDED` | "Process Refund" *(Via Refund Module)* | `PATCH /api/v1/refunds/:id/process` | `refunds.approve` | Refund disbursement successful via Razorpay API. |
| `INSPECTED` | `REJECTED` | "Reject at Inspection" | `PATCH /api/v1/returns/:id/reject` | `returns.approve` | QA failed (fake product/damaged by customer). |
| `REFUNDED` | *(Terminal)* | *(None)* | — | — | Full return and refund completed. |
| `REJECTED` | *(Terminal)* | *(None)* | — | — | Case closed. |

---

#### Refund Lifecycle Transition Matrix

| Current Refund Status | Allowed Next Statuses | Permitted Action / Button | API Call Fired | Required Permission | Preconditions & Validation Rules |
|---|---|---|---|---|---|
| `NONE` | `PENDING` | "Create Refund Draft" | `POST /api/v1/refunds` | `refunds.approve` | Return in `INSPECTED` or Order `CANCELLED` (PAID). Amount $\le$ Paid $-$ Refunded. |
| `PENDING` | `PROCESSED` | "Execute Payment Payout"| `PATCH /api/v1/refunds/:id/process` | `refunds.approve` | Razorpay gateway captures payout. Order paymentStatus updated. |
| `PENDING` | `FAILED` | *(Automatic on Gateway Fail)*| `PATCH /api/v1/refunds/:id/process` | `refunds.approve` | Gateway returns error. Retains `PENDING` status for retry. |
| `PROCESSED` | *(Terminal)* | *(None)* | — | — | Final state. Immutable financial audit record. |

---

## SECTION 3: SCREEN / PAGE INVENTORY

| Screen Name | Route Path | Purpose & Primary Flow | Permitted Roles & Permissions | Endpoints Used | Key Components Used | Responsive Behavior |
|---|---|---|---|---|---|---|
| **Login** | `/login` | Authentication using email and password, multi-role credential switcher for demo | *Public* | `S-01` (`/auth/login`) | `LoginForm`, `Button`, `Input`, `RoleSelectorPreset` | Centered card on Desktop/Tablet; full-width screen on Mobile. |
| **App Shell** | `/` (Parent Layout) | Navigation, global search, real-time toast alerts, role impersonator, unread badge | *Authenticated* | `S-02` (`/auth/me`), `S-06`, `S-07` | `AppShell`, `Sidebar`, `TopBar`, `NotificationPanel` | Desktop: fixed 240px sidebar. Tablet: collapsible rail (64px). Mobile: slide-out bottom sheet / drawer. |
| **Orders List** | `/orders` | Paginated search, status filters, bulk selection, CSV export, create order trigger | `orders.read` (All roles except unauthenticated) | `O-02` (`/orders`) | `DataTable`, `FilterBar`, `SearchInput`, `StatusBadge` | Desktop: 8-column data grid. Tablet: 5-column grid. Mobile: vertical stack of interactive summary cards. |
| **Order Create** | `/orders/create` | Dynamic line item drafting, real-time integer-paise calculation preview, customer combobox | `orders.create` (Super Admin, Admin, Sales Manager, Sales Executive) | `O-01`, `S-04`, `S-05` | `CustomerPicker`, `LineItemsEditor`, `OrderTotalsSummary`, `AddressForm` | Desktop: 2-column layout (Items Left, Totals Right). Mobile: single-column with sticky bottom "Place Order" bar. |
| **Order Detail** | `/orders/:id` | Core hub for fulfillment: state machine stepper, cancellation, tracking, linked payments | `orders.read` | `O-03`, `O-04`, `O-05`, `O-08`, `P-01` | `OrderStatusStepper`, `PaymentStatusPanel`, `StatusHistoryTimeline`, `ReturnEligibilityBanner` | Desktop: 3-column modular grid. Tablet: 2-column. Mobile: stacked accordion panels with sticky action bar. |
| **Payment Checkout Dialog** | Modal Overlay on `/orders/:id` | Mounts Razorpay test mode checkout iframe, captures response, fires verification | `payments.create` (Customer, Sales, Admin) | `P-01`, `P-02` | `PaymentCheckoutDialog`, `RazorpayEmbed`, `StatusBadge` | Responsive modal dialog (max-w-md); fits full mobile viewport on touch devices. |
| **Payments List** | `/payments` | Financial ledger of all captured, pending, and failed payment transactions | `payments.read` (Super Admin, Admin, Finance Manager, Analyst) | `P-05`, `P-08` | `DataTable`, `MoneyText`, `FilterBar`, `ReconcileButton` | Desktop: full tabular ledger. Mobile: card view highlighting amount, gateway ID, and status badge. |
| **Payment Detail** | `/payments/:id` | Technical transaction inspection: gateway event timeline, raw payload, override | `payments.read` | `P-06`, `P-07` | `PaymentEventTimeline`, `JsonPayloadViewer`, `StatusBadge` | Desktop: 2-column side-by-side view. Mobile: single-column tabbed view (Overview vs Raw Events). |
| **Returns List** | `/returns` | Queue of return requests filtered by status (`REQUESTED`, `APPROVED`, `INSPECTED`) | `returns.read` (Super Admin, Support, Admin) | `R-02` | `DataTable`, `FilterBar`, `StatusBadge`, `MoneyText` | Desktop: tabular list. Mobile: action cards with quick "Review" button. |
| **Return Create Drawer** | Drawer on `/orders/:id` | Item selection with derived quantity caps, reason combobox, Cloudinary file upload | `returns.create` (Customer, Support, Admin) | `R-01` | `ReturnItemSelector`, `EvidenceUploader`, `Textarea` | Desktop: 480px right-hand slide-over drawer. Mobile: full-screen sheet with sticky bottom actions. |
| **Return Detail** | `/returns/:id` | Inspection workstation: image gallery, approve/reject actions, warehouse progression | `returns.read` | `R-03`, `R-04`, `R-05`, `R-06`, `RF-01` | `ImageGalleryModal`, `ReturnToRefundTimeline`, `ConfirmDialog` | Desktop: 2-column split (Evidence Left, Action Timeline Right). Mobile: stacked vertical layout. |
| **Refunds List** | `/refunds` | Audit table of pending and processed monetary refunds | `payments.read` (Super Admin, Admin, Finance Manager) | `RF-03` | `DataTable`, `MoneyText`, `StatusBadge` | Desktop: full tabular listing. Mobile: card view with amount and order number. |
| **Refund Detail** | `/refunds/:id` | Financial disbursement view with Gateway execution action | `payments.read` | `RF-02`, `RF-04` | `ProcessRefundModal`, `AuditLogCard`, `MoneyText` | Centered dashboard card (max-w-3xl) across all screen sizes. |
| **Invoice Print View**| `/orders/:id/invoice` | Pure printable GST invoice with rupee/paise formatting | `orders.read` | `O-06` | `InvoicePrintView` | Screen: styled paper container (A4 aspect). Print (`@media print`): strips all chrome, navigation, headers. |
| **Notifications Panel** | Drawer / Popover in TopBar | Real-time event notifications with direct deep-linking | *Authenticated* | `S-06`, `S-07` | `NotificationPanel`, `NotificationItem` | Desktop: 380px popover anchored to bell icon. Mobile: full-screen slide-over drawer. |
| **403 Forbidden** | `/403` | Explicit permission boundary error page with role-switching action | *Authenticated* | — | `ForbiddenView`, `Button`, `RoleSwitcherDropdown` | Centered illustration with back button and active permission debug inspector. |
| **404 Not Found** | `*` | Catch-all route error page | *Public* | — | `NotFoundView`, `Button` | Centered card with return to dashboard link. |
| **Session Expired** | Global Modal Overlay | Non-destructive re-auth dialog preserving unsaved form state | *Authenticated* | `S-01` (`/auth/login`) | `SessionExpiredDialog`, `LoginFormInline` | Modal blocking UI interaction until credentials re-entered; does not trigger page refresh. |

---

## SECTION 4: COMPLETE UI COMPONENT LIST

### (A) Layout and Navigation

#### 1. `AppShell`
- **Type:** Composed layout container.
- **Props:** `{ children: React.ReactNode }`
- **Variants & States:** Desktop sidebar expanded (240px), Tablet collapsed rail (64px), Mobile drawer hidden/visible.
- **Data Source:** RTK UI Slice (`isSidebarOpen`, `activeTheme`).
- **Events Emitted:** None.
- **Accessibility:** `<main id="main-content">` landmark, skip-to-content link, `aria-expanded` on sidebar toggle.
- **Reuse:** All authenticated screens (`/orders/*`, `/payments/*`, `/returns/*`, `/refunds/*`).

#### 2. `Sidebar`
- **Type:** Composed navigation list.
- **Props:** `{ collapsed?: boolean, onToggle?: () => void }`
- **Variants & States:** Default, Item Hover, Item Active, Role-filtered Hidden.
- **Data Source:** Redux Auth Slice (`user.permissions`).
- **Events Emitted:** `onNavigate(route)`.
- **Accessibility:** `<nav aria-label="Sidebar Navigation">`, active link has `aria-current="page"`.
- **Reuse:** Embedded in `AppShell`.

#### 3. `TopBar`
- **Type:** Composed header bar.
- **Props:** `{ onMenuClick: () => void }`
- **Variants & States:** Default, Scrolled (adds subtle border/shadow), Offline alert mode.
- **Data Source:** Redux Auth Slice, RTK Unread Notifications query.
- **Events Emitted:** `onOpenNotifications()`, `onRoleSwitched(role)`.
- **Accessibility:** `<header role="banner">`, focusable icons.
- **Reuse:** Embedded in `AppShell`.

#### 4. `PermissionGate`
- **Type:** Custom utility component.
- **Props:** `{ permission: string | string[], fallback?: React.ReactNode, mode?: "hide" | "disable", children: React.ReactNode }`
- **Variants & States:** Authorized (renders children), Unauthorized Hidden (renders null or fallback), Unauthorized Disabled (renders cloned children with `disabled: true` and tooltip).
- **Data Source:** `useAuth()` hook reading Redux store `user.permissions`.
- **Events Emitted:** None.
- **Accessibility:** Applies `aria-disabled="true"` in disable mode.
- **Reuse:** ~45 places across Order Detail, Returns, Refunds, and TopBar actions.

---

### (B) Data Display

#### 5. `DataTable<T>`
- **Type:** Composed TanStack Table + Shadcn table primitive.
- **Props:** `{ columns: ColumnDef<T>[], data: T[], totalRows: number, page: number, pageSize: number, onPageChange: (p: number) => void, onSortChange: (sort: SortState) => void, isLoading: boolean, onRowClick?: (row: T) => void }`
- **Variants & States:** Loading (Skeleton rows), Empty (EmptyState embedded), Error, Active Data, Row Selected.
- **Data Source:** TanStack Query responses (`O-02`, `P-05`, `R-02`, `RF-03`).
- **Events Emitted:** `onPageChange`, `onSortChange`, `onRowSelectionChange`.
- **Accessibility:** `<table>` with `aria-busy={isLoading}`, sortable headers have `aria-sort="ascending|descending"`, row clickable with Enter/Space.
- **Reuse:** 4 screens: Orders List, Payments List, Returns List, Refunds List.

#### 6. `StatusBadge`
- **Type:** Composed Shadcn `Badge`.
- **Props:** `{ type: "order" | "payment" | "return" | "refund", status: string, size?: "sm" | "md" | "lg" }`
- **Variants & States:** 
  - Order: `PLACED` (blue), `CONFIRMED` (indigo), `PROCESSING` (amber), `PACKED` (purple), `SHIPPED` (sky), `OUT_FOR_DELIVERY` (teal), `DELIVERED` (emerald), `CANCELLED` (rose).
  - Payment: `PENDING` (amber), `PAID` (emerald), `FAILED` (rose), `PARTIALLY_REFUNDED` (orange), `REFUNDED` (slate).
  - Return: `REQUESTED` (amber), `APPROVED` (blue), `REJECTED` (rose), `PICKUP_SCHEDULED` (indigo), `RECEIVED` (sky), `INSPECTED` (purple), `REFUNDED` (emerald).
  - Refund: `PENDING` (amber), `PROCESSED` (emerald), `FAILED` (rose).
- **Data Source:** Entity status string.
- **Events Emitted:** None.
- **Accessibility:** Uses accessible contrast ratios (WCAG AA), includes hidden text or icon for color-blind distinction.
- **Reuse:** Over 60 places across lists, details, and cards.

#### 7. `MoneyText`
- **Type:** Custom typography component.
- **Props:** `{ amountPaise: number, currency?: string, showDecimals?: boolean, className?: string }`
- **Variants & States:** Default (slate-900), Credit/Refund (emerald-700), Discount (rose-600), Large Display (2xl bold).
- **Data Source:** Integer paise value from backend entities.
- **Events Emitted:** None.
- **Accessibility:** `<span aria-label={`${amountPaise/100} Indian Rupees`}>`.
- **Reuse:** Everywhere money is shown (~80 instances).

#### 8. `DateTimeText`
- **Type:** Custom typography component.
- **Props:** `{ isoDate: string, format?: "relative" | "absolute" | "both" }`
- **Variants & States:** Default, Tooltip showing opposite format (Hover over relative shows exact IST timestamp).
- **Data Source:** ISO-8601 UTC date string.
- **Events Emitted:** None.
- **Accessibility:** `<time dateTime={isoDate}>`.
- **Reuse:** Tables, timelines, audit trails (~50 instances).

#### 9. `OrderStatusStepper`
- **Type:** Composed state-machine progression widget.
- **Props:** `{ currentStatus: OrderStatusEnum, statusHistory: StatusHistoryItem[], onAdvance?: (targetStatus: OrderStatusEnum) => void, canAdvance?: boolean }`
- **Variants & States:** Completed Node (emerald check), Active Node (blue spinner/ring), Future Node (gray outline), Cancelled Terminal Node (red cross).
- **Data Source:** Order query (`O-03`).
- **Events Emitted:** `onAdvanceStatus(status)`.
- **Accessibility:** `<nav aria-label="Order Status Progress">`, active step has `aria-current="step"`.
- **Reuse:** `OrderDetailScreen`.

#### 10. `StatusHistoryTimeline`
- **Type:** Composed audit timeline.
- **Props:** `{ history: Array<{ from: string, to: string, by: { name: string, role: string }, at: string, note?: string }> }`
- **Variants & States:** Compact, Expanded (with notes).
- **Data Source:** Order or Return entity history array.
- **Events Emitted:** None.
- **Accessibility:** `<ol role="list">` with vertical guide lines.
- **Reuse:** `OrderDetailScreen`, `ReturnDetailScreen`.

#### 11. `ReturnToRefundTimeline`
- **Type:** Composed cross-module linked timeline.
- **Props:** `{ returnData: ReturnRecord, refundData?: RefundRecord }`
- **Variants & States:** Pending Inspection, Inspection Complete / Pending Refund, Refund Disbursed.
- **Data Source:** Joined queries `R-03` and `RF-04`.
- **Events Emitted:** `onInitiateRefund()`.
- **Accessibility:** Semantic ordered list with status announcements.
- **Reuse:** `ReturnDetailScreen`.

---

### (C) Forms and Inputs

#### 12. `LineItemsEditor`
- **Type:** Custom dynamic table form component.
- **Props:** `{ value: LineItemInput[], onChange: (items: LineItemInput[]) => void, maxAllowedQtyMap?: Record<string, number>, readOnly?: boolean }`
- **Variants & States:** Editable (combobox + stepper), Disabled/Locked, Validation Error (insufficient stock).
- **Data Source:** Local form state managed by React Hook Form `useFieldArray`.
- **Events Emitted:** `onChange(items)`.
- **Accessibility:** Row deletion requires confirmation or keyboard `Delete` key; accessible input labels.
- **Reuse:** `OrderCreateScreen`.

#### 13. `CustomerPicker`
- **Type:** Composed Shadcn `Popover` + `Command` (Combobox).
- **Props:** `{ value: string, onSelect: (customer: Customer) => void, error?: string }`
- **Variants & States:** Default, Open/Searching, Selected (displays chip with customer name, phone, email), Error.
- **Data Source:** TanStack Query `S-04` (`/customers?search=`).
- **Events Emitted:** `onSelect(customer)`.
- **Accessibility:** Combobox compliant with WAI-ARIA 1.2, arrow key navigation.
- **Reuse:** `OrderCreateScreen`.

#### 14. `ProductPicker`
- **Type:** Composed Combobox with inventory stock chip.
- **Props:** `{ onSelect: (product: Product) => void, excludedProductIds?: string[] }`
- **Variants & States:** In Stock (green badge), Low Stock (amber badge), Out of Stock (disabled, gray).
- **Data Source:** TanStack Query `S-05` (`/products?inStock=true`).
- **Events Emitted:** `onSelect(product)`.
- **Accessibility:** Screen-reader announces stock status alongside product title.
- **Reuse:** `LineItemsEditor`.

#### 15. `ReturnItemSelector`
- **Type:** Custom item-level checklist and stepper.
- **Props:** `{ deliveredItems: OrderItem[], alreadyReturnedMap: Record<string, number>, value: ReturnItemInput[], onChange: (val: ReturnItemInput[]) => void }`
- **Variants & States:** Checkbox selected, Qty stepper clamped between 1 and `deliveredQty - alreadyReturnedQty`.
- **Data Source:** Order detail payload.
- **Events Emitted:** `onChange(returnItems)`.
- **Accessibility:** Inputs bound with `aria-describedby` indicating max allowed units.
- **Reuse:** `ReturnCreateDrawer`.

#### 16. `EvidenceUploader`
- **Type:** Composed dropzone + Cloudinary upload pipeline.
- **Props:** `{ value: string[], onChange: (urls: string[]) => void, maxFiles?: number, maxSizeBytes?: number }`
- **Variants & States:** Drag-over Active, Uploading (with linear progress %), Thumbnail Preview, Upload Failed (with Retry button).
- **Data Source:** Cloudinary direct upload or Backend multipart pass-through.
- **Events Emitted:** `onChange(urls)`.
- **Accessibility:** Keyboard accessible file picker button, error messages read via `aria-live`.
- **Reuse:** `ReturnCreateDrawer`.

#### 17. `RefundAmountInput`
- **Type:** Composed numeric currency input with boundary enforcement.
- **Props:** `{ maxRefundablePaise: number, valuePaise: number, onChangePaise: (val: number) => void, autoCalculateBreakdown?: boolean }`
- **Variants & States:** Default, Full-refund autofilled, Partial refund, Over-limit error state (turns red, disables submit).
- **Data Source:** Calculated from Order paid total minus existing processed refunds.
- **Events Emitted:** `onChangePaise(integerPaise)`.
- **Accessibility:** Displays live warning text when user exceeds max refundable balance.
- **Reuse:** `CreateRefundDialog`, `RefundDetailScreen`.

---

### (D) Feedback and Overlays

#### 18. `ConfirmDialog`
- **Type:** Composed Shadcn `AlertDialog`.
- **Props:** `{ open: boolean, onOpenChange: (open: boolean) => void, title: string, description: string, confirmLabel?: string, confirmVariant?: "destructive" | "default", requiresReason?: boolean, onConfirm: (reason?: string) => Promise<void> }`
- **Variants & States:** Idle, Submitting (shows spinner, disables buttons).
- **Data Source:** Component props.
- **Events Emitted:** `onConfirm(reason)`.
- **Accessibility:** Focus locked inside dialog, Escape key cancels.
- **Reuse:** Order Cancellation, Return Rejection, Refund Disbursement (~10 instances).

#### 19. `ReturnEligibilityBanner`
- **Type:** Custom alert banner.
- **Props:** `{ deliveredDate: string, returnWindowDays: number, onInitiateReturn?: () => void }`
- **Variants & States:** Eligible (emerald alert with countdown: "X days left"), Window Expired (gray subtle notice: "Return policy window closed").
- **Data Source:** Order delivery timestamp from `statusHistory`.
- **Events Emitted:** `onInitiateReturn()`.
- **Accessibility:** Role="region", aria-label="Return Policy Eligibility".
- **Reuse:** `OrderDetailScreen`.

#### 20. `PaymentStatusPanel`
- **Type:** Composed informational card.
- **Props:** `{ order: OrderRecord, payments: PaymentRecord[], onPayClick: () => void }`
- **Variants & States:** Unpaid/Pending (action button prominent), Paid (emerald details with gateway ID), Partially Refunded (orange breakdown).
- **Data Source:** Order & Payment queries (`O-03`, `O-08`).
- **Events Emitted:** `onPayClick()`.
- **Accessibility:** Summary headings with semantic definition lists (`<dl>`).
- **Reuse:** `OrderDetailScreen`.

#### 21. `PaymentCheckoutDialog`
- **Type:** Composed modal hosting Razorpay SDK script & checkout trigger.
- **Props:** `{ open: boolean, onOpenChange: (open: boolean) => void, orderId: string, onSuccess: () => void }`
- **Variants & States:** Initializing Order, Modal Open (Razorpay rendered), Verifying Signature (spinner), Success, Failure.
- **Data Source:** Payment initialization query `P-01`.
- **Events Emitted:** `onSuccess()`, `onFailure(error)`.
- **Accessibility:** Focus trap management while iframe is launched.
- **Reuse:** Triggered from `OrderDetailScreen` and `OrderCreateScreen`.

#### 22. `NotificationPanel`
- **Type:** Composed Shadcn `Sheet` / `Popover`.
- **Props:** `{ open: boolean, onOpenChange: (open: boolean) => void }`
- **Variants & States:** Empty, List populated, Real-time item arrival (subtle slide-in animation).
- **Data Source:** TanStack Query `S-06` + Socket.IO `notification:new`.
- **Events Emitted:** `onMarkAsRead(id)`.
- **Accessibility:** Live region `aria-live="polite"` announces incoming notifications.
- **Reuse:** Anchored in `TopBar`.

---

## SECTION 5: THE HARD PARTS (UI COMPLEXITY REGISTER)

### 1. Razorpay Checkout Lifecycle & Modal State Synchronization
- **Why it is hard:** Razorpay's `Checkout.js` runs in an external sandboxed iframe injected into the DOM. Communication occurs via window message events and callback functions (`handler`, `modal.ondismiss`). If the user completes payment on Razorpay but closes the browser before the verification POST fires, or if the client verification drops offline, the UI enters a desynchronized state.
- **Failure Scenario if Mishandled:** Customer's bank account is debited ₹3,950.64. The client modal fails to call `/payments/verify`. The UI remains stuck on "PENDING - Pay Now". The user clicks "Pay Now" a second time, resulting in double-charging the customer.
- **Required UI Behavior (Precise):**
  1. User clicks "Pay via Razorpay". The button displays an inline loading spinner and disables (`disabled={true}`).
  2. Call `POST /api/v1/payments/create-order` to retrieve `razorpayOrderId`.
  3. Instantiate Razorpay with a test-mode banner prominently rendered above the modal trigger.
  4. In `modal.ondismiss`, immediately re-enable the button, display a non-error status toast: "Payment checkout closed. You can retry whenever you are ready.", and query `GET /api/v1/orders/:id/payment` to verify no capture occurred.
  5. In `handler(response)`, immediately transition UI into a full-card overlay state: *"Payment captured at gateway. Verifying cryptographic signature with CRM server..."*.
  6. Call `POST /api/v1/payments/verify`. If the network drops during this verify call, transition the UI to an amber alert state: *"Payment processing. Awaiting gateway confirmation..."* and begin background polling every 3 seconds for up to 30 seconds while listening for Socket.IO `payment:updated`.
- **Recommended Implementation:** Wrap Checkout.js in a dedicated custom hook `useRazorpayCheckout()`. Store active `razorpayOrderId` in Redux to prevent re-instantiating duplicate gateway orders if dismissed and reopened within 5 minutes.
- **Edge Cases to Test:** Network disconnection immediately after submitting OTP; user clicking "Dismiss" during 3D secure load; duplicate rapid clicking on the checkout button; testing card failure followed by immediate success.
- **Difficulty:** 5 / 5

---

### 2. "Payment Pending but Captured" Reconciliation UI
- **Why it is hard:** Webhooks and client verification calls race against each other. The client verification call might fail due to mobile network switching, but Razorpay's webhook `payment.captured` reaches the backend server 4 seconds later.
- **Failure Scenario:** The user sees a "Payment Failed" red banner even though money left their account. They file an angry support ticket or initiate a duplicate purchase.
- **Required UI Behavior:**
  1. Never mark an order definitively `FAILED` solely because the client verify call timed out.
  2. If `/payments/verify` returns a network timeout (504/abort), display an amber warning card: *"Verification pending. Checking payment gateway..."* accompanied by a pulsing status indicator.
  3. Start a 30-second exponential backoff polling cycle (`GET /api/v1/orders/:id/payment`) while listening to the Socket.IO room for event `payment:updated`.
  4. Render a secondary manual button: *"Check Gateway Status"* that triggers an explicit call to `POST /api/v1/payments/reconcile`.
  5. When the webhook or reconcile call confirms capture, animate the amber card smoothly into the green `PAID` card using Framer Motion layout animations.
- **Recommended Implementation:** A stateful wrapper component `PaymentReconciliationGuard` that monitors the `PaymentStatusPanel` and controls fallback polling intervals via TanStack Query's `refetchInterval`.
- **Edge Cases:** Gateway webhook arriving *before* the user's browser executes the `/verify` call; reconciliation finding the payment definitively failed at gateway.
- **Difficulty:** 4 / 5

---

### 3. State-Machine-Driven UI & Stale Data Conflicts (409/400 Handling)
- **Why it is hard:** In a team CRM, multiple sales reps, warehouse managers, and finance officers view the same order simultaneously. If User A advances status from `PACKED` to `SHIPPED` while User B is viewing the order, User B's screen still shows the "Cancel Order" button.
- **Failure Scenario:** User B clicks "Cancel Order" on an order that was already placed onto a delivery truck 10 seconds ago. If the backend returns `400 Bad Request: Cannot cancel shipped order`, a naive UI displays an unhelpful generic error toast and leaves the stale screen intact.
- **Required UI Behavior:**
  1. Derive every actionable button directly from the `currentStatus` using the deterministic transition matrix. If `status === 'SHIPPED'`, the cancel button must not exist in the DOM.
  2. When any status-advancing mutation returns an HTTP `400` or `409` indicating invalid transition, catch the error envelope.
  3. Do not just show an error toast. Trigger an immediate cache invalidation `queryClient.invalidateQueries(['orders', orderId])`.
  4. Render an alert dialog: *"This order was updated to [SHIPPED] by [Logistics User] 12 seconds ago. Your screen has been synchronized."*
- **Recommended Implementation:** Implement `useOrderStateMachine(order)` custom hook that encapsulates transition logic and exports flags: `{ canCancel, canAdvance, nextPossibleStatuses }`.
- **Edge Cases:** Rapid double-clicking on "Advance Status"; losing internet connectivity and regaining it after an order status was changed remotely.
- **Difficulty:** 4 / 5

---

### 4. Dynamic Order Creation Form with Strict Integer-Paise Math
- **Why it is hard:** Line items can be added, modified, or removed dynamically. Each item requires unit price in paise, discount calculation, GST rate computation, and shipping fee calculation. Floating point math in JavaScript (`0.1 + 0.2 = 0.30000000000000004`) causes 1-paise discrepancies between client-side totals preview and the server's authoritative calculation.
- **Failure Scenario:** Client calculates grand total as ₹1,999.00 (`199900` paise). Server's integer-math rounds line-item GST and computes ₹1,999.01 (`199901` paise). Razorpay order is initialized with the server total. The customer sees a price discrepancy on checkout, causing transaction abandonment.
- **Required UI Behavior:**
  1. Client-side preview math must use strict integer arithmetic: `Math.floor((unitPricePaise * qty) - discountPaise)`.
  2. The form displays a distinct helper label under the totals breakdown: *"Totals are calculated authoritatively by the server upon submission"*.
  3. On form input change (debounced 400ms), optionally fire a background dry-run calculation or execute the identical integer math utility shared with the backend (`src/utils/money.ts`).
  4. Unsaved-changes browser navigation guard (`useBlocker` or `beforeunload`) must warn the user before discarding drafted line items.
- **Recommended Implementation:** React Hook Form coupled with Zod validation. Line items array driven by `useFieldArray`. All calculations performed via dedicated integer-paise math utilities (`addPaise`, `calculateGstPaise`).
- **Edge Cases:** Selecting a product that has stock = 1 in two separate line item rows; entering negative discounts; entering quantity exceeding available inventory stock.
- **Difficulty:** 4 / 5

---

### 5. Server-Side Data Tables with URL State Synchronization
- **Why it is hard:** The orders table needs multi-column sorting, pagination, debounced full-text search, and multi-filter dropdowns (Status, Payment Status, Date Range). If this state is stored only in React `useState`, refreshing the browser or clicking "Back" from an order detail wipes out the user's filtered view.
- **Failure Scenario:** A manager filters 500 orders down to 3 pending cancellation orders, clicks into Order #2, handles it, and clicks "Back". The table resets to page 1 with all filters cleared.
- **Required UI Behavior:**
  1. Every table parameter must sync bidirectionally with URL query parameters: `/orders?page=2&status=DELIVERED&search=Aarav&sortBy=createdAt&sortOrder=desc`.
  2. Search input must be debounced by 300ms before updating the URL.
  3. When pagination or filters change, the table should retain previous data (`placeholderData: keepPreviousData`) while the new page loads, displaying a subtle top progress bar rather than a jarring blank screen.
  4. Cache invalidation must surgically target affected lists when an order status changes on a detail screen.
- **Recommended Implementation:** Use TanStack Table v8 synced to React Router's `useSearchParams`. Implement a custom hook `useTableUrlSync()`.
- **Edge Cases:** Entering non-numeric `?page=invalid` in the URL; setting a filter that yields 0 results while on page 4 (table must automatically reset to page 1).
- **Difficulty:** 3 / 5

---

### 6. Optimistic Updates with Rollback for Status Transitions
- **Why it is hard:** When a user advances an order from `CONFIRMED` to `PROCESSING`, waiting 800ms for the server roundtrip makes the CRM feel sluggish. However, if the transition fails on the backend (e.g. stock reservation failed or permission denied), the UI must smoothly rollback to the previous status without leaving phantom states.
- **Failure Scenario:** UI optimistically marks order as `SHIPPED`. The server rejects the request because the courier AWB is invalid. The UI fails to rollback; the operator prints a shipping label for an unshipped order.
- **Required UI Behavior:**
  1. On clicking "Advance Status", TanStack Query's `onMutate` immediately snapshots the current order cache, then optimistically updates the cache with the new status and synthetic timeline node.
  2. If the mutation fails, `onError` restores the exact previous cache snapshot and renders a destructive Toast with the server's rejection reason.
  3. Submit buttons must automatically disable during flight (`isPending`) to prevent duplicate mutation dispatches.
- **Recommended Implementation:** Use TanStack Query's `onMutate`, `onError`, and `onSettled` pattern inside custom mutation hooks (`useUpdateOrderStatus`).
- **Edge Cases:** User advances status and immediately navigates away before the network request resolves; multiple mutations triggered in rapid succession.
- **Difficulty:** 3 / 5

---

### 7. Return Creation: Derived Item Caps, Eligibility Countdown & Cloudinary Pipeline
- **Why it is hard:** Returns have intricate domain rules: order must be `DELIVERED`; return window must be $\le 7$ days from delivery timestamp; return quantity for each line item cannot exceed `deliveredQty - alreadyReturnedQty`; no duplicate open return can exist for an item already in `REQUESTED` status; photo evidence must be uploaded to Cloudinary with progress tracking.
- **Failure Scenario:** Customer bought 2 shirts, previously returned 1 shirt last week. The UI allows them to select qty = 2 for return. The submission fails on the server with a cryptic error after the user already waited for 3 heavy photos to upload.
- **Required UI Behavior:**
  1. Calculate remaining returnable quantity for each item: `maxQty = item.qty - (item.alreadyReturnedQty || 0)`. If `maxQty <= 0`, disable the checkbox and show a chip: *"Fully Returned"*.
  2. If an open return already exists for `prod_101`, disable that item with badge: *"Return Pending Review (#RET-9981)"*.
  3. Validate all eligibility constraints **client-side before** allowing image uploads to proceed.
  4. Cloudinary upload pipeline must validate file types (JPEG, PNG, WEBP, PDF only) and enforce a 5MB per-file ceiling. Display individual progress bars for each uploading image.
  5. If the user cancels the return drawer after uploading images, trigger a background cleanup hook to avoid leaving orphaned media on Cloudinary.
- **Recommended Implementation:** `ReturnCreateDrawer` component powered by React Hook Form. File uploads handled by a custom `useCloudinaryUpload()` hook using axios `onUploadProgress`.
- **Edge Cases:** Order delivered exactly 7 days and 1 hour ago (must show expired banner and disable submission); uploading a corrupted 0-byte image file; uploading 6 files when max is 5.
- **Difficulty:** 4 / 5

---

### 8. Refund Execution: Two-Person Separation of Duties & Balance Caps
- **Why it is hard:** Financial compliance mandates separation of authorization from execution. A Support Executive can approve a return (`returns.approve`), but only a Finance Manager (`refunds.approve`) can trigger the actual bank disbursement. Furthermore, the refund amount cannot exceed `totalPaid - totalRefunded`.
- **Failure Scenario:** A rogue or compromised support account approves a return and immediately disburses ₹50,000 to their personal card. Or, an operator accidentally issues two full refunds for the same order, resulting in direct revenue loss.
- **Required UI Behavior:**
  1. Role-based component rendering: On `ReturnDetailScreen`, the "Approve Return" button requires `returns.approve`. The "Disburse Refund" button strictly requires `refunds.approve`. If the logged-in user lacks the permission, the button is rendered in a disabled state with an explanatory lock icon: *"Restricted to Finance Manager role"*.
  2. On the refund creation dialog, calculate `maxRefundable = order.totalPaid - order.totalAlreadyRefunded`. The amount input field is strictly capped at this value.
  3. If user attempts to enter an amount $> \text{maxRefundable}$, the input displays an inline red error: *"Amount exceeds remaining paid balance of ₹X.XX"*, and the submit button disables.
  4. When executing `PATCH /api/v1/refunds/:id/process`, display an explicit confirmation modal showing: Order Total, Amount Already Refunded, This Refund Amount, Net Balance After Refund, and Target Payment Rail (Razorpay Test Card).
- **Recommended Implementation:** Enforce with `<PermissionGate permission="refunds.approve">`. Wrap the refund process action in `ProcessRefundModal` with double-confirmation checkbox.
- **Edge Cases:** Two finance managers simultaneously opening the refund modal for the same order and both clicking process (second one must receive a graceful 400 error and reload).
- **Difficulty:** 4 / 5

---

### 9. Permission-Driven UI: Hide vs. Disable vs. Explain
- **Why it is hard:** A naive frontend simply hides buttons that a user lacks permissions for. In a team demo or enterprise environment, this leads to confusion: "Why can't I see the refund button?" Users assume the app is broken rather than understanding role boundaries.
- **Failure Scenario:** A Sales Executive views a delivered order and wonders why there is no option to approve a return. They submit a bug ticket saying the approve button is missing.
- **Required UI Behavior:**
  - **Navigation/Routes:** If a user completely lacks access to a section (e.g. Sales Executive visiting `/refunds`), **hide** the sidebar link completely. If they navigate directly via URL, render the formal `403 Forbidden` page with an explanation of which permission key is missing.
  - **In-Page Action Buttons:** If a user can see an entity (e.g. Support Executive viewing an inspected return), but lacks the permission to execute the next action (`refunds.approve`), **disable** the button and wrap it in a tooltip: *"Requires permission 'refunds.approve' (Finance Manager)"*.
  - **Demo Role Switcher:** Provide a persistent floating dev toolbar in the bottom-right corner allowing the presenter to switch between `Sales Executive`, `Support Manager`, and `Finance Manager` with one click to demonstrate RBAC in action.
- **Recommended Implementation:** `<PermissionGate>` component supporting `mode="hide" | "disable"` paired with Shadcn Tooltip.
- **Edge Cases:** Token permissions being altered server-side while the user is actively working on a form.
- **Difficulty:** 3 / 5

---

### 10. Auth/Session Architecture: JWT Expiry, Silent Refresh & Axios Request Queue
- **Why it is hard:** Access tokens expire after 15 minutes. If a user is filling out a 20-line order create form and their token expires, submitting the form triggers a 401 Unauthorized. If the frontend simply redirects them to `/login`, their entire drafted order is lost.
- **Failure Scenario:** Presenter is 8 minutes into the jury demo, clicks "Submit Order", token is expired, app abruptly dumps them back onto the login page. Demo ruined.
- **Required UI Behavior:**
  1. Axios response interceptor intercepts any `401 Unauthorized`.
  2. If the 401 is encountered, pause all outgoing requests and place them into an internal memory queue.
  3. Fire a single silent refresh request: `POST /api/v1/auth/refresh` using the stored refresh token.
  4. Once a new JWT is received, update the auth token in memory, replay all queued requests with the new bearer header, and resolve the original promises seamlessly.
  5. Only if the refresh call *also* fails (refresh token expired), open the non-destructive `SessionExpiredDialog` over the current view, allowing the presenter to re-authenticate without losing form state.
- **Recommended Implementation:** Axios interceptor with a `isRefreshing` boolean flag and a `failedQueue` callback array.
- **Edge Cases:** Multiple parallel API requests firing at the exact millisecond the token expires (all must be queued, only 1 refresh call made).
- **Difficulty:** 4 / 5

---

### 11. Real-Time Socket.IO Synchronization & Notification Feed
- **Why it is hard:** Webhooks from Razorpay or updates made by other users arrive via WebSocket. If the client naive-replaces state on every event, active user interactions (like an open dropdown or form input) can flicker or reset. Furthermore, if the WebSocket disconnects, the user misses status updates.
- **Failure Scenario:** The presenter is showing an Order detail screen. In the background, Razorpay sends a `payment.captured` webhook. The page does not update until the presenter manually refreshes the browser.
- **Required UI Behavior:**
  1. Socket.IO client connects on authentication, joining rooms: `order:<orderId>` and `user:<userId>`.
  2. When an event arrives (`order:updated`, `payment:updated`), inspect the active route:
     - If the user is currently viewing the updated entity, execute a selective cache patch or trigger TanStack Query `queryClient.invalidateQueries`.
     - Display a non-intrusive floating toast: *"Payment captured via background webhook"*.
  3. If Socket.IO drops connection, display a tiny amber dot in the TopBar: *"Live sync reconnecting..."*. Upon reconnecting, automatically refetch active screen queries.
  4. Deduplicate notifications in the bell popover by tracking unique notification `_id`.
- **Recommended Implementation:** Custom `useSocketSubscription(entityType, entityId)` hook combined with Redux RTK query invalidation.
- **Edge Cases:** Rapid burst of 10 webhook events spamming 10 toast notifications (must throttle/bundle toasts within a 2-second window).
- **Difficulty:** 4 / 5

---

### 12. Robust Error Envelope Mapping to Form Fields
- **Why it is hard:** The backend returns structured errors conforming to:
  `{ success: false, message: "Validation failed", errors: [{ field: "items.0.qty", message: "Stock unavailable" }], code: "VALIDATION_ERROR" }`.
  If the frontend does not map these nested dot-notation paths back to the form library, the user only sees a generic "Validation failed" banner without knowing which input caused the failure.
- **Failure Scenario:** User creates an order with 15 line items. Item #12 is out of stock. The form displays "Validation failed" at the top. The user has to guess which item failed.
- **Required UI Behavior:**
  1. Centralized error utility `mapBackendErrorsToForm(error, setError)` iterates over the `errors` array.
  2. Calls React Hook Form's `setError("items.0.qty", { type: "server", message: "Stock unavailable" })`.
  3. The specific line item row highlights in red with the exact message rendered beneath the quantity stepper.
  4. The form automatically scrolls the first invalid field into view.
- **Recommended Implementation:** Standardized Axios error transformer paired with a reusable `useFormErrorHandler` utility.
- **Edge Cases:** Backend returns an error for a field that does not exist in the form (must fallback to rendering in a global form-level Alert banner).
- **Difficulty:** 3 / 5

---

### 13. Responsive Complexity: Desktop Data Tables to Mobile Card Views
- **Why it is hard:** Orders and returns tables contain 8+ columns: Order Number, Customer, Items Summary, Order Status, Payment Status, Grand Total, Date, Actions. On a tablet or mobile viewport, wide tables produce horizontal scrollbars that degrade usability.
- **Failure Scenario:** Presenter demonstrates the app on a mobile device or small projector screen; the action buttons are scrolled completely off-screen.
- **Required UI Behavior:**
  1. Desktop ($\ge 1024\text{px}$): Full tabular layout with sticky headers and customizable column visibility.
  2. Tablet ($768\text{px} - 1023\text{px}$): Compact table hiding secondary columns (SKU, carrier), preserving Order #, Customer, Grand Total, Statuses, Actions.
  3. Mobile ($< 768\text{px}$): Automatically unmount table markup and render an interactive vertical card stack. Each card displays customer name, order number, dual status badges, formatted amount in paise, and a tap-target action menu.
- **Recommended Implementation:** Responsive container queries or CSS breakpoint toggling within `DataTable.tsx` (`hidden md:table-cell`).
- **Edge Cases:** Switching device orientation mid-interaction; opening a modal from a mobile card view.
- **Difficulty:** 3 / 5

---

### 14. Money, Date, and Locale Correctness (Indian Market Standards)
- **Why it is hard:** The system operates strictly in Indian Rupees (INR) using integer paise, and timestamps must display in Indian Standard Time (IST). Standard JavaScript `toLocaleString()` behaves inconsistently across different operating systems, browsers, and mobile runtimes.
- **Failure Scenario:** Total displays as `₹4094.46` on Mac Chrome, but displays as `INR 4,094.46` or `NaN` on an older Windows projector browser. Or worse, paise are displayed without dividing by 100, showing ₹409446 instead of ₹4,094.46.
- **Required UI Behavior:**
  1. Single source of truth money formatter:
     ```typescript
     export function formatPaiseToRupees(paise: number): string {
       const rupees = paise / 100;
       return new Intl.NumberFormat("en-IN", {
         style: "currency",
         currency: "INR",
         minimumFractionDigits: 2,
         maximumFractionDigits: 2
       }).format(rupees);
     }
     ```
  2. Correct Indian numbering grouping: `₹12,34,567.89` (lakhs and crores, not Western millions `₹1,234,567.89`).
  3. Dates formatted explicitly with `timeZone: "Asia/Kolkata"`: `13 Nov 2026, 03:30 PM IST`.
- **Recommended Implementation:** Strict TypeScript branded types `type IntegerPaise = number & { __brand: "paise" }` and universal components `<MoneyText>` and `<DateTimeText>`.
- **Edge Cases:** Zero-value orders (₹0.00); negative adjustments; extremely large enterprise orders exceeding ₹1,00,00,000 (1 crore).
- **Difficulty:** 2 / 5

---

### 15. Printable GST Invoice View
- **Why it is hard:** Web pages do not naturally translate to physical printed paper or PDFs. Browsers print sidebars, topbars, background colors, and cut table rows directly in half across page boundaries.
- **Failure Scenario:** Presenter clicks "Print Invoice"; the browser print preview shows the dark navigation sidebar, a mangled layout, and page 1 cuts off a line item in half horizontally.
- **Required UI Behavior:**
  1. Dedicated route `/orders/:id/invoice` designed exclusively as a clean invoice document.
  2. Specialized CSS `@media print` rules:
     - Automatically hide navigation chrome, sidebars, action buttons, and back arrows (`display: none !important`).
     - Force background color printing (`-webkit-print-color-adjust: exact; print-color-adjust: exact;`).
     - Prevent table rows from splitting across physical pages (`tr { page-break-inside: avoid; }`).
     - Force page margins: `@page { margin: 15mm; size: A4 portrait; }`.
  3. Structured invoice layout displaying: Tax Invoice title, Seller GSTIN, Buyer Details, HSN/SAC codes, Taxable Value, CGST (9%), SGST (9%), Total in Rupees, and Authorized Signatory box.
- **Recommended Implementation:** A standalone clean component `InvoicePrintView` utilizing print-specific Tailwind utility classes (`print:hidden`, `print:p-0`).
- **Edge Cases:** Orders with 50+ line items spanning across 3 printed pages (table headers must repeat at the top of each page via `thead { display: table-header-group; }`).
- **Difficulty:** 3 / 5

---

### 16. Accessibility & Keyboard Navigation (WCAG AA)
- **Why it is hard:** Complex enterprise apps with modal dialogs, drawers, stepper controls, and comboboxes often trap keyboard focus, lack accessible names, or fail color-contrast checks in dark mode.
- **Failure Scenario:** A jury member asks the student team to navigate the payment modal using only the keyboard. The focus gets stuck behind the backdrop.
- **Required UI Behavior:**
  1. Every interactive dialog and drawer must use Radix UI focus traps, returning focus to the triggering element upon dismissal.
  2. Escape key closes drawers and dialogs.
  3. Status changes announce their updates to screen readers using an off-screen `aria-live="polite"` region.
  4. Contrast ratios must meet WCAG AA standards ($\ge 4.5:1$ for normal text, $\ge 3:1$ for large text) across both light and dark modes. Status badges must pair colors with clear textual labels and distinct icons.
- **Recommended Implementation:** Standardize on Radix UI / Shadcn primitives which include battle-tested accessibility attributes out of the box.
- **Edge Cases:** Navigating complex dynamic line-item rows using only the `Tab` and arrow keys.
- **Difficulty:** 3 / 5

---

### 17. Frontend Performance & Memory Optimization
- **Why it is hard:** In a CRM table with 100 orders, each with 5 line items and complex status badges, rendering 500+ DOM nodes with dynamic tooltips and popovers causes noticeable scroll lag on low-powered presentation laptops.
- **Failure Scenario:** The orders list stutters when scrolling or takes 2 seconds to re-render when typing into the search input.
- **Required UI Behavior:**
  1. Route-level code splitting using `React.lazy()` and `Suspense` for all major views (`OrdersList`, `OrderDetail`, `PaymentsList`, `ReturnsList`, `RefundsList`).
  2. Implement list virtualization (TanStack Virtual) if the page size is set to 100 rows.
  3. Memoize expensive table columns and totals calculations using `useMemo`.
  4. Ensure skeleton loaders match the exact geometric dimensions of the data rows to prevent layout shift (CLS = 0).
- **Recommended Implementation:** React Suspense wrappers at route level; skeleton loaders designed to identical pixel heights as target content.
- **Edge Cases:** Rapid switching between tabs before data finishes loading; memory leaks from uncleaned Socket.IO event listeners.
- **Difficulty:** 3 / 5

---

### 18. Testing & Simulation Strategy
- **Why it is hard:** E2E testing a flow that involves Razorpay iframe modals, third-party Cloudinary uploads, and WebSockets is notoriously brittle in CI/CD pipelines.
- **Failure Scenario:** Automated test suite breaks because Razorpay's test gateway modal changed an internal DOM class name.
- **Required UI Behavior & Test Matrix:**
  1. **Unit & Component Testing (Vitest + React Testing Library):**
     - Test integer-paise math utilities against boundary cases (0 paise, odd paise division).
     - Test `OrderStatusStepper` rendering exact permitted transitions.
     - Test `ReturnItemSelector` clamping max quantities.
  2. **E2E Integration Testing (Playwright):**
     - Mock Razorpay Checkout script globally via `page.addInitScript()`:
       ```javascript
       window.Razorpay = function(options) {
         this.open = () => {
           // Simulate successful test card capture
           options.handler({
             razorpay_order_id: options.order_id,
             razorpay_payment_id: "pay_mock_test_12345",
             razorpay_signature: "mock_signature_valid"
           });
         };
         this.on = (event, callback) => {};
       };
       ```
     - Test full demo path: Login → Create Order → Pay → Deliver → Request Return → Approve → Inspect → Process Refund.
- **Recommended Implementation:** Dedicated Playwright test spec `e2e/crm-demo-flow.spec.ts` with recorded video artifacts.
- **Edge Cases:** Testing socket disconnection recovery by simulating offline state in Playwright (`page.context().setOffline(true)`).
- **Difficulty:** 4 / 5

---

## SECTION 6: STATE AND DATA ARCHITECTURE

### 6.1 State Placement Architecture

| Layer / Store | Scope & Slice | Data Stored | Persistence Mechanism | Tooling & Implementation |
|---|---|---|---|---|
| **Global Client Store (Redux)** | `auth` slice | Current user profile, active role, permissions array, access token | In-memory + `sessionStorage` (fallback on reload) | Redux Toolkit (`createSlice`) |
| **Global Client Store (Redux)** | `ui` slice | Sidebar open/collapsed, active theme (light/dark), dev role impersonator | `localStorage` (`crm_ui_preferences`) | Redux Toolkit |
| **Global Client Store (Redux)** | `notifications` slice | Real-time toast queue, unread notification count | In-memory | Redux Toolkit |
| **Server Cache (TanStack Query)** | `orders` cache | Order listings, single order details, tracking milestones, invoices | In-memory (HTTP Cache) | TanStack Query v5 (`useQuery`) |
| **Server Cache (TanStack Query)** | `payments` cache | Payment listings, payment details, gateway reconciliation status | In-memory (HTTP Cache) | TanStack Query v5 |
| **Server Cache (TanStack Query)** | `returns` cache | Return listings, return inspection records, evidence URLs | In-memory (HTTP Cache) | TanStack Query v5 |
| **Server Cache (TanStack Query)** | `refunds` cache | Refund records, refundable balance limits | In-memory (HTTP Cache) | TanStack Query v5 |
| **URL Search Parameters** | Route query string | Table page, limit, search text, active filters, sort column/order | Browser URL bar & history stack | React Router v6 (`useSearchParams`) |
| **Form State** | Form instance | Drafted line items, customer selection, address inputs, upload files | Local component memory | React Hook Form + Zod resolvers |
| **Transient UI State** | Local component | Dialog open/close, hover states, active image preview index | Component `useState` / `useReducer` | React primitives |

---

### 6.2 TanStack Query Key Schema & Invalidation Map

#### Query Key Hierarchy
- `["orders", "list", { page, limit, status, search, ... }]`
- `["orders", "detail", orderId]`
- `["orders", "detail", orderId, "payment"]`
- `["orders", "detail", orderId, "invoice"]`
- `["payments", "list", { page, limit, status, method, ... }]`
- `["payments", "detail", paymentId]`
- `["returns", "list", { page, limit, status, orderId, ... }]`
- `["returns", "detail", returnId]`
- `["refunds", "list", { page, limit, status, orderId, ... }]`
- `["refunds", "detail", refundId]`

#### Invalidation Rules Table

| Query Key Schema | Stale Time | Cache (GC) Time | Polling Interval | Mutation Triggering Invalidation | Invalidated Query Keys |
|---|---|---|---|---|---|
| `["orders", "list", params]` | 30 seconds | 5 minutes | Off | `createOrder`, `cancelOrder`, `updateOrderStatus`, `verifyPayment` | `["orders", "list"]` (all variations) |
| `["orders", "detail", id]` | 15 seconds | 10 minutes | Off (Socket-backed) | `updateOrderStatus`, `cancelOrder`, `verifyPayment` | `["orders", "detail", id]`, `["orders", "list"]` |
| `["orders", "detail", id, "payment"]`| 10 seconds | 5 minutes | 5s when status = PENDING | `verifyPayment`, `processRefund`, `reconcilePayments` | `["orders", "detail", id, "payment"]`, `["orders", "detail", id]` |
| `["orders", "detail", id, "invoice"]`| 5 minutes | 15 minutes | Off | `updateOrderStatus` | `["orders", "detail", id, "invoice"]` |
| `["payments", "list", params]` | 30 seconds | 5 minutes | Off | `verifyPayment`, `reconcilePayments`, `manualPayment` | `["payments", "list"]`, `["orders", "list"]` |
| `["payments", "detail", id]` | 30 seconds | 10 minutes | Off | `updatePaymentStatus`, `reconcilePayments` | `["payments", "detail", id]` |
| `["returns", "list", params]` | 30 seconds | 5 minutes | Off | `createReturn`, `approveReturn`, `rejectReturn`, `updateReturnStatus` | `["returns", "list"]` |
| `["returns", "detail", id]` | 15 seconds | 10 minutes | Off | `approveReturn`, `rejectReturn`, `updateReturnStatus`, `processRefund` | `["returns", "detail", id]`, `["returns", "list"]` |
| `["refunds", "list", params]` | 30 seconds | 5 minutes | Off | `createRefund`, `processRefund` | `["refunds", "list"]` |
| `["refunds", "detail", id]` | 30 seconds | 10 minutes | Off | `processRefund` | `["refunds", "detail", id]`, `["orders", "detail"]`, `["returns", "detail"]` |

---

### 6.3 Axios Interceptor Architecture

1. **Outgoing Request Interceptor:**
   - Intercepts all requests from the React application.
   - Checks memory storage for an active JWT access token.
   - If present, attaches `Authorization: Bearer <token>` to the request headers.
   - Forwards request to the Express backend.

2. **Incoming Response Interceptor:**
   - **Status 2xx:** Returns `response.data` transparently.
   - **Status 403 (Forbidden):** Fires toast notification informing user of missing permission, or renders the inline permission guard.
   - **Status 429 (Rate Limit):** Displays a warning toast extracting the `Retry-After` header value.
   - **Status 401 (Unauthorized):**
     - Checks if a silent token refresh is already in progress (`isRefreshing`).
     - If true, appends the request's resolver callback to an internal memory queue (`failedQueue`).
     - If false, sets `isRefreshing = true` and fires `POST /api/v1/auth/refresh` using the stored refresh token.
     - On successful refresh: updates access token in memory, replays all queued requests with the new bearer token, and clears the queue.
     - On refresh failure (401/403): clears authentication state and displays the non-destructive `SessionExpiredDialog` to prevent data loss.

---

## SECTION 7: DESIGN-SYSTEM REQUIREMENTS FOR THE DESIGNER

### 7.1 Semantic Status Color Tokens

| Entity & State | Semantic Name | Light Mode Hex | Dark Mode Hex | Text / Contrast Light | Text / Contrast Dark | Usage Guidelines |
|---|---|---|---|---|---|---|
| **Order: PLACED** | `order-placed` | `#EFF6FF` (blue-50) | `#1E293B` (slate-800) | `#1D4ED8` (blue-700) | `#60A5FA` (blue-400) | Initial order draft, awaiting payment or confirm. |
| **Order: CONFIRMED** | `order-confirmed`| `#EEF2FF` (indigo-50)| `#1E1B4B` (indigo-950)| `#4338CA` (indigo-700)| `#818CF8` (indigo-400)| Payment verified or COD confirmed. |
| **Order: PROCESSING** | `order-processing`| `#FFFBEB` (amber-50)| `#451A03` (amber-950) | `#B45309` (amber-700) | `#FBBF24` (amber-400) | Warehouse picking initiated. |
| **Order: PACKED** | `order-packed` | `#FAF5FF` (purple-50)| `#3B0764` (purple-950)| `#7E22CE` (purple-700)| `#C084FC` (purple-400)| Packing slip sealed. |
| **Order: SHIPPED** | `order-shipped` | `#F0F9FF` (sky-50) | `#082F49` (sky-950) | `#0369A1` (sky-700) | `#38BDF8` (sky-400) | Courier handover complete. Cancel boundary. |
| **Order: OUT_FOR_DELIVERY**| `order-out` | `#F0FDFA` (teal-50) | `#042F2E` (teal-950) | `#0F766E` (teal-700) | `#2DD4BF` (teal-400) | Local driver dispatch. |
| **Order: DELIVERED** | `order-delivered` | `#ECFDF5` (emerald-50)| `#064E3B` (emerald-950)| `#047857` (emerald-700)| `#34D399` (emerald-400)| Final fulfilled state. Returns window opens. |
| **Order: CANCELLED** | `order-cancelled` | `#FFF1F2` (rose-50) | `#4C0519` (rose-950) | `#BE123C` (rose-700) | `#FB7185` (rose-400) | Pre-shipment abort. Stock restocked. |
| **Payment: PENDING** | `payment-pending` | `#FFFBEB` (amber-50)| `#451A03` (amber-950) | `#B45309` (amber-700) | `#FBBF24` (amber-400) | Awaiting gateway capture. |
| **Payment: PAID** | `payment-paid` | `#ECFDF5` (emerald-50)| `#064E3B` (emerald-950)| `#047857` (emerald-700)| `#34D399` (emerald-400)| Capture & signature verified. |
| **Payment: FAILED** | `payment-failed` | `#FFF1F2` (rose-50) | `#4C0519` (rose-950) | `#BE123C` (rose-700) | `#FB7185` (rose-400) | Gateway declined or signature mismatch. |
| **Payment: PART_REFUND**| `payment-part-ref`| `#FFF7ED` (orange-50)| `#431407` (orange-950)| `#C2410C` (orange-700)| `#FB923C` (orange-400)| Partial refund processed. |
| **Payment: REFUNDED** | `payment-refunded`| `#F1F5F9` (slate-100)| `#0F172A` (slate-900) | `#475569` (slate-600) | `#94A3B8` (slate-400) | Full order balance returned. |
| **Return: REQUESTED** | `return-requested`| `#FFFBEB` (amber-50)| `#451A03` (amber-950) | `#B45309` (amber-700) | `#FBBF24` (amber-400) | Customer submitted claim. |
| **Return: APPROVED** | `return-approved` | `#EFF6FF` (blue-50) | `#1E293B` (slate-800) | `#1D4ED8` (blue-700) | `#60A5FA` (blue-400) | Support manager approved. |
| **Return: REJECTED** | `return-rejected` | `#FFF1F2` (rose-50) | `#4C0519` (rose-950) | `#BE123C` (rose-700) | `#FB7185` (rose-400) | Claim denied with decision note. |
| **Return: INSPECTED** | `return-inspected`| `#FAF5FF` (purple-50)| `#3B0764` (purple-950)| `#7E22CE` (purple-700)| `#C084FC` (purple-400)| QA passed. Payout enabled. |
| **Refund: PROCESSED** | `refund-processed`| `#ECFDF5` (emerald-50)| `#064E3B` (emerald-950)| `#047857` (emerald-700)| `#34D399` (emerald-400)| Gateway money disbursement confirmed. |

---

### 7.2 Typography Scale (Tailwind CSS)

| Token Name | Font Size | Line Height | Font Weight | Letter Spacing | Primary Use Case |
|---|---|---|---|---|---|
| `text-display` | `32px` (2rem) | `40px` (2.5rem) | `700` (Bold) | `-0.02em` | Main dashboard titles, invoice title. |
| `text-h1` | `24px` (1.5rem) | `32px` (2rem) | `600` (Semibold) | `-0.01em` | Page headers (Order Detail `#ORD-XXXX`). |
| `text-h2` | `20px` (1.25rem) | `28px` (1.75rem) | `600` (Semibold) | `-0.005em` | Card section titles (Line Items, Timeline). |
| `text-h3` | `16px` (1rem) | `24px` (1.5rem) | `600` (Semibold) | `0em` | Subsections, modal dialog titles. |
| `text-body-lg` | `16px` (1rem) | `24px` (1.5rem) | `400` (Regular) | `0em` | Prominent body descriptions. |
| `text-body` | `14px` (0.875rem) | `20px` (1.25rem) | `400` (Regular) | `0em` | Standard table cell data, form inputs. |
| `text-body-medium`| `14px` (0.875rem) | `20px` (1.25rem) | `500` (Medium) | `0em` | Form labels, table headers, button labels. |
| `text-caption` | `12px` (0.75rem) | `16px` (1rem) | `400` (Regular) | `0.01em` | Helper text, relative timestamps. |
| `text-mono` | `13px` (0.8125rem)| `18px` (1.125rem)| `500` (Medium) | `0em` | Order numbers, AWB tracking, gateway IDs. |

---

### 7.3 Spacing Scale & Table Density Options

| Density Mode | Table Row Height | Cell Padding (X / Y) | Font Size | Best Suited For |
|---|---|---|---|---|
| **Compact** | `36px` | `8px` / `4px` | `13px` | High-volume order reconciliation on laptop displays. |
| **Default** *(Standard)* | `48px` | `16px` / `12px` | `14px` | Standard CRM workflows and jury demonstration view. |
| **Relaxed** | `64px` | `20px` / `16px` | `15px` | Touch-screen tablet use cases or detailed inspection tables. |

---

### 7.4 Iconography Mapping (Lucide React)

| Entity / Action | Lucide Icon Identifier | Rendered Context |
|---|---|---|
| **Orders** | `Package` | Sidebar navigation, Order list header. |
| **Payments** | `CreditCard` | Sidebar navigation, Payment methods. |
| **Returns** | `RotateCcw` | Sidebar navigation, Return drawers. |
| **Refunds** | `Banknote` | Sidebar navigation, Disbursement buttons. |
| **Order: Placed** | `Clock` | Order stepper node 1. |
| **Order: Confirmed**| `CheckCircle2` | Order stepper node 2. |
| **Order: Processing**| `Boxes` | Order stepper node 3. |
| **Order: Packed** | `PackageCheck` | Order stepper node 4. |
| **Order: Shipped** | `Truck` | Order stepper node 5. |
| **Order: Delivered**| `Home` | Order stepper node 6. |
| **Order: Cancelled**| `XCircle` | Cancelled badge, cancellation modal. |
| **Payment: Verified**| `ShieldCheck` | Signature verified indicator. |
| **Restock Hook** | `ArchiveRestore` | Warehouse return intake event. |
| **Invoice** | `FileText` / `Printer` | Invoice view & print trigger. |
| **Warning / Lock** | `AlertTriangle` / `Lock` | Permission-denied tooltips and balance caps. |

---

### 7.5 Motion & Animation Rules

- **Default Transition Speed:** `150ms` ease-in-out (`transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1)`).
- **Dialog & Drawer Slide Speed:** `250ms` ease-out.
- **Skeleton Shimmer Duration:** `1.5s` linear infinite loop.
- **Reduced Motion Support:** `@media (prefers-reduced-motion: reduce)` must disable all non-essential transform and opacity springs, substituting instant cuts.

---

### 7.6 Required Figma Frames List
The designer must supply Figma component frames covering all states:
1. `Button` (Default, Hover, Active, Disabled, Loading Spinner).
2. `StatusBadge` (All 22 discrete entity-state combinations across Light and Dark mode).
3. `DataTable` (Empty, 10-row populated, Loading Skeleton, Filtered Empty, Sort Active).
4. `OrderStatusStepper` (7 progressive steps + Cancelled branch).
5. `ReturnItemSelector` (Unselected, Selected Qty = 1, Selected Qty = Max, Fully Returned Disabled).
6. `EvidenceUploader` (Empty dropzone, Drag-over state, Upload in-progress with %, Thumbnail preview with delete pill).
7. `PaymentCheckoutDialog` (Order loading, Razorpay test frame, Verification in-flight, Verification success).
8. `InvoicePrintView` (100% scale A4 layout with print styling).

---

## SECTION 8: STATES MATRIX

| Screen Name | Loading State | Empty State | Error State | Partial Data State | Permission Denied (403) | Offline / Reconnecting | Extreme Overflow / Boundary |
|---|---|---|---|---|---|---|---|
| **Orders List** | 10 pulse-shimmer skeleton rows with fixed column widths | Illustrated box icon: *"No orders found matching filters."* Action: "Reset Filters". | Red banner: *"Failed to load orders [Retry Button]"*. Logs error to console. | Table renders with empty cells replaced by `-`. | Red inline lock badge: *"You lack 'orders.read' permission"*. | Sticky top amber pill: *"Offline. Displaying cached orders."* | Text truncated via `max-w-[180px] truncate` with full hover tooltip; numbers formatted. |
| **Order Create** | Customer & Product comboboxes show disabled mini-spinners | N/A (Form defaults with 1 empty line-item row). | Form-level Alert box detailing validation rejections. | Product selected before price loads: disables qty stepper until price resolves. | Screen blocked: 403 Full page view with role switcher. | "Place Order" button disables with tooltip: *"Internet connection required to create orders."* | 100+ line items: table virtualized; totals summary pinned sticky to right column. |
| **Order Detail** | Full page skeleton matching 3-column layout precisely | If `id` not found: 404 illustration with "Back to Orders" button. | Alert card with retry button: *"Could not retrieve order details."* | Order loads but tracking fails: Tracking card displays "Carrier tracking unavailable" without breaking page. | Status buttons hidden; view renders in read-only mode. | Status update buttons disabled; displays cached data. | Order total > ₹1,00,00,000 (1 crore): font shrinks from 24px to 20px to prevent card line-wrap. |
| **Payment Dialog** | Centered modal with spinner: *"Initializing Razorpay Test Order..."* | N/A | Modal displays error message: *"Failed to initialize gateway order."* Action: "Retry". | Gateway order generated but customer details missing: fills with "Customer" fallback. | Action button disabled with tooltip: *"Requires 'payments.create'"*. | Modal blocks opening if `navigator.onLine === false`. | Payment of ₹0.00: rejects initialization; instructs user to confirm order directly. |
| **Payments List** | Skeleton rows with monetary placeholder blocks | Illustrated credit card icon: *"No payment transactions recorded."* | Red error banner with "Retry" action. | Payment recorded without Razorpay payment ID: shows "Manual / Offline" chip. | 403 Forbidden screen. | Amber top bar: *"Live gateway sync paused"*. | 10-digit transaction references: wrapped in `<code className="text-xs">` with copy button. |
| **Returns List** | Skeleton rows with return status chips | Illustrated return box: *"No return requests in queue."* | Red alert banner with retry trigger. | Return record without evidence images: displays "No attachments provided" chip. | 403 Forbidden screen. | Displays cached returns data; hides "New Return" trigger. | Return reason with 1,000 characters: clamped to 2 lines with "Read more" modal trigger. |
| **Return Detail** | 2-column skeleton (Gallery skeleton left, timeline right) | 404 Not Found view if `returnId` invalid. | Error banner with reload action. | Images fail to load from Cloudinary: broken image fallback icon with "Re-fetch image" link. | "Approve" and "Reject" buttons hidden; timeline displayed in read-only. | Decision buttons disabled while offline. | 5 high-res 4K evidence images: lazy-loaded thumbnail strip with lightbox zoom. |
| **Refunds List** | Skeleton rows with monetary badges | Illustrated wallet: *"No refunds issued."* | Error banner with retry trigger. | Refund record without linked return: shows "Direct Cancellation Refund" tag. | 403 Forbidden screen. | Displays cached records. | Refund amount matching original payment down to 1 single paise: verified exact match. |
| **Refund Detail** | Centered card skeleton | 404 Not Found view. | Error card with retry button. | Gateway refund ID pending webhook: shows "Disbursement initiated" amber status. | "Process Payout" button disabled: *"Requires 'refunds.approve'"*. | "Process Payout" button disabled. | Partial refund of ₹0.01: successfully renders and validates. |
| **Invoice View** | Document-shaped A4 skeleton | 404 Not Found view. | Screen error banner. | Missing customer tax ID: omits GSTIN row cleanly without blank spaces. | 403 Forbidden screen. | Prints from cached browser memory. | 50 line items: breaks gracefully across 3 printed pages with repeated table headers. |

---

## SECTION 9: DEMO DATA AND RISK PLAN

### 9.1 Seed Data Specifications

#### Customer Entity Seeds
- **Customer 1 (Primary Demo):**
  - ID: `cust_101`
  - Name: `Aarav Sharma`
  - Email: `aarav.sharma@example.in`
  - Phone: `+91 98765 43210`
  - Address: `Flat 402, Indiranagar Heights, 100 Feet Road, Bengaluru, Karnataka, 560038`
- **Customer 2 (Edge / Cancellation Demo):**
  - ID: `cust_102`
  - Name: `Priyanka Patel`
  - Email: `priyanka.patel@example.in`
  - Phone: `+91 91234 56789`
  - Address: `B-12, Sector 5, Gandhinagar, Gujarat, 382006`

#### Product Catalog Seeds
- **Product 1 (Standard Unit):**
  - ID: `prod_101`
  - Name: `100% Organic Cotton T-Shirt`
  - SKU: `SKU-TSHIRT-BLK-M`
  - Unit Price: `79900` (₹799.00)
  - Tax Rate: `18%` GST (CGST 9% + SGST 9%)
  - Stock Qty: `45`
- **Product 2 (High-Value Item):**
  - ID: `prod_102`
  - Name: `Heavyweight Fleece Hoodie`
  - SKU: `SKU-HOODIE-GRY-L`
  - Unit Price: `199900` (₹1,999.00)
  - Tax Rate: `18%` GST
  - Stock Qty: `20`
- **Product 3 (Low-Stock Edge):**
  - ID: `prod_103`
  - Name: `Waterproof Trail Backpack`
  - SKU: `SKU-BAG-TRAIL-BLK`
  - Unit Price: `349900` (₹3,499.00)
  - Tax Rate: `18%` GST
  - Stock Qty: `1` *(Demonstrates stock cap warnings)*

#### Pre-Seeded Orders Across Statuses
1. `ORD-20261110-001` — Status: `DELIVERED`, Payment: `PAID` (Delivered 2 days ago $\rightarrow$ **Demonstrates Return Eligibility**).
2. `ORD-20261101-002` — Status: `DELIVERED`, Payment: `PAID` (Delivered 12 days ago $\rightarrow$ **Demonstrates 7-Day Expired Window**).
3. `ORD-20261113-003` — Status: `PLACED`, Payment: `PENDING` (Ready for live payment demo).
4. `ORD-20261112-004` — Status: `PACKED`, Payment: `PAID` (Demonstrates cancellation boundary).
5. `ORD-20261112-005` — Status: `SHIPPED`, Payment: `PAID` (Demonstrates cancellation disabled).

#### Pre-Seeded Returns Across Statuses
1. `RET-20261112-001` — Status: `REQUESTED` (Ready for Manager Approval demo).
2. `RET-20261111-002` — Status: `RECEIVED` (Ready for QA Inspection demo).
3. `RET-20261110-003` — Status: `INSPECTED` (Ready for Finance Refund Execution demo).

---

### 9.2 Razorpay Test Credentials (Test Mode)

| Method | Test Credential / Account | Expiry / PIN | OTP | Expected Outcome |
|---|---|---|---|---|
| **Domestic Card (Success)** | `4111 1111 1111 1111` | `12/32` (Any future date) | `123456` | Immediate capture $\rightarrow$ Signature verified $\rightarrow$ Status: `CONFIRMED`. |
| **Domestic Card (Failure)** | `4000 0000 0000 0002` | `12/32` | Any | Gateway returns `BAD_REQUEST_ERROR: Payment failed`. |
| **UPI Virtual Payment Address** | `success@razorpay` | N/A | Auto-approves | Captures instantly without SMS. |
| **Netbanking** | HDFC Bank (Test Bank) | Any user / pass | `123456` | Simulated bank portal redirect and approval. |

---

### 9.3 Demo Risk Register & Fallback Mitigation Plan

| Risk Description | Probability | Impact | Real-Time Detection in Demo | Immediate Fallback / Mitigation Plan |
|---|---|---|---|---|
| **1. Localhost Webhook Blocked**<br>Razorpay cannot reach `localhost:5000/webhook` because local ngrok tunnel dropped. | High | Critical | Payment captures on Razorpay modal, but Order Status remains `PLACED` instead of `CONFIRMED`. | **Fallback Built-in:** The client-side `verifySignature` endpoint (`/api/v1/payments/verify`) independently updates Order Status to `CONFIRMED`. The UI does not depend exclusively on webhooks. |
| **2. JWT Token Expires Mid-Demo**<br>Token expires while talking to jury. | Medium | High | Next click triggers 401 Unauthorized. | **Mitigation:** Silent refresh interceptor automatically handles renewal in background. If refresh fails, `SessionExpiredDialog` preserves form state. |
| **3. Cloudinary Upload Fails**<br>Poor conference Wi-Fi causes evidence upload timeout. | Medium | High | Return submission spinner hangs; photo upload throws timeout error. | **Mitigation:** Backend Cloudinary adapter includes automatic local mock generator fallback when offline or timeout occurs. |
| **4. Database Seed State Mangled**<br>Prior rehearsal left all demo orders in terminal states. | High | Critical | No orders available in `DELIVERED` status to demonstrate returns. | **Mitigation:** Dev toolbar includes a 1-click button: *"Reset Demo Seed State"* firing `POST /api/v1/dev/seed` restoring pristine fixtures in 800ms. |
| **5. Razorpay Test Gateway Downtime**<br>External Razorpay sandbox is degraded. | Low | Critical | Checkout modal fails to load iframe. | **Mitigation:** `PaymentCheckoutDialog` detects iframe load error after 5s and surfaces a "Simulate Gateway Approval" button enabled only in development mode. |

---

## SECTION 10: DELIVERY CHECKLIST & BUILD SEQUENCE

### 10.1 Definition of Done (DoD)

#### For the UI Designer (Figma Deliverables)
- [ ] 100% of screens designed across Desktop (1440px), Tablet (768px), and Mobile (375px).
- [ ] Comprehensive Component Library published containing all 22 components from Section 4.
- [ ] Complete States Matrix covered for each screen (Loading, Empty, Error, Overflow).
- [ ] Color styles strictly aligned with semantic status tokens in Section 7.1.
- [ ] Interactive Figma prototype connecting Section 1 demo walkthrough (Steps 1.0 to 1.17).

#### For the React Frontend Developer (Code Deliverables)
- [ ] Zero TypeScript errors under `strict: true`.
- [ ] Zero floating-point operations performed on money values (all money processed in integer paise).
- [ ] All 28 endpoints integrated with TanStack Query and strict Zod validation schemas.
- [ ] Full keyboard accessibility (Tab, Enter, Escape) and focus management in all modals/drawers.
- [ ] Razorpay Checkout.js integrated with complete signature verification and failure fallback polling.
- [ ] Responsive layouts passing across Chrome, Firefox, Safari, and mobile viewports.
- [ ] Playwright E2E test suite passing for the complete 17-step demo script.

---

### 10.2 Dependency-Ordered Build Sequence

The build pipeline is structured into 7 sequential milestones:
1. **Milestone 1:** Project Skeleton & Foundation (Axios, RTK, Router, AppShell).
2. **Milestone 2:** Design System & Shared Components (DataTable, Badges, MoneyText, Stepper).
3. **Milestone 3:** Orders Module Core (Orders List, Create Form, Detail View, State Machine, Invoice View).
4. **Milestone 4:** Razorpay Payment Integration (Checkout.js Modal, Signature Verify, Reconciliation).
5. **Milestone 5:** Returns Module & Cloudinary Pipeline (Eligibility Banner, Item Selector, Upload Dropzone, Review & Inspection).
6. **Milestone 6:** Refunds Module & Gateway Disbursement (Balance Validation, Two-Person Approval, Gateway Execution).
7. **Milestone 7:** Real-Time Sync, Notifications & Final Hardening (Socket.IO, Test Suites, Polish).

#### Milestone 1: Project Skeleton & Foundation
- Initialize React + Vite project with TypeScript, Tailwind CSS, and Shadcn UI.
- Configure Redux Toolkit store (`authSlice`, `uiSlice`) and TanStack Query client.
- Set up Axios instance with base URL `/api/v1`, bearer token injection, and silent token refresh queue.
- Implement Router tree with route guards (`ProtectedRoute`, `PermissionGate`).
- Build basic `AppShell`, `Sidebar`, `TopBar`, and `DevRoleSwitcher`.

#### Milestone 2: Design System & Shared Components
- Implement semantic color tokens, typography scale, and dark mode theme provider.
- Build pure data-display primitives: `<MoneyText>`, `<DateTimeText>`, and `<StatusBadge>`.
- Build reusable `<DataTable>` supporting server-side pagination, sorting, and URL sync.
- Build overlay primitives: `<ConfirmDialog>`, `<EmptyState>`, and skeleton loader blocks.

#### Milestone 3: Orders Module Core
- Build `OrdersListScreen` with status filtering and debounced search.
- Build `OrderCreateScreen` with dynamic `LineItemsEditor`, `CustomerPicker`, and integer-paise preview math.
- Build `OrderDetailScreen` mounting `OrderStatusStepper` and `StatusHistoryTimeline`.
- Wire state machine transition buttons enforcing sequential order progression and cancellation rules.
- Implement `@media print` layout for `InvoicePrintView`.

#### Milestone 4: Razorpay Payment Integration
- Inject Razorpay `Checkout.js` script dynamically via `useRazorpayCheckout` hook.
- Build `PaymentStatusPanel` inside `OrderDetailScreen`.
- Implement `PaymentCheckoutDialog` invoking `POST /api/v1/payments/create-order` and `verify`.
- Implement payment reconciliation fallback polling and manual trigger.
- Build `PaymentsListScreen` and `PaymentDetailScreen`.

#### Milestone 5: Returns Module & Cloudinary Upload Pipeline
- Implement 7-day return eligibility calculator and render `ReturnEligibilityBanner`.
- Build `ReturnCreateDrawer` with `ReturnItemSelector` (derived item quantity caps).
- Integrate Cloudinary multi-image upload pipeline with upload progress bars.
- Build `ReturnsListScreen` and `ReturnDetailScreen`.
- Implement Support Manager approval and rejection workflows with mandatory reason notes.
- Wire warehouse return status advancement (`RECEIVED` triggering restock, `INSPECTED`).

#### Milestone 6: Refunds Module & Gateway Disbursement
- Build `CreateRefundDialog` enforcing balance ceilings ($\text{Amount} \le \text{Paid} - \text{Refunded}$).
- Build `RefundsListScreen` and `RefundDetailScreen`.
- Implement two-person separation of duties: restrict payout processing strictly to `refunds.approve`.
- Implement `PATCH /api/v1/refunds/:id/process` invoking Razorpay refund API.
- Wire cross-module status updates reflecting `PARTIALLY_REFUNDED` vs `REFUNDED` on the order.

#### Milestone 7: Real-Time Sync, Notifications & Final Hardening
- Connect Socket.IO client, subscribing to `order:*`, `payment:*`, `return:*`, and `refund:*` channels.
- Build `NotificationPanel` with live badge counter.
- Test and harden all 18 items in Section 5 (The Hard Parts).
- Execute full Playwright E2E test run matching the Section 1 Demo Script.
- Seed demo fixtures and freeze code for jury presentation on 21 Nov 2026.

---

## SECTION 11: REGISTER OF ARCHITECTURAL ASSUMPTIONS

The following decisions were made to resolve gaps in source documentation and ensure self-contained delivery:

1. `[ASSUMPTION: RETURN_WINDOW_DEFAULT]` The return policy duration is strictly fixed at 7 calendar days (168 hours) calculated from the exact timestamp of the `DELIVERED` status entry in `Order.statusHistory`.
2. `[ASSUMPTION: PRORATED_TAX_REFUND]` When a partial return is initiated on an order with item-level taxes and discounts, the refundable amount per unit is calculated as:
   $$\text{Refund Unit Price} = \text{unitPrice} - \left\lfloor\frac{\text{discount}}{\text{qty}}\right\rfloor + \left\lfloor\frac{\text{tax}}{\text{qty}}\right\rfloor$$
   Shipping fees are non-refundable on partial returns.
3. `[ASSUMPTION: SINGLE_CURRENCY_INR]` The entire platform operates strictly in Indian National Rupees (INR). Multi-currency conversion is out of scope for the 21 Nov 2026 milestone.
4. `[ASSUMPTION: RAZORPAY_TEST_KEYS]` The Razorpay integration uses test-mode keys (`rzp_test_*`). Real banking transfers are simulated using Razorpay's documented magic cards and test UPI VPA handles.
5. `[ASSUMPTION: CLOUDINARY_FALLBACK]` If Cloudinary credentials are absent in local staging or offline presentation environments, the upload adapter automatically emits deterministic mock image URLs (`https://res.cloudinary.com/demo/image/upload/sample_damage.jpg`) to ensure the demo continues without breaking.
6. `[ASSUMPTION: RESTOCK_ON_RECEIVED]` Inventory restock hooks are emitted by the backend upon the return status transitioning to `RECEIVED` (warehouse intake), not waiting for financial refund completion.
7. `[ASSUMPTION: ROLE_PERMISSION_MAP]` The roles are mapped to permissions as follows:
   - `Super Admin`: All permissions.
   - `Admin`: All permissions.
   - `Sales Manager`: `orders.*`, `payments.read`.
   - `Sales Executive`: `orders.read`, `orders.create`, `orders.update_status` (up to `PACKED`), `payments.create`.
   - `Support Manager`: `orders.read`, `returns.*`.
   - `Support Executive`: `orders.read`, `returns.read`, `returns.create`.
   - `Finance Manager`: `orders.read`, `payments.*`, `refunds.approve`.
   - `Inventory Manager`: `orders.read`, `orders.update_status` (`PACKED` $\rightarrow$ `SHIPPED`), `returns.approve` (`RECEIVED`).
   - `Analyst`: `orders.read`, `payments.read`, `returns.read`.
8. `[ASSUMPTION: SESSION_TIMEOUT]` JWT access tokens expire in 15 minutes; refresh tokens expire in 7 days.
9. `[ASSUMPTION: PAGINATION_MAX]` Default pagination page size is 10 items; maximum allowable page size is capped at 100 items.
10. `[ASSUMPTION: CANCELLATION_BOUNDARY]` Orders can be cancelled by the user/agent only while in `PLACED`, `CONFIRMED`, or `PROCESSING` status. Once the status transitions to `PACKED` or `SHIPPED`, the cancellation endpoint returns `400 Bad Request`.
