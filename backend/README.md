# 🛍️ E-Commerce CRM — Orders, Payments, Returns & Refunds

[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express.js-4.21.2-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb&logoColor=white)](https://mongoosejs.com/)
[![Razorpay](https://img.shields.io/badge/Razorpay-Test%20Mode-0C2340?logo=razorpay&logoColor=white)](https://razorpay.com/)
[![Jest Tests](https://img.shields.io/badge/Tests-47%20Passed%20(100%25)-brightgreen.svg?logo=jest&logoColor=white)](https://jestjs.io/)
[![Swagger Docs](https://img.shields.io/badge/API%20Docs-Swagger%203.0-85EA2D?logo=swagger&logoColor=black)](http://localhost:5000/api-docs)
[![License](https://img.shields.io/badge/License-ISC-blue.svg)](#)

A production-ready, security-hardened **Node.js and Express.js** modular monolith backend governing the full **Order Fulfillment, Razorpay Payment Processing, and Returns & Refunds** lifecycle for an enterprise MERN E-Commerce CRM.

---

## 🎬 Terminal Recording (Live Demo)

Demonstrating the environment verification, running the 47-test suite with in-memory MongoDB, and booting the HTTP server with health probe validation:

<div align="center">
  <img src="docs/demo.gif" alt="Animated Terminal Demo" width="90%" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" />
</div>

---

## 📸 Proof of Functionality & Terminal Verification

All key phases of the application have been executed and verified in the terminal:

### 1. Dependency Installation & Clean Audit
Output of running `npm install` across all production and test dependencies:

<div align="center">
  <img src="docs/screenshots/01-install.png" alt="01 - Dependency Installation" width="90%" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" />
</div>

---

### 2. Server Startup & Live Health Probe
Starting the Express server on port 5000, establishing the database connection, printing the endpoints banner, and serving a live HTTP `GET /health` probe:

<div align="center">
  <img src="docs/screenshots/02-run.png" alt="02 - Server Execution and Health Check" width="90%" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" />
</div>

---

### 3. Comprehensive Test Suite (47 of 47 Tests Passing)
Execution of the complete Jest + Supertest suite across **Orders**, **Payments (Razorpay)**, and **Returns/Refunds** with zero regressions:

<div align="center">
  <img src="docs/screenshots/03-tests.png" alt="03 - Full Jest Test Suite" width="90%" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" />
</div>

---

## 🚀 Key Architectural Highlights

1. **Strict Integer-Paise Arithmetic**: Floating-point representations are strictly prohibited for monetary values. All subtotals, item discounts, GST taxes, grand totals, payments, and refunds are calculated and stored in **integer paise** (e.g. ₹799.00 = `79900` paise).
2. **Deterministic State Machines**:
   - **Order Lifecycle**: `PLACED` → `CONFIRMED` → `PROCESSING` → `PACKED` → `SHIPPED` → `OUT_FOR_DELIVERY` → `DELIVERED` (cancellation permitted strictly prior to `SHIPPED`).
   - **Return & Refund Lifecycle**: `REQUESTED` → `APPROVED` → `PICKUP_SCHEDULED` → `RECEIVED` → `INSPECTED` → `REFUNDED` (or `REJECTED`).
3. **Hardening & Security**:
   - `helmet` security headers.
   - Environment-scoped CORS policy.
   - `express-mongo-sanitize` defending against NoSQL injection.
   - `express-rate-limit` protecting against brute-force / DDoS attacks.
   - Append-only event histories (`statusHistory`, `events`, `history`).
   - Soft-deletions (`isArchived: true`), avoiding destructive deletions.
4. **Razorpay Payment Gateway (Test Mode)**:
   - Gateway SDK calls isolated strictly behind `src/integrations/payment/razorpay.adapter.js`.
   - Raw-body HMAC-SHA256 signature verification for webhooks (`payment.captured`, `payment.failed`, `refund.processed`).
   - Idempotency tracking via `gatewayEventId`.
5. **Cloudinary Return Evidence**:
   - Multipart file upload middleware (`multer` memory storage) piping directly to Cloudinary streams, with mock fallback for local testing.

---

## 🛠️ Quickstart & Setup

### Prerequisites
- **Node.js** `v18+` or `v20+`
- **npm** `v9+`
- **MongoDB** instance (local, Docker, or Atlas connection string)

### 1. Installation
```bash
# Clone the repository
git clone <repo-url>
cd ecommerce-crm/backend

# Install dependencies
npm install
```

### 2. Environment Configuration
Create a `.env` file from `.env.example`:
```bash
cp .env.example .env
```
Key configuration parameters:
```ini
PORT=5000
NODE_ENV=development
API_PREFIX=/api/v1
MONGODB_URI=mongodb://127.0.0.1:27017/ecommerce_crm_orders
CORS_ORIGIN=http://localhost:3000,http://localhost:5173
JWT_SECRET=supersecretdevkey1234567890abcdef_change_in_production
JWT_EXPIRES_IN=7d
RAZORPAY_KEY_ID=rzp_test_stub_key_id
RAZORPAY_KEY_SECRET=rzp_test_stub_secret
RAZORPAY_WEBHOOK_SECRET=rzp_webhook_secret_stub
RETURN_WINDOW_DAYS=7
```

### 3. Running the Server
```bash
# Run in development mode (with hot reloading via nodemon)
npm run dev

# Run in production mode
npm start
```
- **API Base URL**: `http://localhost:5000/api/v1`
- **Interactive Swagger Documentation**: `http://localhost:5000/api-docs`
- **Health Check Probe**: `http://localhost:5000/health`

### 4. Running Tests
```bash
# Run all unit and integration test suites
npm test

# Run tests with code coverage reporting
npm run test:coverage
```

---

## 📊 Workflows & State Machines

### Order Lifecycle
```mermaid
stateDiagram-v2
    [*] --> PLACED: Customer / Admin Order Creation
    PLACED --> CONFIRMED: Payment Verified / COD Confirmed
    PLACED --> CANCELLED: Cancel before shipping (Stock Restocked)
    CONFIRMED --> PROCESSING: Warehouse Pick initiated
    CONFIRMED --> CANCELLED: Cancel before shipping (Stock Restocked)
    PROCESSING --> PACKED: Packing slip verified
    PROCESSING --> CANCELLED: Cancel before shipping (Stock Restocked)
    PACKED --> SHIPPED: Courier handover & AWB assigned
    SHIPPED --> OUT_FOR_DELIVERY: Local dispatch
    OUT_FOR_DELIVERY --> DELIVERED: Proof of Delivery (Terminal)
    DELIVERED --> [*]
    CANCELLED --> [*]
```

### Return & Refund Lifecycle
```mermaid
stateDiagram-v2
    [*] --> REQUESTED: Customer Submits Return (DELIVERED within 7 days)
    REQUESTED --> APPROVED: Support Approves Return (Decision Note)
    REQUESTED --> REJECTED: Support Rejects Return (Mandatory Reason)
    APPROVED --> PICKUP_SCHEDULED: Courier Dispatched
    PICKUP_SCHEDULED --> RECEIVED: Warehouse Receipt (Triggers Inventory Restock Hook)
    RECEIVED --> INSPECTED: QA Check Passed
    INSPECTED --> REFUNDED: Finance Processes Gateway Refund
    REFUNDED --> [*]
    REJECTED --> [*]
```

---

## 📑 API Endpoint Summary

| Module | Method | Endpoint | Permission | Description |
|---|---|---|---|---|
| **Orders** | `POST` | `/api/v1/orders` | `orders.create` | Create order with server-side paise calculations |
| **Orders** | `GET` | `/api/v1/orders` | `orders.read` | Paginated, filtered, and searched order listing |
| **Orders** | `GET` | `/api/v1/orders/:id` | `orders.read` | Retrieve single order by MongoDB ID or orderNumber |
| **Orders** | `PATCH` | `/api/v1/orders/:id/status` | `orders.update_status` | Advance order along strict state machine |
| **Orders** | `POST` | `/api/v1/orders/:id/cancel` | `orders.cancel` | Cancel order prior to `SHIPPED` & trigger restock |
| **Orders** | `GET` | `/api/v1/orders/:id/invoice` | `orders.read` | Structured JSON invoice with rupee & paise totals |
| **Orders** | `GET` | `/api/v1/orders/:id/tracking` | `orders.read` | Carrier milestones & tracking status |
| **Orders** | `GET` | `/api/v1/orders/:id/payment` | `orders.read` | Payment transactions linked to order |
| **Payments** | `POST` | `/api/v1/payments/create-order` | `payments.create` | Init Razorpay order with server grandTotal |
| **Payments** | `POST` | `/api/v1/payments/verify` | `payments.create` | Verify HMAC-SHA256 signature, mark PAID, CONFIRM order |
| **Payments** | `POST` | `/api/v1/payments/webhook` | *(Public + HMAC)* | Idempotent raw-body Razorpay webhook listener |
| **Payments** | `POST` | `/api/v1/payments` | `payments.create` | Record offline/manual payment (COD, Bank Wire) |
| **Payments** | `GET` | `/api/v1/payments` | `payments.read` | List payment transactions with pagination |
| **Payments** | `GET` | `/api/v1/payments/:id` | `payments.read` | Retrieve payment by ID |
| **Payments** | `PATCH` | `/api/v1/payments/:id/status` | `payments.create` | Manual payment status override with audit logging |
| **Payments** | `POST` | `/api/v1/payments/reconcile` | `payments.create` | Reconcile aged PENDING payments with gateway |
| **Returns** | `POST` | `/api/v1/returns` | `returns.create` | Submit return (multipart or JSON; validates 7d window) |
| **Returns** | `GET` | `/api/v1/returns` | `returns.read` | List return requests with status/order filtering |
| **Returns** | `GET` | `/api/v1/returns/:id` | `returns.read` | Retrieve return details by ID or returnNumber |
| **Returns** | `PATCH` | `/api/v1/returns/:id/approve` | `returns.approve` | Approve return with mandatory decision note |
| **Returns** | `PATCH` | `/api/v1/returns/:id/reject` | `returns.approve` | Reject return with mandatory reason note |
| **Returns** | `PATCH` | `/api/v1/returns/:id/status` | `returns.approve` | Advance return status (`PICKUP_SCHEDULED` -> `RECEIVED` -> `INSPECTED`) |
| **Refunds** | `POST` | `/api/v1/refunds` | `refunds.approve` | Create pending refund for inspected return / cancelled order |
| **Refunds** | `PATCH` | `/api/v1/refunds/:id/process` | `refunds.approve` | Disburse refund via Razorpay, update order `paymentStatus` |
| **Refunds** | `GET` | `/api/v1/refunds` | `payments.read` | List refund records |
| **Refunds** | `GET` | `/api/v1/refunds/:id` | `payments.read` | Retrieve refund by ID |
| **System** | `GET` | `/health` | *(Public)* | Service health status probe |
| **System** | `GET` | `/api-docs.json` | *(Public)* | OpenAPI 3.0.3 specification JSON |

---

## 📦 Project Layout

```
ecommerce-crm/
├── README.md                            # Complete root documentation
├── .gitignore                           # Repository git ignore rules
├── docs/
│   ├── demo.gif                         # Animated terminal recording
│   └── screenshots/
│       ├── 01-install.png               # npm install screenshot
│       ├── 02-run.png                   # Server run & health check screenshot
│       └── 03-tests.png                 # Test suite run screenshot
└── backend/
    ├── package.json
    ├── .env.example
    ├── postman/
    │   └── ecommerce-crm-complete.postman_collection.json
    ├── src/
    │   ├── app.js
    │   ├── server.js
    │   ├── config/ (db.js, env.js, swagger.js)
    │   ├── integrations/
    │   │   ├── payment/razorpay.adapter.js
    │   │   ├── upload/cloudinary.adapter.js
    │   │   └── stubs/ (customer, inventory, product, notification, eventBus)
    │   ├── middleware/ (auth, error, permission, upload, validate)
    │   ├── modules/ (orders, payments, returns, refunds, audit)
    │   └── utils/ (AppError, apiResponse, money, orderNumber, stateMachines)
    └── tests/ (setup.js, orders.test.js, payments.test.js, returns_refunds.test.js)
```
