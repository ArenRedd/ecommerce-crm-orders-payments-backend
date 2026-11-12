const AppError = require('../../utils/AppError');

/**
 * Customer Stub Adapter
 * Simulates integration with the Customer Management module.
 */

const mockCustomers = {
  'cust_101': {
    customerId: 'cust_101',
    name: 'Aarav Sharma',
    email: 'aarav.sharma@example.com',
    phone: '+919876543210',
    isActive: true
  },
  'cust_102': {
    customerId: 'cust_102',
    name: 'Priya Patel',
    email: 'priya.patel@example.com',
    phone: '+919876543211',
    isActive: true
  },
  'cust_inactive': {
    customerId: 'cust_inactive',
    name: 'Inactive User',
    email: 'inactive@example.com',
    phone: '+919876543212',
    isActive: false
  }
};

const customerStub = {
  /**
   * Fetch customer by identifier
   * @param {string} customerId
   * @returns {Promise<Object>}
   */
  async getCustomerById(customerId) {
    if (!customerId) {
      throw new AppError('Customer ID is required', 400);
    }

    const customer = mockCustomers[customerId] || {
      customerId: String(customerId),
      name: 'Test Customer',
      email: `${customerId}@example.com`,
      phone: '+919999999999',
      isActive: true
    };

    return customer;
  },

  /**
   * Validate that customer exists and is active
   * @param {string} customerId
   * @returns {Promise<Object>}
   */
  async validateCustomer(customerId) {
    const customer = await this.getCustomerById(customerId);
    if (!customer.isActive) {
      throw new AppError(`Customer '${customerId}' is inactive or suspended`, 400);
    }
    return customer;
  }
};

module.exports = customerStub;
