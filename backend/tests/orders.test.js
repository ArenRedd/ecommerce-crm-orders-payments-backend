const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const Order = require('../src/modules/orders/order.model');
const Payment = require('../src/modules/payments/payment.model');
const Refund = require('../src/modules/payments/refund.model');
const inventoryStub = require('../src/integrations/stubs/inventoryStub');
const { generateToken } = require('../src/middleware/auth.middleware');

describe('Orders Module (Phase 1 Deliverable)', () => {
  let adminToken;
  let viewerToken;
  let noOrdersCreateToken;
  let noOrdersCancelToken;

  const validShippingAddress = {
    street: '100 100 Feet Road, Indiranagar',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560038',
    country: 'India'
  };

  beforeAll(() => {
    // Admin with all permissions
    adminToken = generateToken({
      id: 'usr_admin_01',
      name: 'Admin User',
      role: 'admin',
      permissions: ['orders.read', 'orders.create', 'orders.update_status', 'orders.cancel', 'payments.read']
    });

    // Viewer with read only
    viewerToken = generateToken({
      id: 'usr_viewer_01',
      name: 'Read Only Viewer',
      role: 'viewer',
      permissions: ['orders.read', 'payments.read']
    });

    // Support agent missing orders.create
    noOrdersCreateToken = generateToken({
      id: 'usr_no_create_01',
      name: 'No Create User',
      role: 'support_agent',
      permissions: ['orders.read', 'orders.update_status']
    });

    // User missing orders.cancel
    noOrdersCancelToken = generateToken({
      id: 'usr_no_cancel_01',
      name: 'No Cancel User',
      role: 'support_agent',
      permissions: ['orders.read', 'orders.create', 'orders.update_status']
    });
  });

  describe('POST /api/v1/orders - Order Creation & Server-side Totals', () => {
    it('should create an order successfully with verified server-side totals in integer paise', async () => {
      const payload = {
        customerId: 'cust_101',
        customerName: 'Aarav Sharma',
        customerEmail: 'aarav.sharma@example.com',
        customerPhone: '+919876543210',
        items: [
          {
            product: 'prod_101',
            qty: 2,
            unitPrice: 79900, // ₹799.00
            discount: 0,
            tax: 14382        // 18% GST on 79900 = 14382 paise
          }
        ],
        shippingFee: 5000, // ₹50.00 in paise
        shippingAddress: validShippingAddress,
        paymentMethod: 'RAZORPAY',
        notes: 'Handle with care'
      };

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Order created successfully');

      const { order, payment } = res.body.data;

      // Assert Order Header
      expect(order.orderNumber).toMatch(/^ORD-\d{8}-[A-Z0-9]{6}$/);
      expect(order.status).toBe('PLACED');
      expect(order.paymentStatus).toBe('PENDING');
      expect(order.currency).toBe('INR');

      // Assert Exact Integer Paise Calculations:
      // subtotal = 79900 * 2 = 159800
      // discountTotal = 0
      // taxTotal = 14382 * 2 = 28764
      // shippingFee = 5000
      // grandTotal = 159800 - 0 + 28764 + 5000 = 193564
      expect(order.subtotal).toBe(159800);
      expect(order.discountTotal).toBe(0);
      expect(order.taxTotal).toBe(28764);
      expect(order.shippingFee).toBe(5000);
      expect(order.grandTotal).toBe(193564);

      // Assert Snapshot Items
      expect(order.items).toHaveLength(1);
      expect(order.items[0].sku).toBe('SKU-TSHIRT-BLK-M');
      expect(order.items[0].qty).toBe(2);

      // Assert Initial Status History entry
      expect(order.statusHistory).toHaveLength(1);
      expect(order.statusHistory[0].from).toBe('NONE');
      expect(order.statusHistory[0].to).toBe('PLACED');

      // Assert Payment placeholder creation
      expect(payment).toBeDefined();
      expect(payment.status).toBe('PENDING');
      expect(payment.amount).toBe(193564);
      expect(payment.order).toBe(order._id);

      // Verify DB persistence
      const savedOrder = await Order.findById(order._id);
      expect(savedOrder).not.toBeNull();
      const savedPayment = await Payment.findOne({ order: order._id });
      expect(savedPayment).not.toBeNull();
      expect(savedPayment.amount).toBe(193564);
    });

    it('should reject order creation with 400 when required fields are missing', async () => {
      const invalidPayload = {
        customerId: 'cust_101',
        items: [] // Empty items array should fail validation
      };

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidPayload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Request validation failed');
      expect(Array.isArray(res.body.errors)).toBe(true);
    });

    it('should reject order creation with 400 when product is out of stock', async () => {
      const oosPayload = {
        customerId: 'cust_101',
        items: [
          {
            product: 'prod_oos',
            qty: 1,
            unitPrice: 29900,
            sku: 'SKU-OUT-OF-STOCK'
          }
        ],
        shippingAddress: validShippingAddress
      };

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(oosPayload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Insufficient inventory');
    });

    it('should return 403 Forbidden when user lacks orders.create permission', async () => {
      const payload = {
        customerId: 'cust_101',
        items: [{ product: 'prod_101', qty: 1 }],
        shippingAddress: validShippingAddress
      };

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${noOrdersCreateToken}`)
        .send(payload);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Forbidden: You lack the required permission \'orders.create\'');
    });
  });

  describe('PATCH /api/v1/orders/:id/status - State Machine Transitions', () => {
    let testOrderId;

    beforeEach(async () => {
      // Seed an order in PLACED state
      const order = await Order.create({
        orderNumber: 'ORD-TEST-0001',
        customer: { customerId: 'cust_101', name: 'Test User', email: 'test@example.com' },
        items: [{ product: 'prod_101', name: 'T-Shirt', sku: 'SKU-01', qty: 1, unitPrice: 50000, tax: 9000, discount: 0 }],
        subtotal: 50000,
        discountTotal: 0,
        taxTotal: 9000,
        shippingFee: 0,
        grandTotal: 59000,
        currency: 'INR',
        shippingAddress: validShippingAddress,
        billingAddress: validShippingAddress,
        status: 'PLACED',
        paymentStatus: 'PENDING',
        statusHistory: [{ from: 'NONE', to: 'PLACED', by: { userId: '1', name: 'Admin', role: 'admin' }, at: new Date() }],
        createdBy: { userId: '1', name: 'Admin', role: 'admin' }
      });
      testOrderId = order._id.toString();
    });

    it('should allow valid sequential transitions: PLACED -> CONFIRMED -> PROCESSING -> PACKED -> SHIPPED -> OUT_FOR_DELIVERY -> DELIVERED', async () => {
      const transitions = [
        'CONFIRMED',
        'PROCESSING',
        'PACKED',
        'SHIPPED',
        'OUT_FOR_DELIVERY',
        'DELIVERED'
      ];

      for (const nextStatus of transitions) {
        const res = await request(app)
          .patch(`/api/v1/orders/${testOrderId}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status: nextStatus, note: `Moved to ${nextStatus}` });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBe(nextStatus);
      }

      // Verify the append-only status history reflects all steps
      const finalOrder = await Order.findById(testOrderId);
      expect(finalOrder.status).toBe('DELIVERED');
      expect(finalOrder.statusHistory.length).toBe(7); // initial PLACED + 6 transitions
    });

    it('should reject invalid non-sequential transition with 400 (e.g. PLACED -> DELIVERED directly)', async () => {
      const res = await request(app)
        .patch(`/api/v1/orders/${testOrderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'DELIVERED', note: 'Attempting invalid jump' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid order status transition from \'PLACED\' to \'DELIVERED\'');
    });

    it('should reject transition from a terminal state like DELIVERED with 400', async () => {
      // Put order directly into DELIVERED
      await Order.findByIdAndUpdate(testOrderId, { status: 'DELIVERED' });

      const res = await request(app)
        .patch(`/api/v1/orders/${testOrderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'PROCESSING', note: 'Attempting invalid backtrack' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid order status transition from \'DELIVERED\'');
    });
  });

  describe('POST /api/v1/orders/:id/cancel - Cancellation Rules', () => {
    let orderPlacedId;
    let orderShippedId;

    beforeEach(async () => {
      // Pre-seed an order in PLACED state
      const placedOrder = await Order.create({
        orderNumber: 'ORD-TEST-PLACED',
        customer: { customerId: 'cust_101', name: 'Test User', email: 'test@example.com' },
        items: [{ product: 'prod_101', name: 'T-Shirt', sku: 'SKU-TSHIRT-BLK-M', qty: 2, unitPrice: 50000, tax: 0, discount: 0 }],
        subtotal: 100000,
        discountTotal: 0,
        taxTotal: 0,
        shippingFee: 0,
        grandTotal: 100000,
        currency: 'INR',
        shippingAddress: validShippingAddress,
        billingAddress: validShippingAddress,
        status: 'PLACED',
        paymentStatus: 'PAID', // mark as PAID to test refund flagging
        statusHistory: [{ from: 'NONE', to: 'PLACED', by: { userId: '1', name: 'Admin', role: 'admin' }, at: new Date() }],
        createdBy: { userId: '1', name: 'Admin', role: 'admin' }
      });
      orderPlacedId = placedOrder._id.toString();

      // Pre-seed an order in SHIPPED state
      const shippedOrder = await Order.create({
        orderNumber: 'ORD-TEST-SHIPPED',
        customer: { customerId: 'cust_101', name: 'Test User', email: 'test@example.com' },
        items: [{ product: 'prod_101', name: 'T-Shirt', sku: 'SKU-TSHIRT-BLK-M', qty: 1, unitPrice: 50000, tax: 0, discount: 0 }],
        subtotal: 50000,
        discountTotal: 0,
        taxTotal: 0,
        shippingFee: 0,
        grandTotal: 50000,
        currency: 'INR',
        shippingAddress: validShippingAddress,
        billingAddress: validShippingAddress,
        status: 'SHIPPED',
        paymentStatus: 'PAID',
        statusHistory: [{ from: 'NONE', to: 'SHIPPED', by: { userId: '1', name: 'Admin', role: 'admin' }, at: new Date() }],
        createdBy: { userId: '1', name: 'Admin', role: 'admin' }
      });
      orderShippedId = shippedOrder._id.toString();
    });

    it('should successfully cancel order BEFORE shipping, release stock, and flag refund if PAID', async () => {
      const res = await request(app)
        .post(`/api/v1/orders/${orderPlacedId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Customer changed mind', note: 'Customer called support' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.order.status).toBe('CANCELLED');
      expect(res.body.data.order.cancellationReason).toBe('Customer changed mind');
      expect(res.body.data.refundRequired).toBe(true);

      // Verify Order paymentStatus was transitioned to REFUND_PENDING
      const dbOrder = await Order.findById(orderPlacedId);
      expect(dbOrder.paymentStatus).toBe('REFUND_PENDING');

      // Verify a Refund record placeholder was automatically generated
      const refundRecord = await Refund.findOne({ order: orderPlacedId });
      expect(refundRecord).not.toBeNull();
      expect(refundRecord.amount).toBe(100000);
      expect(refundRecord.status).toBe('PENDING');
    });

    it('should reject cancellation with 400 when order has reached SHIPPED status', async () => {
      const res = await request(app)
        .post(`/api/v1/orders/${orderShippedId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Tried to cancel dispatched order' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Cannot cancel order with status \'SHIPPED\'');
      expect(res.body.message).toContain('Orders can only be cancelled before SHIPPED');

      // Verify DB order status was not changed
      const dbOrder = await Order.findById(orderShippedId);
      expect(dbOrder.status).toBe('SHIPPED');
    });

    it('should return 403 when user lacks orders.cancel permission', async () => {
      const res = await request(app)
        .post(`/api/v1/orders/${orderPlacedId}/cancel`)
        .set('Authorization', `Bearer ${noOrdersCancelToken}`)
        .send({ reason: 'Unauthorized cancellation attempt' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Forbidden: You lack the required permission \'orders.cancel\'');
    });
  });

  describe('GET /api/v1/orders - Listing, Search & Filters', () => {
    beforeEach(async () => {
      await Order.create([
        {
          orderNumber: 'ORD-20261112-AA01',
          customer: { customerId: 'cust_101', name: 'Aarav Sharma', email: 'aarav@example.com' },
          items: [{ product: 'prod_101', name: 'T-Shirt', sku: 'SKU-01', qty: 1, unitPrice: 50000, tax: 0, discount: 0 }],
          subtotal: 50000,
          grandTotal: 50000,
          currency: 'INR',
          shippingAddress: validShippingAddress,
          billingAddress: validShippingAddress,
          status: 'PLACED',
          paymentStatus: 'PENDING',
          createdBy: { userId: '1', name: 'Admin', role: 'admin' }
        },
        {
          orderNumber: 'ORD-20261112-BB02',
          customer: { customerId: 'cust_102', name: 'Priya Patel', email: 'priya@example.com' },
          items: [{ product: 'prod_102', name: 'Hoodie', sku: 'SKU-02', qty: 1, unitPrice: 150000, tax: 0, discount: 0 }],
          subtotal: 150000,
          grandTotal: 150000,
          currency: 'INR',
          shippingAddress: validShippingAddress,
          billingAddress: validShippingAddress,
          status: 'DELIVERED',
          paymentStatus: 'PAID',
          createdBy: { userId: '1', name: 'Admin', role: 'admin' }
        }
      ]);
    });

    it('should list orders with pagination', async () => {
      const res = await request(app)
        .get('/api/v1/orders?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.totalRecords).toBe(2);
    });

    it('should filter orders by status', async () => {
      const res = await request(app)
        .get('/api/v1/orders?status=DELIVERED')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].orderNumber).toBe('ORD-20261112-BB02');
    });

    it('should search orders by customer name or order number', async () => {
      const res = await request(app)
        .get('/api/v1/orders?search=Priya')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].customer.name).toBe('Priya Patel');
    });
  });

  describe('Invoice, Tracking & Payment auxiliary endpoints', () => {
    let testOrderNumber;

    beforeEach(async () => {
      const order = await Order.create({
        orderNumber: 'ORD-20261112-INV01',
        customer: { customerId: 'cust_101', name: 'Aarav Sharma', email: 'aarav@example.com' },
        items: [{ product: 'prod_101', name: 'Cotton T-Shirt', sku: 'SKU-TSHIRT', qty: 2, unitPrice: 79900, tax: 14382, discount: 5000 }],
        subtotal: 159800,
        discountTotal: 10000,
        taxTotal: 28764,
        shippingFee: 4900,
        grandTotal: 183464, // 159800 - 10000 + 28764 + 4900
        currency: 'INR',
        shippingAddress: validShippingAddress,
        billingAddress: validShippingAddress,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        statusHistory: [{ from: 'NONE', to: 'CONFIRMED', by: { userId: '1', name: 'Admin', role: 'admin' }, at: new Date() }],
        createdBy: { userId: '1', name: 'Admin', role: 'admin' }
      });
      testOrderNumber = order.orderNumber;
    });

    it('GET /api/v1/orders/:id/invoice returns structured JSON invoice with formatted rupees and integer paise', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${testOrderNumber}/invoice`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const invoice = res.body.data;
      expect(invoice.invoiceNumber).toBe('INV-20261112-INV01');
      expect(invoice.summary.grandTotalPaise).toBe(183464);
      expect(invoice.summary.grandTotalRupees).toBe('1834.64');
      expect(invoice.summary.grandTotalFormatted).toContain('1,834.64');
    });

    it('GET /api/v1/orders/:id/tracking returns carrier details and milestones', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${testOrderNumber}/tracking`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const tracking = res.body.data;
      expect(tracking.carrier).toBe('BlueDart Express');
      expect(tracking.trackingNumber).toBeDefined();
      expect(Array.isArray(tracking.milestones)).toBe(true);
    });

    it('GET /api/v1/orders/:id/payment returns payment history for order', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${testOrderNumber}/payment`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderNumber).toBe(testOrderNumber);
    });
  });
});
