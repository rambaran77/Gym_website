const { validateShopCart, validateFulfillment } = require('./shop-catalog');

function buildShopPaymentMetadata(cartResult, fulfillment) {
  const itemSummary = cartResult.items.map((i) => `${i.id}x${i.qty}`).join(',');
  return {
    orderType: 'shop',
    fulfillmentType: fulfillment.type,
    customerEmail: (fulfillment.contact.email || '').trim().toLowerCase(),
    customerName: (fulfillment.contact.fullName || '').trim(),
    itemCount: String(cartResult.items.reduce((s, i) => s + i.qty, 0)),
    itemSummary: itemSummary.slice(0, 450)
  };
}

async function createShopOrderFromPayment(db, { paymentIntent, cartResult, fulfillment }) {
  const existing = await db.collection('shop_orders').findOne({
    paymentIntentId: paymentIntent.id
  });
  if (existing) {
    return { created: false, order: existing, orderId: existing._id };
  }

  const order = {
    items: cartResult.items,
    total: cartResult.total,
    currency: paymentIntent.currency || 'gbp',
    paymentIntentId: paymentIntent.id,
    status: 'paid',
    fulfillment: {
      type: fulfillment.type,
      contact: {
        fullName: fulfillment.contact.fullName.trim(),
        email: fulfillment.contact.email.trim().toLowerCase(),
        phone: (fulfillment.contact.phone || '').trim()
      },
      address: fulfillment.type === 'delivery' ? {
        line1: fulfillment.address.line1.trim(),
        line2: (fulfillment.address.line2 || '').trim(),
        city: fulfillment.address.city.trim(),
        postcode: fulfillment.address.postcode.trim()
      } : null,
      pickupLocation: fulfillment.type === 'collect' ? fulfillment.pickupLocation : null
    },
    createdAt: new Date()
  };

  const result = await db.collection('shop_orders').insertOne(order);
  return { created: true, order, orderId: result.insertedId };
}

module.exports = {
  validateShopCart,
  validateFulfillment,
  buildShopPaymentMetadata,
  createShopOrderFromPayment
};
