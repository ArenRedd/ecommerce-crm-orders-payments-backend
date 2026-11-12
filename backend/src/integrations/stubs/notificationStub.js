/**
 * Notification Stub Adapter
 * Simulates integration with the team's Socket.IO / WebSocket / Push notification service.
 * Ready to be connected to socket.io server in frontend integration.
 */

const notificationHistory = [];

const notificationStub = {
  /**
   * Send notification to user or admin dashboard
   * @param {string} event - e.g. 'return.requested', 'return.approved', 'refund.processed'
   * @param {Object} payload - Notification payload
   */
  async notify(event, payload) {
    const entry = {
      event,
      payload,
      timestamp: new Date()
    };
    notificationHistory.push(entry);
    console.log(`[Notification Stub] Event: ${event} | Target Order/Return: ${payload.orderNumber || payload.returnId || 'N/A'}`);
    return entry;
  },

  getHistory() {
    return notificationHistory;
  },

  clear() {
    notificationHistory.length = 0;
  }
};

module.exports = notificationStub;
