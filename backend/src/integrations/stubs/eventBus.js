const EventEmitter = require('events');

class DomainEventBus extends EventEmitter {
  constructor() {
    super();
    this.eventLog = [];
  }

  /**
   * Publish a domain event for dashboard aggregation
   * @param {string} eventName
   * @param {Object} eventData
   */
  publish(eventName, eventData) {
    const record = {
      event: eventName,
      data: eventData,
      timestamp: new Date()
    };
    this.eventLog.push(record);
    this.emit(eventName, record);
    this.emit('*', record);
  }

  getRecentEvents(limit = 50) {
    return this.eventLog.slice(-limit);
  }

  clear() {
    this.eventLog = [];
  }
}

const eventBus = new DomainEventBus();

module.exports = eventBus;
