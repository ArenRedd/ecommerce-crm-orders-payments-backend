const crypto = require('crypto');

/**
 * Generate a unique, human-readable order number
 * Format: ORD-YYYYMMDD-XXXX (e.g. ORD-20261112-9A4F)
 *
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
const generateOrderNumber = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  const randomBytes = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ORD-${dateStr}-${randomBytes}`;
};

module.exports = {
  generateOrderNumber
};
