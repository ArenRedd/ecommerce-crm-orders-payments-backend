const AppError = require('../../utils/AppError');

/**
 * Inventory Stub Adapter
 * Simulates integration with the teammate's Inventory/Warehouse service.
 * In Phase 1, holds an in-memory stock registry and mock reservation store.
 * Easily replaceable with a gRPC / HTTP / message-queue client in production.
 */

// Initial pre-seeded mock stock quantities
const defaultInventory = {
  'SKU-TSHIRT-BLK-M': 100,
  'SKU-TSHIRT-BLK-L': 75,
  'SKU-HOODIE-GRY-L': 40,
  'SKU-MUG-CERAMIC': 120,
  'SKU-CAP-NAVY': 30,
  'SKU-OUT-OF-STOCK': 0 // Explicit zero-stock SKU for testing failure paths
};

let inventoryStore = { ...defaultInventory };
const reservationsStore = new Map();

const inventoryStub = {
  /**
   * Check if requested quantities are available in stock
   * @param {Array<{ sku: string, qty: number, name?: string }>} items
   * @returns {Promise<{ available: boolean, items: Array<{ sku: string, requested: number, availableStock: number }> }>}
   */
  async checkStock(items = []) {
    const stockResults = [];
    let allAvailable = true;

    for (const item of items) {
      const currentStock = inventoryStore[item.sku] !== undefined ? inventoryStore[item.sku] : 50; // default 50 for unknown mock SKUs
      const isItemAvailable = currentStock >= item.qty;

      stockResults.push({
        sku: item.sku,
        name: item.name,
        requested: item.qty,
        availableStock: currentStock,
        isAvailable: isItemAvailable
      });

      if (!isItemAvailable) {
        allAvailable = false;
      }
    }

    return {
      available: allAvailable,
      items: stockResults
    };
  },

  /**
   * Verify and reserve stock for an order
   * @param {Array<{ sku: string, qty: number, name?: string }>} items
   * @param {string} orderId
   * @returns {Promise<{ success: boolean, reservationId: string }>}
   * @throws {AppError} if stock is insufficient
   */
  async reserveStock(items = [], orderId) {
    const stockCheck = await this.checkStock(items);

    if (!stockCheck.available) {
      const outOfStockItems = stockCheck.items
        .filter(i => !i.isAvailable)
        .map(i => `${i.sku} (requested ${i.requested}, in stock ${i.availableStock})`)
        .join(', ');

      throw new AppError(
        `Insufficient inventory to fulfill order: ${outOfStockItems}`,
        400,
        stockCheck.items.filter(i => !i.isAvailable)
      );
    }

    // Deduct stock and record reservation
    for (const item of items) {
      const current = inventoryStore[item.sku] !== undefined ? inventoryStore[item.sku] : 50;
      inventoryStore[item.sku] = current - item.qty;
    }

    const reservationId = `RES-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    reservationsStore.set(reservationId, {
      orderId,
      items: items.map(i => ({ sku: i.sku, qty: i.qty })),
      reservedAt: new Date()
    });

    return {
      success: true,
      reservationId
    };
  },

  /**
   * Release reserved stock back into inventory (e.g. upon order cancellation)
   * @param {Array<{ sku: string, qty: number }>} items
   * @param {string} orderId
   * @returns {Promise<{ success: boolean, releasedCount: number }>}
   */
  async releaseStock(items = [], orderId) {
    let releasedCount = 0;

    for (const item of items) {
      const current = inventoryStore[item.sku] !== undefined ? inventoryStore[item.sku] : 0;
      inventoryStore[item.sku] = current + item.qty;
      releasedCount += item.qty;
    }

    return {
      success: true,
      orderId,
      releasedCount
    };
  },

  /**
   * Restock items returning from customer upon inspection OK
   * @param {Array<{ sku: string, qty: number }>} items
   * @param {string} returnId
   */
  async restock(items = [], returnId) {
    let restockedCount = 0;

    for (const item of items) {
      const current = inventoryStore[item.sku] !== undefined ? inventoryStore[item.sku] : 0;
      inventoryStore[item.sku] = current + item.qty;
      restockedCount += item.qty;
    }

    return {
      success: true,
      returnId,
      restockedCount
    };
  },

  /**
   * Set stock directly (useful in test suites)
   * @param {string} sku
   * @param {number} qty
   */
  setStock(sku, qty) {
    inventoryStore[sku] = qty;
  },

  /**
   * Reset store to default state
   */
  reset() {
    inventoryStore = { ...defaultInventory };
    reservationsStore.clear();
  }
};

module.exports = inventoryStub;
