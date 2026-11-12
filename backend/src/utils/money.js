/**
 * Money Utility
 * All monetary amounts in this application are stored and calculated as integer paise (1 INR = 100 paise).
 * Currency is explicitly locked to 'INR'.
 * Floating point arithmetic for currency calculations is strictly prohibited.
 */

const CURRENCY = 'INR';

/**
 * Asserts that a value is a valid non-negative integer paise
 * @param {any} val
 * @param {string} [fieldName='amount']
 * @throws {Error} if invalid
 */
const assertPaise = (val, fieldName = 'amount') => {
  if (typeof val !== 'number' || !Number.isInteger(val) || val < 0) {
    throw new Error(`Invalid ${fieldName}: must be a non-negative integer in paise, received ${val}`);
  }
};

/**
 * Checks if a value is a valid integer paise
 * @param {any} val
 * @returns {boolean}
 */
const isValidPaise = (val) => {
  return typeof val === 'number' && Number.isInteger(val) && val >= 0;
};

/**
 * Converts decimal/numeric rupees to integer paise safely
 * e.g. 149.99 -> 14999
 * @param {number|string} rupees
 * @returns {number} integer paise
 */
const rupeesToPaise = (rupees) => {
  const num = typeof rupees === 'string' ? parseFloat(rupees) : rupees;
  if (isNaN(num) || num < 0) {
    throw new Error(`Invalid rupees value: ${rupees}`);
  }
  return Math.round(num * 100);
};

/**
 * Converts integer paise to decimal rupees string
 * e.g. 14999 -> "149.99"
 * @param {number} paise
 * @returns {string}
 */
const paiseToRupees = (paise) => {
  assertPaise(paise);
  return (paise / 100).toFixed(2);
};

/**
 * Formats integer paise into Indian Rupee localized string
 * e.g. 1499900 -> "₹14,999.00"
 * @param {number} paise
 * @returns {string}
 */
const formatINR = (paise) => {
  assertPaise(paise);
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: 2
  }).format(rupees);
};

/**
 * Adds two paise values safely
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
const add = (a, b) => {
  assertPaise(a, 'addend a');
  assertPaise(b, 'addend b');
  return a + b;
};

/**
 * Subtracts b from a safely, preventing negative balance
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
const subtract = (a, b) => {
  assertPaise(a, 'minuend a');
  assertPaise(b, 'subtrahend b');
  const result = a - b;
  if (result < 0) {
    throw new Error(`Subtraction would result in negative paise: ${a} - ${b} = ${result}`);
  }
  return result;
};

/**
 * Multiplies paise by an integer quantity
 * @param {number} paise
 * @param {number} qty
 * @returns {number}
 */
const multiply = (paise, qty) => {
  assertPaise(paise);
  if (!Number.isInteger(qty) || qty < 0) {
    throw new Error(`Invalid quantity multiplier: ${qty}`);
  }
  return paise * qty;
};

/**
 * Calculate order server-side totals in integer paise
 *
 * @param {Array<{ qty: number, unitPrice: number, discount?: number, tax?: number }>} items
 * @param {number} shippingFee - in paise (defaults to 0)
 * @returns {{ subtotal: number, discountTotal: number, taxTotal: number, shippingFee: number, grandTotal: number }}
 */
const calculateOrderTotals = (items = [], shippingFee = 0) => {
  assertPaise(shippingFee, 'shippingFee');

  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;

  for (const item of items) {
    const qty = item.qty;
    const unitPrice = item.unitPrice || 0;
    const discount = item.discount || 0;
    const tax = item.tax || 0;

    assertPaise(unitPrice, `item unitPrice (${item.sku || 'item'})`);
    assertPaise(discount, `item discount (${item.sku || 'item'})`);
    assertPaise(tax, `item tax (${item.sku || 'item'})`);

    if (!Number.isInteger(qty) || qty <= 0) {
      throw new Error(`Invalid item quantity: ${qty}`);
    }

    subtotal += unitPrice * qty;
    discountTotal += discount * qty;
    taxTotal += tax * qty;
  }

  // Ensure discount does not exceed subtotal
  if (discountTotal > subtotal) {
    throw new Error(`Total discount (${discountTotal} paise) cannot exceed subtotal (${subtotal} paise)`);
  }

  const grandTotal = subtotal - discountTotal + taxTotal + shippingFee;

  return {
    subtotal,
    discountTotal,
    taxTotal,
    shippingFee,
    grandTotal
  };
};

module.exports = {
  CURRENCY,
  assertPaise,
  isValidPaise,
  rupeesToPaise,
  paiseToRupees,
  formatINR,
  add,
  subtract,
  multiply,
  calculateOrderTotals
};
