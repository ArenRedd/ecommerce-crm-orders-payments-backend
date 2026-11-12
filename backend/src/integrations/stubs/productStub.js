const AppError = require('../../utils/AppError');

/**
 * Product Catalog Stub Adapter
 * Simulates integration with the Teammate's Product Management module.
 * Provides product validation, pricing verification, and metadata snapshots.
 */

const mockCatalog = {
  'prod_101': {
    productId: 'prod_101',
    sku: 'SKU-TSHIRT-BLK-M',
    name: 'Classic Cotton T-Shirt (Black, M)',
    unitPrice: 79900, // ₹799.00 in paise
    tax: 14382,       // 18% GST (in paise)
    discount: 0,
    isActive: true
  },
  'prod_102': {
    productId: 'prod_102',
    sku: 'SKU-HOODIE-GRY-L',
    name: 'Fleece Pullover Hoodie (Grey, L)',
    unitPrice: 199900, // ₹1,999.00 in paise
    tax: 35982,        // 18% GST
    discount: 20000,   // ₹200.00 promo discount
    isActive: true
  },
  'prod_103': {
    productId: 'prod_103',
    sku: 'SKU-MUG-CERAMIC',
    name: 'Artisan Ceramic Coffee Mug',
    unitPrice: 44900, // ₹449.00 in paise
    tax: 8082,        // 18% GST
    discount: 5000,   // ₹50.00 discount
    isActive: true
  },
  'prod_oos': {
    productId: 'prod_oos',
    sku: 'SKU-OUT-OF-STOCK',
    name: 'Limited Edition Collectible Pin',
    unitPrice: 29900,
    tax: 5382,
    discount: 0,
    isActive: true
  }
};

const productStub = {
  /**
   * Fetch product details by ID or SKU
   * @param {string} idOrSku
   * @returns {Promise<Object>}
   */
  async getProduct(idOrSku) {
    if (!idOrSku) {
      throw new AppError('Product identifier is required', 400);
    }

    if (mockCatalog[idOrSku]) {
      return mockCatalog[idOrSku];
    }

    const bySku = Object.values(mockCatalog).find(p => p.sku === idOrSku);
    if (bySku) {
      return bySku;
    }

    // Default dynamic mock product for arbitrary test IDs
    return {
      productId: String(idOrSku),
      sku: `SKU-${String(idOrSku).toUpperCase()}`,
      name: `Catalog Item (${idOrSku})`,
      unitPrice: 50000, // ₹500 default
      tax: 9000,        // 18% default
      discount: 0,
      isActive: true
    };
  },

  /**
   * Enrich and validate items for an order snapshot
   * @param {Array<{ product: string, qty: number, unitPrice?: number, discount?: number, tax?: number, name?: string, sku?: string }>} items
   * @returns {Promise<Array<Object>>} Enriched item snapshots with verified integer paise
   */
  async enrichAndValidateItems(items = []) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('Order must contain at least one item', 400);
    }

    const enriched = [];

    for (const item of items) {
      const catalogItem = await this.getProduct(item.product);
      if (!catalogItem.isActive) {
        throw new AppError(`Product '${item.product}' is currently discontinued or inactive`, 400);
      }

      // Use explicit server-validated prices or catalog defaults (never trust unverified client pricing)
      const unitPrice = item.unitPrice !== undefined ? item.unitPrice : catalogItem.unitPrice;
      const discount = item.discount !== undefined ? item.discount : (catalogItem.discount || 0);
      const tax = item.tax !== undefined ? item.tax : (catalogItem.tax || 0);
      const name = item.name || catalogItem.name;
      const sku = item.sku || catalogItem.sku;

      enriched.push({
        product: String(item.product),
        name,
        sku,
        qty: item.qty,
        unitPrice,
        discount,
        tax
      });
    }

    return enriched;
  }
};

module.exports = productStub;
