const request = require('supertest');
const mongoose = require('mongoose');
const crypto = require('crypto');
const app = require('../src/app');
const Order = require('../src/modules/orders/order.model');
const Payment = require('../src/modules/payments/payment.model');
const Return = require('../src/modules/returns/return.model');
const Refund = require('../src/modules/payments/refund.model');
const razorpayAdapter = require('../src/integrations/payment/razorpay.adapter');
const inventoryStub = require('../src/integrations/stubs/inventoryStub');
const { generateToken } = require('../src/middleware/auth.middleware');
const env = require('../src/config/env');

describe('Returns & Refunds Module (Phase 3 Deliverable)', () => {
  let adminToken;
  let returnsAgentToken; // has returns.approve but NOT refunds.approve
  let financeAgentToken; // has refunds.approve but NOT returns.approve
  let customerToken;     // has orders.create, returns.create

  let deliveredOrder;
  let placedOrder;
  let paidPayment;

  const validAddress = {
    street: '100 100 Feet Road, Indiranagar',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560038',
    country: 'India'
  };

  beforeAll(() => {
    adminToken = generateToken({
      id: 'usr_admin',
      name: 'System Admin',
      role: 'admin',
      permissions: ['orders.read', 'orders.create', 'orders.update_status', 'orders.cancel', 'payments.read', 'payments.create', 'returns.read', 'returns.create', 'returns.approve', 'refunds.approve']
    });

    returnsAgentToken = generateToken({
      id: 'usr_returns_agent',
      name: 'Returns Specialist',
      role: 'support_agent',
      permissions: ['orders.read', 'returns.read', 'returns.create', 'returns.approve'] // no refunds.approve
    });

    financeAgentToken = generateToken({
      id: 'usr_finance_agent',
      name: 'Finance Approver',
      role: 'manager',
      permissions: ['orders.read', 'payments.read', 'refunds.approve'] // no returns.approve
    });

    customerToken = generateToken({
      id: 'usr_customer_01',
      name: 'Test Customer',
      role: 'customer',
      permissions: ['orders.read', 'orders.create', 'payments.create', 'returns.read', 'returns.create']
    });
  });

  beforeEach(async () => {
    // Seed DELIVERED and PAID order
    deliveredOrder = await Order.create({
      orderNumber: 'ORD-20261112-DELIV1',
      customer: { customerId: 'cust_101', name: 'Aarav Sharma', email: 'aarav@example.com', phone: '+919876543210' },
      items: [
        { product: 'prod_101', name: 'Cotton T-Shirt', sku: 'SKU-TSHIRT-BLK-M', qty: 2, unitPrice: 79900, tax: 14382, discount: 0 },
        { product: 'prod_102', name: 'Fleece Hoodie', sku: 'SKU-HOODIE-GRY-L', qty: 1, unitPrice: 199900, tax: 35982, discount: 20000 }
      ],
      subtotal: 359700,
      discountTotal: 20000,
      taxTotal: 64746,
      shippingFee: 5000,
      grandTotal: 409446, // ₹4,094.46 in integer paise
      currency: 'INR',
      shippingAddress: validAddress,
      billingAddress: validAddress,
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      paymentMethod: 'RAZORPAY',
      statusHistory: [
        { from: 'NONE', to: 'PLACED', by: { userId: '1', name: 'Admin', role: 'admin' }, at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) },
        { from: 'PLACED', to: 'CONFIRMED', by: { userId: '1', name: 'Admin', role: 'admin' }, at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
        { from: 'CONFIRMED', to: 'DELIVERED', by: { userId: '1', name: 'Admin', role: 'admin' }, at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } // 2 days ago (within 7-day window)
      ],
      createdBy: { userId: '1', name: 'Admin', role: 'admin' }
    });

    paidPayment = await Payment.create({
      order: deliveredOrder._id,
      amount: deliveredOrder.grandTotal,
      currency: 'INR',
      method: 'RAZORPAY',
      status: 'PAID',
      razorpayOrderId: 'order_test_rzp_deliv1',
      razorpayPaymentId: 'pay_test_rzp_deliv1',
      paidAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    });

    // Seed an undelivered PLACED order
    placedOrder = await Order.create({
      orderNumber: 'ORD-20261112-PLACED1',
      customer: { customerId: 'cust_101', name: 'Aarav Sharma', email: 'aarav@example.com' },
      items: [{ product: 'prod_101', name: 'T-Shirt', sku: 'SKU-01', qty: 1, unitPrice: 50000, tax: 0, discount: 0 }],
      subtotal: 50000,
      grandTotal: 50000,
      currency: 'INR',
      shippingAddress: validAddress,
      billingAddress: validAddress,
      status: 'PLACED',
      paymentStatus: 'PENDING',
      createdBy: { userId: '1', name: 'Admin', role: 'admin' }
    });

    // Mock Razorpay adapter methods
    jest.spyOn(razorpayAdapter, 'createOrder').mockImplementation(async ({ amount, currency, receipt, notes }) => {
      return {
        id: `order_rzp_${Date.now()}`,
        entity: 'order',
        amount,
        amount_paid: 0,
        amount_due: amount,
        currency,
        receipt,
        status: 'created',
        notes
      };
    });

    jest.spyOn(razorpayAdapter, 'createRefund').mockImplementation(async ({ paymentId, amount, notes }) => {
      return {
        id: `rfnd_mock_${Date.now()}`,
        entity: 'refund',
        amount,
        currency: 'INR',
        payment_id: paymentId,
        notes,
        status: 'processed',
        created_at: Math.floor(Date.now() / 1000)
      };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Returns Eligibility Rules', () => {
    it('should reject return request if order is not in DELIVERED status (400)', async () => {
      const res = await request(app)
        .post('/api/v1/returns')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          orderId: placedOrder.orderNumber,
          items: [{ product: 'prod_101', qty: 1, reason: 'Defective' }],
          reason: 'Item defective'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Returns are only permitted for \'DELIVERED\' orders');
    });

    it('should reject return request if return window of 7 days has expired (400)', async () => {
      // Create order delivered 10 days ago (window expired)
      const expiredOrder = await Order.create({
        orderNumber: 'ORD-20261112-EXPIRED',
        customer: { customerId: 'cust_101', name: 'Aarav Sharma', email: 'aarav@example.com' },
        items: [{ product: 'prod_101', name: 'T-Shirt', sku: 'SKU-01', qty: 1, unitPrice: 50000, tax: 0, discount: 0 }],
        subtotal: 50000,
        grandTotal: 50000,
        currency: 'INR',
        shippingAddress: validAddress,
        billingAddress: validAddress,
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        statusHistory: [
          { from: 'SHIPPED', to: 'DELIVERED', by: { userId: '1', name: 'Admin', role: 'admin' }, at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) } // 10 days ago
        ],
        createdBy: { userId: '1', name: 'Admin', role: 'admin' }
      });

      const res = await request(app)
        .post('/api/v1/returns')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          orderId: expiredOrder.orderNumber,
          items: [{ product: 'prod_101', qty: 1, reason: 'Does not fit' }],
          reason: 'Too large'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Return window of 7 days has expired');
    });

    it('should reject return if requested quantity exceeds delivered quantity (400)', async () => {
      const res = await request(app)
        .post('/api/v1/returns')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          orderId: deliveredOrder.orderNumber,
          items: [{ product: 'prod_101', qty: 5, reason: 'Defective' }], // Order only has qty 2!
          reason: 'Returning more than delivered'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('exceeds available delivered quantity');
    });

    it('should successfully create a valid return request with calculated refund amount', async () => {
      const res = await request(app)
        .post('/api/v1/returns')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          orderId: deliveredOrder.orderNumber,
          items: [{ product: 'prod_101', qty: 1, reason: 'Stitching frayed' }],
          reason: 'Quality defect',
          evidence: ['https://res.cloudinary.com/demo/image/upload/sample_damage.jpg']
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('REQUESTED');
      expect(res.body.data.returnNumber).toMatch(/^RET-\d{8}-[A-Z0-9]{6}$/);
      expect(res.body.data.refundAmount).toBe(87091); // 79900 + 7191 (prorated tax for 1 of 2 units) = 87091 paise
      expect(res.body.data.evidence).toHaveLength(1);
    });

    it('should reject duplicate open return request for the same item (400)', async () => {
      // First return request for prod_101
      await request(app)
        .post('/api/v1/returns')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          orderId: deliveredOrder.orderNumber,
          items: [{ product: 'prod_101', qty: 1, reason: 'First claim' }],
          reason: 'Defect'
        });

      // Second return request for same item while first is still REQUESTED
      const duplicateRes = await request(app)
        .post('/api/v1/returns')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          orderId: deliveredOrder.orderNumber,
          items: [{ product: 'prod_101', qty: 1, reason: 'Duplicate claim' }],
          reason: 'Defect'
        });

      expect(duplicateRes.status).toBe(400);
      expect(duplicateRes.body.success).toBe(false);
      expect(duplicateRes.body.message).toContain('is already in progress for product');
    });
  });

  describe('Return Authorization & State Transitions', () => {
    let returnRecord;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/v1/returns')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          orderId: deliveredOrder.orderNumber,
          items: [{ product: 'prod_102', qty: 1, reason: 'Zipper stuck' }],
          reason: 'Hardware defect'
        });
      returnRecord = res.body.data;
    });

    it('PATCH /api/v1/returns/:id/approve authorizes return with decision note', async () => {
      const res = await request(app)
        .patch(`/api/v1/returns/${returnRecord._id}/approve`)
        .set('Authorization', `Bearer ${returnsAgentToken}`)
        .send({ decisionNote: 'Defect verified via photo evidence. Approved.' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('APPROVED');
      expect(res.body.data.decisionNote).toContain('Defect verified');
      expect(res.body.data.decisionBy.name).toBe('Returns Specialist');
    });

    it('PATCH /api/v1/returns/:id/reject rejects return with mandatory reason note', async () => {
      const res = await request(app)
        .patch(`/api/v1/returns/${returnRecord._id}/reject`)
        .set('Authorization', `Bearer ${returnsAgentToken}`)
        .send({ decisionNote: 'Item tags removed and washed, ineligible under policy.' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('REJECTED');
      expect(res.body.data.decisionNote).toContain('Item tags removed');
    });

    it('should progress along sequential state machine: APPROVED -> PICKUP_SCHEDULED -> RECEIVED -> INSPECTED', async () => {
      // Step 1: Approve
      await request(app)
        .patch(`/api/v1/returns/${returnRecord._id}/approve`)
        .set('Authorization', `Bearer ${returnsAgentToken}`)
        .send({ decisionNote: 'Approved' });

      // Step 2: Pickup Scheduled
      const pickupRes = await request(app)
        .patch(`/api/v1/returns/${returnRecord._id}/status`)
        .set('Authorization', `Bearer ${returnsAgentToken}`)
        .send({ status: 'PICKUP_SCHEDULED', note: 'Courier dispatched' });
      expect(pickupRes.status).toBe(200);
      expect(pickupRes.body.data.status).toBe('PICKUP_SCHEDULED');

      // Step 3: Received (triggers restock hook)
      const receivedRes = await request(app)
        .patch(`/api/v1/returns/${returnRecord._id}/status`)
        .set('Authorization', `Bearer ${returnsAgentToken}`)
        .send({ status: 'RECEIVED', note: 'Received at fulfillment center' });
      expect(receivedRes.status).toBe(200);
      expect(receivedRes.body.data.status).toBe('RECEIVED');
      expect(receivedRes.body.data.restocked).toBe(true);

      // Step 4: Inspected
      const inspectedRes = await request(app)
        .patch(`/api/v1/returns/${returnRecord._id}/status`)
        .set('Authorization', `Bearer ${returnsAgentToken}`)
        .send({ status: 'INSPECTED', note: 'QA check passed, ready for refund' });
      expect(inspectedRes.status).toBe(200);
      expect(inspectedRes.body.data.status).toBe('INSPECTED');
    });

    it('should reject invalid state transition with 400 (e.g. REQUESTED -> REFUNDED directly)', async () => {
      const res = await request(app)
        .patch(`/api/v1/returns/${returnRecord._id}/status`)
        .set('Authorization', `Bearer ${returnsAgentToken}`)
        .send({ status: 'REFUNDED' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid return status transition');
    });
  });

  describe('Refunds Execution & Gateway Integration', () => {
    let inspectedReturn;

    beforeEach(async () => {
      // Create return for prod_101
      const res = await request(app)
        .post('/api/v1/returns')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          orderId: deliveredOrder.orderNumber,
          items: [{ product: 'prod_101', qty: 1, reason: 'Faded color' }],
          reason: 'Quality issue'
        });

      const retId = res.body.data._id;

      // Fast-forward to INSPECTED
      await Return.findByIdAndUpdate(retId, {
        status: 'INSPECTED',
        refundAmount: 94282,
        history: [{ from: 'RECEIVED', to: 'INSPECTED', by: { userId: '1', name: 'Admin', role: 'admin' }, at: new Date() }]
      });

      inspectedReturn = await Return.findById(retId);
    });

    it('POST /api/v1/refunds creates pending refund for inspected return', async () => {
      const res = await request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${financeAgentToken}`)
        .send({
          returnId: inspectedReturn._id.toString(),
          notes: 'Customer approved refund'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.amount).toBe(94282); // matches return calculated refund amount
      expect(res.body.data.refundNumber).toMatch(/^REF-\d{8}-[A-Z0-9]{6}$/);
    });

    it('rejects refund if amount exceeds paid balance (400)', async () => {
      const res = await request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${financeAgentToken}`)
        .send({
          returnId: inspectedReturn._id.toString(),
          amount: 99999999 // Way higher than order grandTotal
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('exceeds available refundable balance');
    });

    it('PATCH /api/v1/refunds/:id/process executes partial refund and sets Order.paymentStatus = PARTIALLY_REFUNDED', async () => {
      // 1. Create partial refund
      const createRes = await request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${financeAgentToken}`)
        .send({
          returnId: inspectedReturn._id.toString(),
          amount: 94282 // partial amount of total 409446
        });

      const refundId = createRes.body.data._id;

      // 2. Process refund (separate permission refunds.approve)
      const processRes = await request(app)
        .patch(`/api/v1/refunds/${refundId}/process`)
        .set('Authorization', `Bearer ${financeAgentToken}`)
        .send({ notes: 'Disbursed via Razorpay' });

      expect(processRes.status).toBe(200);
      expect(processRes.body.success).toBe(true);
      expect(processRes.body.data.refund.status).toBe('PROCESSED');
      expect(processRes.body.data.refund.razorpayRefundId).toMatch(/^rfnd_mock_/);

      // Verify order payment status is PARTIALLY_REFUNDED
      const dbOrder = await Order.findById(deliveredOrder._id);
      expect(dbOrder.paymentStatus).toBe('PARTIALLY_REFUNDED');

      // Verify return status is updated to REFUNDED
      const dbReturn = await Return.findById(inspectedReturn._id);
      expect(dbReturn.status).toBe('REFUNDED');
    });

    it('executes full refund and sets Order.paymentStatus = REFUNDED', async () => {
      // Create full refund for remainder
      const createRes = await request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${financeAgentToken}`)
        .send({
          orderId: deliveredOrder._id.toString(),
          amount: deliveredOrder.grandTotal
        });

      const refundId = createRes.body.data._id;

      const processRes = await request(app)
        .patch(`/api/v1/refunds/${refundId}/process`)
        .set('Authorization', `Bearer ${financeAgentToken}`)
        .send({ notes: 'Full order refund' });

      expect(processRes.status).toBe(200);
      expect(processRes.body.data.refund.status).toBe('PROCESSED');

      const dbOrder = await Order.findById(deliveredOrder._id);
      expect(dbOrder.paymentStatus).toBe('REFUNDED');
    });
  });

  describe('Refund Webhook Idempotency & Out-of-Order Handling', () => {
    it('should process refund.processed webhook event idempotently', async () => {
      // Seed a pending refund
      const refund = await Refund.create({
        refundNumber: 'REF-TEST-001',
        order: deliveredOrder._id,
        payment: paidPayment._id,
        amount: 94282,
        currency: 'INR',
        status: 'PENDING',
        razorpayRefundId: 'rfnd_webhook_test_01'
      });

      const webhookPayload = {
        entity: 'event',
        event: 'refund.processed',
        id: 'evt_refund_processed_99',
        payload: {
          refund: {
            entity: {
              id: 'rfnd_webhook_test_01',
              payment_id: 'pay_test_rzp_deliv1',
              amount: 94282,
              status: 'processed'
            }
          }
        }
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');

      // Call webhook
      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(rawBody);

      expect(res.status).toBe(200);

      const dbRefund = await Refund.findById(refund._id);
      expect(dbRefund.status).toBe('PROCESSED');

      // Duplicate webhook call should be idempotent
      const dupRes = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(rawBody);

      expect(dupRes.status).toBe(200);
    });
  });

  describe('RBAC Permission Matrix', () => {
    it('returns agent cannot process refunds (403 Forbidden)', async () => {
      const refund = await Refund.create({
        refundNumber: 'REF-PERM-01',
        order: deliveredOrder._id,
        payment: paidPayment._id,
        amount: 50000,
        currency: 'INR',
        status: 'PENDING'
      });

      const res = await request(app)
        .patch(`/api/v1/refunds/${refund._id}/process`)
        .set('Authorization', `Bearer ${returnsAgentToken}`) // lacks refunds.approve
        .send();

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Forbidden: You lack the required permission \'refunds.approve\'');
    });

    it('finance agent cannot approve returns (403 Forbidden)', async () => {
      const returnDoc = await Return.create({
        returnNumber: 'RET-PERM-01',
        order: deliveredOrder._id,
        items: [{ product: 'prod_101', qty: 1, reason: 'test' }],
        reason: 'test',
        status: 'REQUESTED'
      });

      const res = await request(app)
        .patch(`/api/v1/returns/${returnDoc._id}/approve`)
        .set('Authorization', `Bearer ${financeAgentToken}`) // lacks returns.approve
        .send({ decisionNote: 'Should fail' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Forbidden: You lack the required permission \'returns.approve\'');
    });
  });

  describe('End-to-End API Flow (Create Order -> Pay -> Deliver -> Return -> Approve -> Inspect -> Refund)', () => {
    it('should complete the entire ecommerce lifecycle cleanly', async () => {
      // 1. Create Order
      const createOrderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          customerId: 'cust_101',
          items: [{ product: 'prod_101', qty: 1 }],
          shippingAddress: validAddress
        });
      expect(createOrderRes.status).toBe(201);
      const order = createOrderRes.body.data.order;
      const orderId = order._id;

      // 2. Initialize Payment & Verify Payment
      const createPayRes = await request(app)
        .post('/api/v1/payments/create-order')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ orderId });
      expect(createPayRes.status).toBe(201);
      const rzpOrderId = createPayRes.body.data.razorpayOrderId;

      jest.spyOn(razorpayAdapter, 'verifySignature').mockReturnValueOnce(true);
      jest.spyOn(razorpayAdapter, 'fetchPayment').mockResolvedValueOnce({
        id: 'pay_e2e_123',
        amount: order.grandTotal,
        currency: 'INR',
        status: 'captured'
      });

      const verifyRes = await request(app)
        .post('/api/v1/payments/verify')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          razorpay_order_id: rzpOrderId,
          razorpay_payment_id: 'pay_e2e_123',
          razorpay_signature: 'sig_mock_valid'
        });
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.order.status).toBe('CONFIRMED');

      // 3. Fast-forward order along state machine to DELIVERED
      const statuses = ['PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
      for (const s of statuses) {
        const transRes = await request(app)
          .patch(`/api/v1/orders/${orderId}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status: s });
        expect(transRes.status).toBe(200);
      }

      // 4. Customer submits Return
      const returnRes = await request(app)
        .post('/api/v1/returns')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          orderId,
          items: [{ product: 'prod_101', qty: 1, reason: 'Wrong color' }],
          reason: 'Item not as shown'
        });
      expect(returnRes.status).toBe(201);
      const returnId = returnRes.body.data._id;
      expect(returnRes.body.data.status).toBe('REQUESTED');

      // 5. Support approves Return
      const approveRes = await request(app)
        .patch(`/api/v1/returns/${returnId}/approve`)
        .set('Authorization', `Bearer ${returnsAgentToken}`)
        .send({ decisionNote: 'Approved for pickup' });
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe('APPROVED');

      // 6. Progress return to INSPECTED
      await request(app)
        .patch(`/api/v1/returns/${returnId}/status`)
        .set('Authorization', `Bearer ${returnsAgentToken}`)
        .send({ status: 'PICKUP_SCHEDULED' });

      await request(app)
        .patch(`/api/v1/returns/${returnId}/status`)
        .set('Authorization', `Bearer ${returnsAgentToken}`)
        .send({ status: 'RECEIVED' });

      const inspectedRes = await request(app)
        .patch(`/api/v1/returns/${returnId}/status`)
        .set('Authorization', `Bearer ${returnsAgentToken}`)
        .send({ status: 'INSPECTED', note: 'QA approved' });
      expect(inspectedRes.status).toBe(200);
      expect(inspectedRes.body.data.status).toBe('INSPECTED');

      // 7. Finance creates and processes Refund
      const refundCreateRes = await request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${financeAgentToken}`)
        .send({ returnId });
      expect(refundCreateRes.status).toBe(201);
      const refundId = refundCreateRes.body.data._id;

      const refundProcessRes = await request(app)
        .patch(`/api/v1/refunds/${refundId}/process`)
        .set('Authorization', `Bearer ${financeAgentToken}`)
        .send({ notes: 'Refund disbursed via Razorpay' });
      expect(refundProcessRes.status).toBe(200);
      expect(refundProcessRes.body.data.refund.status).toBe('PROCESSED');

      // Verify final states
      const finalOrder = await Order.findById(orderId);
      expect(finalOrder.paymentStatus).toBe('REFUNDED');

      const finalReturn = await Return.findById(returnId);
      expect(finalReturn.status).toBe('REFUNDED');
    });
  });
});
