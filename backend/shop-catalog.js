/** Shop product prices — must match frontend/s.js catalog for validation */
const SHOP_PRODUCTS = {
  1: { name: 'Whey Protein', price: 40, stock: true },
  2: { name: 'Gym Gloves', price: 15, stock: true },
  3: { name: 'Resistance Bands', price: 25, stock: false },
  4: { name: 'Pre-Workout Powder', price: 30, stock: true },
  5: { name: 'BCAA Drink', price: 20, stock: true },
  6: { name: 'Gym Belt', price: 35, stock: true },
  7: { name: 'Dumbbells Set', price: 60, stock: false },
  8: { name: 'Yoga Mat', price: 18, stock: true },
  9: { name: 'Skipping Rope', price: 10, stock: true },
  10: { name: 'Protein Bars', price: 12, stock: true },
  11: { name: 'Shaker Bottle', price: 8, stock: true },
  12: { name: 'Creatine Powder', price: 28, stock: true },
  13: { name: 'Foam Roller', price: 22, stock: true },
  14: { name: 'Smart Fitness Watch', price: 120, stock: true },
  15: { name: 'Gym Backpack', price: 45, stock: true },
  16: { name: 'Weight Plates', price: 80, stock: false },
  17: { name: 'Pull-Up Bar', price: 25, stock: true },
  18: { name: 'Ankle Straps', price: 12, stock: true },
  19: { name: 'Massage Gun', price: 90, stock: true },
  20: { name: 'Workout T-Shirt', price: 18, stock: true },
  21: { name: 'Workout Pants', price: 25, stock: true }
};

const PICKUP_LOCATIONS = ['Selly Oak', 'Edgbaston', 'City centre', 'West Bromwich'];

function validateShopCart(items) {
  if (!Array.isArray(items) || !items.length) {
    return { ok: false, error: 'Your basket is empty' };
  }

  let totalPence = 0;
  const normalized = [];

  for (const row of items) {
    const id = Number(row.id);
    const qty = Math.max(1, Math.min(99, parseInt(row.qty, 10) || 1));
    const catalog = SHOP_PRODUCTS[id];
    if (!catalog) {
      return { ok: false, error: `Unknown product in basket (id ${row.id})` };
    }
    if (!catalog.stock) {
      return { ok: false, error: `${catalog.name} is out of stock` };
    }
    const linePence = Math.round(catalog.price * 100) * qty;
    totalPence += linePence;
    normalized.push({
      id,
      name: catalog.name,
      price: catalog.price,
      qty,
      lineTotal: Math.round(catalog.price * qty * 100) / 100
    });
  }

  return {
    ok: true,
    items: normalized,
    totalPence,
    total: Math.round(totalPence) / 100
  };
}

function validateFulfillment(fulfillment) {
  const type = fulfillment?.type;
  if (type !== 'delivery' && type !== 'collect') {
    return { ok: false, error: 'Choose home delivery or collect from club' };
  }

  const contact = fulfillment.contact || {};
  if (!contact.fullName?.trim() || !contact.email?.trim()) {
    return { ok: false, error: 'Name and email are required' };
  }

  if (type === 'delivery') {
    const addr = fulfillment.address || {};
    if (!addr.line1?.trim() || !addr.city?.trim() || !addr.postcode?.trim()) {
      return { ok: false, error: 'Delivery address, city and postcode are required' };
    }
  } else {
    const location = fulfillment.pickupLocation?.trim();
    if (!location || !PICKUP_LOCATIONS.includes(location)) {
      return { ok: false, error: 'Select a valid club for collection' };
    }
  }

  return { ok: true };
}

module.exports = {
  SHOP_PRODUCTS,
  PICKUP_LOCATIONS,
  validateShopCart,
  validateFulfillment
};
