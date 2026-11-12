const Razorpay = require('razorpay');
const crypto = require('crypto');
const env = require('../../config/env');
const AppError = require('../../utils/AppError');

/**
 * Razorpay Payment Gateway Adapter (Test Mode)
 *
 * Implements the gateway interface:
 * - createOrder({ amount, currency, receipt, notes })
 * - verifySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature })
 * - verifyWebhook({ rawBody, signature, secret })
 * - fetchPayment(paymentId)
 * - createRefund({ paymentId, amount, notes })
 *
 * The payments module interacts exclusively through this adapter.
 */

// Initialize Razorpay SDK client
let razorpayClient = null;

const getRazorpayClient = () => {
  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET
    });
  }
  return razorpayClient;
};

const razorpayAdapter = {
  /**
   * Return configured Public Key ID for checkout client
   * @returns {string}
   */
  getKeyId() {
    return env.RAZORPAY_KEY_ID;
  },

  /**
   * Create an order on Razorpay
   *
   * @param {Object} params
   * @param {number} params.amount - in integer paise (e.g. 199900 = ₹1,999.00)
   * @param {string} [params.currency='INR']
   * @param {string} params.receipt - Internal order reference (orderNumber)
   * @param {Object} [params.notes={}]
   * @returns {Promise<Object>} Razorpay Order Object
   */
  async createOrder({ amount, currency = 'INR', receipt, notes = {} }) {
    if (!amount || !Number.isInteger(amount) || amount <= 0) {
      throw new AppError('Razorpay order creation requires a positive integer amount in paise', 400);
    }
    if (!receipt) {
      throw new AppError('Receipt (orderNumber) is required for Razorpay order creation', 400);
    }

    try {
      const client = getRazorpayClient();
      const order = await client.orders.create({
        amount,
        currency,
        receipt: String(receipt),
        notes
      });
      return order;
    } catch (error) {
      console.error('[Razorpay Adapter Error - createOrder]:', error);
      throw new AppError(
        `Failed to create Razorpay order: ${error.error?.description || error.message}`,
        error.statusCode || 502
      );
    }
  },

  /**
   * Verify checkout payment signature
   * Algorithm: HMAC-SHA256(order_id + "|" + payment_id, secret) == signature
   *
   * @param {Object} params
   * @param {string} params.razorpayOrderId
   * @param {string} params.razorpayPaymentId
   * @param {string} params.razorpaySignature
   * @returns {boolean}
   */
  verifySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return false;
    }

    try {
      const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
      const expectedSignature = crypto
        .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
        .update(payload)
        .digest('hex');

      if (expectedSignature.length !== razorpaySignature.length) {
        return false;
      }

      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'utf8'),
        Buffer.from(razorpaySignature, 'utf8')
      );
    } catch (err) {
      console.error('[Razorpay Adapter Error - verifySignature]:', err.message);
      return false;
    }
  },

  /**
   * Verify incoming webhook signature
   * Algorithm: HMAC-SHA256(rawBody, webhookSecret) == signature
   *
   * @param {Object} params
   * @param {Buffer|string} params.rawBody - Unparsed request body
   * @param {string} params.signature - Value of X-Razorpay-Signature header
   * @param {string} [params.secret] - Optional webhook secret override
   * @returns {boolean}
   */
  verifyWebhook({ rawBody, signature, secret }) {
    const webhookSecret = secret || env.RAZORPAY_WEBHOOK_SECRET;
    if (!rawBody || !signature || !webhookSecret) {
      return false;
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      if (expectedSignature.length !== signature.length) {
        return false;
      }

      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'utf8'),
        Buffer.from(signature, 'utf8')
      );
    } catch (err) {
      console.error('[Razorpay Adapter Error - verifyWebhook]:', err.message);
      return false;
    }
  },

  /**
   * Fetch payment details from Razorpay by Payment ID
   *
   * @param {string} paymentId
   * @returns {Promise<Object>} Razorpay Payment Entity
   */
  async fetchPayment(paymentId) {
    if (!paymentId) {
      throw new AppError('Payment ID is required to fetch payment from Razorpay', 400);
    }

    try {
      const client = getRazorpayClient();
      const payment = await client.payments.fetch(paymentId);
      return payment;
    } catch (error) {
      console.error(`[Razorpay Adapter Error - fetchPayment ${paymentId}]:`, error);
      throw new AppError(
        `Failed to fetch payment details from Razorpay: ${error.error?.description || error.message}`,
        error.statusCode || 502
      );
    }
  },

  /**
   * Issue a refund via Razorpay
   *
   * @param {Object} params
   * @param {string} params.paymentId - Razorpay payment ID (e.g. pay_xxxxx)
   * @param {number} [params.amount] - in integer paise (optional: defaults to full payment amount)
   * @param {Object} [params.notes={}]
   * @returns {Promise<Object>} Razorpay Refund Entity
   */
  async createRefund({ paymentId, amount, notes = {} }) {
    if (!paymentId) {
      throw new AppError('Payment ID is required to issue refund via Razorpay', 400);
    }

    try {
      const client = getRazorpayClient();
      const refundOptions = { notes };
      if (amount && Number.isInteger(amount) && amount > 0) {
        refundOptions.amount = amount;
      }

      const refund = await client.payments.refund(paymentId, refundOptions);
      return refund;
    } catch (error) {
      console.error(`[Razorpay Adapter Error - createRefund ${paymentId}]:`, error);
      throw new AppError(
        `Failed to process refund via Razorpay: ${error.error?.description || error.message}`,
        error.statusCode || 502
      );
    }
  },

  /**
   * Helper for unit test mocking
   */
  _setClient(mockClient) {
    razorpayClient = mockClient;
  }
};

module.exports = razorpayAdapter;
