const request = require('supertest');
const mongoose = require('mongoose');
const crypto = require('crypto');
const app = require('../src/app');
const Order = require('../src/modules/orders/order.model');
const Payment = require('../src/modules/payments/payment.model');
const razorpayAdapter = require('../src/integrations/payment/razorpay.adapter');
const { generateToken } = require('../src/middleware/auth.middleware');
const env = require('../src/config/env');

describe('Payments Module with Razorpay (Phase 2 Deliverable)', () => {
  let adminToken;
  let viewerToken;
  let testOrder;
  let testPayment;

  const validShippingAddress = {
    street: '100 100 Feet Road, Indiranagar',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560038',
    country: 'India'
  };

  beforeAll(() => {
    adminToken = generateToken({
      id: 'usr_admin_01',
      name: 'Admin User',
      role: 'admin',
      permissions: ['orders.read', 'orders.create', 'payments.read', 'payments.create']
    });

    viewerToken = generateToken({
      id: 'usr_viewer_01',
      name: 'Read Only Viewer',
      role: 'viewer',
      permissions: ['orders.read', 'payments.read'] // missing payments.create
    });
  });

  beforeEach(async () => {
    // Seed an order with server-side calculated totals in paise
    testOrder = await Order.create({
      orderNumber: 'ORD-20261112-PAY01',
      customer: { customerId: 'cust_101', name: 'Aarav Sharma', email: 'aarav@example.com', phone: '+919876543210' },
      items: [
        { product: 'prod_101', name: 'T-Shirt', sku: 'SKU-01', qty: 2, unitPrice: 79900, tax: 14382, discount: 0 }
      ],
      subtotal: 159800,
      discountTotal: 0,
      taxTotal: 28764,
      shippingFee: 5000,
      grandTotal: 193564, // ₹1,935.64 in integer paise
      currency: 'INR',
      shippingAddress: validShippingAddress,
      billingAddress: validShippingAddress,
      status: 'PLACED',
      paymentStatus: 'PENDING',
      paymentMethod: 'RAZORPAY',
      statusHistory: [{ from: 'NONE', to: 'PLACED', by: { userId: '1', name: 'Admin', role: 'admin' }, at: new Date() }],
      createdBy: { userId: '1', name: 'Admin', role: 'admin' }
    });

    // Seed a pending payment linked to the order
    testPayment = await Payment.create({
      order: testOrder._id,
      amount: testOrder.grandTotal,
      currency: 'INR',
      method: 'RAZORPAY',
      status: 'PENDING',
      razorpayOrderId: 'order_test_rpq123',
      events: [{ event: 'PAYMENT_PENDING_INITIALIZED', payload: { amount: testOrder.grandTotal }, receivedAt: new Date() }]
    });

    // Mock Razorpay adapter methods by default
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

    jest.spyOn(razorpayAdapter, 'verifySignature').mockImplementation(({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) => {
      // Valid if signature ends with 'VALID' or matches mock pattern
      return razorpaySignature === 'valid_mock_signature';
    });

    jest.spyOn(razorpayAdapter, 'fetchPayment').mockImplementation(async (paymentId) => {
      return {
        id: paymentId,
        entity: 'payment',
        amount: 193564,
        currency: 'INR',
        status: 'captured',
        order_id: 'order_test_rpq123'
      };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/v1/payments/create-order', () => {
    it('should create Razorpay order with server-side grandTotal in integer paise', async () => {
      const res = await request(app)
        .post('/api/v1/payments/create-order')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ orderId: testOrder.orderNumber });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.amount).toBe(193564); // Server-side grandTotal
      expect(res.body.data.currency).toBe('INR');
      expect(res.body.data.razorpayOrderId).toMatch(/^order_rzp_/);
      expect(res.body.data.orderNumber).toBe(testOrder.orderNumber);

      // Verify Payment record was updated with the new razorpayOrderId
      const updatedPayment = await Payment.findOne({ order: testOrder._id });
      expect(updatedPayment.razorpayOrderId).toBe(res.body.data.razorpayOrderId);
    });

    it('should reject double payment with 400 when order is already PAID', async () => {
      // Mark order as PAID
      await Order.findByIdAndUpdate(testOrder._id, { paymentStatus: 'PAID' });

      const res = await request(app)
        .post('/api/v1/payments/create-order')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ orderId: testOrder._id.toString() });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('is already PAID. Duplicate payment creation is prohibited.');
    });

    it('should return 403 Forbidden when user lacks payments.create permission', async () => {
      const res = await request(app)
        .post('/api/v1/payments/create-order')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ orderId: testOrder.orderNumber });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Forbidden');
    });
  });

  describe('POST /api/v1/payments/verify', () => {
    it('should verify valid signature, mark payment and order as PAID, and advance status to CONFIRMED', async () => {
      const res = await request(app)
        .post('/api/v1/payments/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          razorpay_order_id: 'order_test_rpq123',
          razorpay_payment_id: 'pay_test_rpq987',
          razorpay_signature: 'valid_mock_signature'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.payment.status).toBe('PAID');
      expect(res.body.data.order.paymentStatus).toBe('PAID');
      expect(res.body.data.order.status).toBe('CONFIRMED');

      // Verify DB persistence
      const dbPayment = await Payment.findById(testPayment._id);
      expect(dbPayment.status).toBe('PAID');
      expect(dbPayment.razorpayPaymentId).toBe('pay_test_rpq987');
      expect(dbPayment.paidAt).not.toBeNull();

      const dbOrder = await Order.findById(testOrder._id);
      expect(dbOrder.paymentStatus).toBe('PAID');
      expect(dbOrder.status).toBe('CONFIRMED');
      expect(dbOrder.statusHistory.length).toBe(2);
      expect(dbOrder.statusHistory[1].to).toBe('CONFIRMED');
    });

    it('should reject invalid signature with 400 and mark payment as FAILED', async () => {
      const res = await request(app)
        .post('/api/v1/payments/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          razorpay_order_id: 'order_test_rpq123',
          razorpay_payment_id: 'pay_test_rpq987',
          razorpay_signature: 'tampered_invalid_signature'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid Razorpay signature');

      // Verify payment marked as FAILED in DB
      const dbPayment = await Payment.findById(testPayment._id);
      expect(dbPayment.status).toBe('FAILED');
      expect(dbPayment.failureReason).toContain('Signature verification failed');
    });

    it('should reject payment with 400 on amount mismatch between gateway and database', async () => {
      // Mock fetchPayment returning a different amount (e.g. 50000 instead of 193564)
      jest.spyOn(razorpayAdapter, 'fetchPayment').mockImplementationOnce(async () => {
        return {
          id: 'pay_test_rpq987',
          amount: 50000, // Amount mismatch!
          currency: 'INR',
          status: 'captured'
        };
      });

      const res = await request(app)
        .post('/api/v1/payments/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          razorpay_order_id: 'order_test_rpq123',
          razorpay_payment_id: 'pay_test_rpq987',
          razorpay_signature: 'valid_mock_signature'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Amount mismatch');

      const dbPayment = await Payment.findById(testPayment._id);
      expect(dbPayment.status).toBe('FAILED');
      expect(dbPayment.failureReason).toContain('Amount mismatch');
    });
  });

  describe('POST /api/v1/payments/webhook - Raw Body & Idempotency', () => {
    const generateWebhookHeader = (bodyString, secret = env.RAZORPAY_WEBHOOK_SECRET) => {
      return crypto.createHmac('sha256', secret).update(bodyString).digest('hex');
    };

    it('should process payment.captured event and mark order & payment as PAID', async () => {
      const webhookPayload = {
        entity: 'event',
        account_id: 'acc_test_01',
        event: 'payment.captured',
        id: 'evt_test_captured_001',
        payload: {
          payment: {
            entity: {
              id: 'pay_webhook_cap_123',
              order_id: 'order_test_rpq123',
              amount: 193564,
              currency: 'INR',
              status: 'captured',
              created_at: 1731422400
            }
          }
        }
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = generateWebhookHeader(rawBody);

      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbPayment = await Payment.findById(testPayment._id);
      expect(dbPayment.status).toBe('PAID');
      expect(dbPayment.razorpayPaymentId).toBe('pay_webhook_cap_123');
      expect(dbPayment.gatewayEventId).toBe('evt_test_captured_001');

      const dbOrder = await Order.findById(testOrder._id);
      expect(dbOrder.paymentStatus).toBe('PAID');
      expect(dbOrder.status).toBe('CONFIRMED');
    });

    it('should handle duplicate webhook events idempotently (returns 200 without changing state)', async () => {
      const webhookPayload = {
        entity: 'event',
        account_id: 'acc_test_01',
        event: 'payment.captured',
        id: 'evt_duplicate_id_001',
        payload: {
          payment: {
            entity: {
              id: 'pay_webhook_cap_dup',
              order_id: 'order_test_rpq123',
              amount: 193564,
              currency: 'INR',
              status: 'captured'
            }
          }
        }
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = generateWebhookHeader(rawBody);

      // First webhook call
      const firstRes = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(rawBody);
      expect(firstRes.status).toBe(200);

      // Duplicate webhook call
      const duplicateRes = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(rawBody);

      expect(duplicateRes.status).toBe(200);
      expect(duplicateRes.body.data.idempotent).toBe(true);
      expect(duplicateRes.body.message).toContain('already processed');
    });

    it('should reject webhook with 400 when x-razorpay-signature is invalid', async () => {
      const webhookPayload = { event: 'payment.captured', id: 'evt_bad_sig' };
      const rawBody = JSON.stringify(webhookPayload);

      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', 'invalid_bogus_signature')
        .send(rawBody);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid Razorpay webhook signature');
    });

    it('should handle out-of-order event where webhook arrives BEFORE client calls verify', async () => {
      // Order is PLACED, Payment is PENDING
      const webhookPayload = {
        entity: 'event',
        event: 'payment.captured',
        id: 'evt_out_of_order_001',
        payload: {
          payment: {
            entity: {
              id: 'pay_early_arrival',
              order_id: 'order_test_rpq123',
              amount: 193564,
              status: 'captured'
            }
          }
        }
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = generateWebhookHeader(rawBody);

      // Webhook arrives first
      const webhookRes = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(rawBody);

      expect(webhookRes.status).toBe(200);

      // Verify payment was marked PAID by webhook
      const dbPayment = await Payment.findById(testPayment._id);
      expect(dbPayment.status).toBe('PAID');

      // Now client subsequently calls verify
      const verifyRes = await request(app)
        .post('/api/v1/payments/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          razorpay_order_id: 'order_test_rpq123',
          razorpay_payment_id: 'pay_early_arrival',
          razorpay_signature: 'valid_mock_signature'
        });

      // Should succeed idempotently without double confirmation
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.isDuplicateVerification).toBe(true);
    });

    it('should process payment.failed webhook event and mark payment FAILED', async () => {
      const webhookPayload = {
        entity: 'event',
        event: 'payment.failed',
        id: 'evt_failed_001',
        payload: {
          payment: {
            entity: {
              id: 'pay_failed_123',
              order_id: 'order_test_rpq123',
              error_description: 'Card declined by issuing bank'
            }
          }
        }
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = generateWebhookHeader(rawBody);

      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(rawBody);

      expect(res.status).toBe(200);

      const dbPayment = await Payment.findById(testPayment._id);
      expect(dbPayment.status).toBe('FAILED');
      expect(dbPayment.failureReason).toContain('Card declined');
    });
  });

  describe('Manual Payments, Status Update & Reconciliation', () => {
    it('POST /api/v1/payments records manual offline payment (COD/Bank Transfer)', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          orderId: testOrder.orderNumber,
          amount: 193564,
          method: 'COD',
          status: 'PAID',
          notes: 'Cash collected by courier agent'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.method).toBe('COD');
      expect(res.body.data.status).toBe('PAID');

      const dbOrder = await Order.findById(testOrder._id);
      expect(dbOrder.paymentStatus).toBe('PAID');
    });

    it('PATCH /api/v1/payments/:id/status updates status manually with audit log', async () => {
      const res = await request(app)
        .patch(`/api/v1/payments/${testPayment._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'PAID',
          notes: 'Bank transfer verified from statement'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PAID');

      const dbOrder = await Order.findById(testOrder._id);
      expect(dbOrder.paymentStatus).toBe('PAID');
    });

    it('POST /api/v1/payments/reconcile runs reconciliation for aged pending payments', async () => {
      // Set testPayment createdAt to 45 minutes ago directly on MongoDB collection to bypass Mongoose timestamp lock
      await Payment.collection.updateOne(
        { _id: testPayment._id },
        {
          $set: {
            createdAt: new Date(Date.now() - 45 * 60 * 1000),
            razorpayPaymentId: 'pay_test_rpq987'
          }
        }
      );

      const res = await request(app)
        .post('/api/v1/payments/reconcile')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ olderThanMinutes: 30 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.checkedCount).toBe(1);
      expect(res.body.data.reconciledCount).toBe(1);

      const dbPayment = await Payment.findById(testPayment._id);
      expect(dbPayment.status).toBe('PAID');
    });
  });
});
