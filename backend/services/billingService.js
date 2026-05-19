'use strict';

const pool = require('../db/pool');

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
let _stripe = null;

function getStripe() {
  if (_stripe) return _stripe;
  if (!STRIPE_SECRET) throw new Error('STRIPE_SECRET_KEY is not set.');
  _stripe = require('stripe')(STRIPE_SECRET);
  return _stripe;
}

const PLAN_PRICES = {
  starter: process.env.STRIPE_PRICE_STARTER,
  growth:  process.env.STRIPE_PRICE_GROWTH,
  pro:     process.env.STRIPE_PRICE_PRO,
};

const HARDWARE_PRICE = process.env.STRIPE_PRICE_HARDWARE_KIT;

async function getOrCreateCustomer(business) {
  if (business.stripe_customer_id) return business.stripe_customer_id;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: business.billing_email || business.owner_email,
    name: business.name,
    metadata: { business_id: String(business.id) },
  });

  await pool.query(
    'UPDATE businesses SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2',
    [customer.id, business.id]
  );

  return customer.id;
}

async function createSubscription(business, tier) {
  const stripe = getStripe();
  const priceId = PLAN_PRICES[tier];
  if (!priceId) throw Object.assign(new Error(`Unknown tier: ${tier}`), { status: 400 });

  const customerId = await getOrCreateCustomer(business);

  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete',
    expand: ['latest_invoice.payment_intent'],
    metadata: { business_id: String(business.id), tier },
  });

  await pool.query(
    `UPDATE businesses
     SET stripe_subscription_id = $1, subscription_tier = $2,
         subscription_status = 'active', updated_at = NOW()
     WHERE id = $3`,
    [subscription.id, tier, business.id]
  );

  return {
    subscription_id: subscription.id,
    client_secret: subscription.latest_invoice?.payment_intent?.client_secret,
    status: subscription.status,
  };
}

async function getSubscription(business) {
  return {
    tier: business.subscription_tier || 'free',
    status: business.subscription_status || 'inactive',
    stripe_subscription_id: business.stripe_subscription_id || null,
    trial_ends_at: business.trial_ends_at || null,
  };
}

async function upgradeSubscription(business, newTier) {
  const stripe = getStripe();
  const priceId = PLAN_PRICES[newTier];
  if (!priceId) throw Object.assign(new Error(`Unknown tier: ${newTier}`), { status: 400 });

  if (!business.stripe_subscription_id) {
    return createSubscription(business, newTier);
  }

  const sub = await stripe.subscriptions.retrieve(business.stripe_subscription_id);
  const updated = await stripe.subscriptions.update(business.stripe_subscription_id, {
    items: [{ id: sub.items.data[0].id, price: priceId }],
    proration_behavior: 'create_prorations',
    metadata: { tier: newTier },
  });

  await pool.query(
    `UPDATE businesses SET subscription_tier = $1, updated_at = NOW() WHERE id = $2`,
    [newTier, business.id]
  );

  return { subscription_id: updated.id, status: updated.status, tier: newTier };
}

async function cancelSubscription(business) {
  const stripe = getStripe();
  if (!business.stripe_subscription_id) {
    throw Object.assign(new Error('No active subscription'), { status: 400 });
  }

  await stripe.subscriptions.update(business.stripe_subscription_id, {
    cancel_at_period_end: true,
  });

  await pool.query(
    `UPDATE businesses SET subscription_status = 'cancelled', updated_at = NOW() WHERE id = $1`,
    [business.id]
  );

  return { cancelled: true, effective: 'end_of_period' };
}

async function createPortalSession(business) {
  const stripe = getStripe();
  const customerId = await getOrCreateCustomer(business);
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: process.env.STRIPE_PORTAL_RETURN_URL || 'https://dander.io/dashboard',
  });
  return { url: session.url };
}

async function orderHardware(business, shippingAddress, quantity) {
  const stripe = getStripe();
  if (!HARDWARE_PRICE) throw Object.assign(new Error('Hardware pricing not configured'), { status: 500 });

  const customerId = await getOrCreateCustomer(business);
  const paymentIntent = await stripe.paymentIntents.create({
    amount: quantity * 9900,
    currency: 'gbp',
    customer: customerId,
    metadata: { business_id: String(business.id), kit_type: 'kilo_starter', quantity: String(quantity) },
  });

  const { rows } = await pool.query(
    `INSERT INTO hardware_orders (business_id, stripe_payment_intent_id, quantity, shipping_address)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [business.id, paymentIntent.id, quantity, JSON.stringify(shippingAddress)]
  );

  return { order: rows[0], client_secret: paymentIntent.client_secret };
}

async function getInvoiceHistory(business) {
  const stripe = getStripe();
  if (!business.stripe_customer_id) return [];

  const invoices = await stripe.invoices.list({
    customer: business.stripe_customer_id,
    limit: 20,
  });

  return invoices.data.map(inv => ({
    id: inv.id,
    amount: inv.amount_paid,
    currency: inv.currency,
    status: inv.status,
    period_start: new Date(inv.period_start * 1000).toISOString(),
    period_end: new Date(inv.period_end * 1000).toISOString(),
    invoice_pdf: inv.invoice_pdf,
    hosted_invoice_url: inv.hosted_invoice_url,
  }));
}

async function handleWebhookEvent(event) {
  const type = event.type;
  const data = event.data.object;

  let businessId = null;
  if (data.metadata?.business_id) {
    businessId = parseInt(data.metadata.business_id, 10);
  } else if (data.customer) {
    const { rows } = await pool.query(
      'SELECT id FROM businesses WHERE stripe_customer_id = $1',
      [data.customer]
    );
    if (rows.length > 0) businessId = rows[0].id;
  }

  await pool.query(
    `INSERT INTO billing_events (business_id, stripe_event_id, event_type, payload)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (stripe_event_id) DO NOTHING`,
    [businessId, event.id, type, JSON.stringify(data)]
  );

  if (!businessId) return;

  switch (type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await pool.query(
        `UPDATE businesses SET subscription_status = $1, subscription_tier = COALESCE($2, subscription_tier), updated_at = NOW() WHERE id = $3`,
        [data.status === 'active' ? 'active' : data.status === 'past_due' ? 'past_due' : 'inactive', data.metadata?.tier || null, businessId]
      );
      break;
    case 'customer.subscription.deleted':
      await pool.query(
        `UPDATE businesses SET subscription_status = 'inactive', subscription_tier = 'free', stripe_subscription_id = NULL, updated_at = NOW() WHERE id = $1`,
        [businessId]
      );
      break;
    case 'invoice.payment_failed':
      await pool.query(
        `UPDATE businesses SET subscription_status = 'past_due', updated_at = NOW() WHERE id = $1`,
        [businessId]
      );
      break;
    case 'payment_intent.succeeded':
      if (data.metadata?.kit_type) {
        await pool.query(
          `UPDATE hardware_orders SET status = 'paid', updated_at = NOW() WHERE stripe_payment_intent_id = $1`,
          [data.id]
        );
      }
      break;
  }
}

module.exports = {
  createSubscription,
  getSubscription,
  upgradeSubscription,
  cancelSubscription,
  createPortalSession,
  orderHardware,
  getInvoiceHistory,
  handleWebhookEvent,
  getStripe,
};
