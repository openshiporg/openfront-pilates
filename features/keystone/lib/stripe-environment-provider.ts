/**
 * Explicit deployment activation avoids changing the seeded provider record.
 *
 * Two admissions: `installedPaymentProviderWhere` admits NEW charges (checkout, counter card
 * sales, plan changes) and is off only when STRIPE_ENABLED=false for the environment-backed provider.
 * `reconciliationPaymentProviderWhere` admits verification and reconciliation of obligations
 * that already exist at the provider (signed webhooks, refunds, subscription status), which
 * must keep working after new checkout is switched off while its credentials remain.
 */
function environmentProviderWhere(requireNewCharges: boolean) {
  const organizationId = process.env.STOREFRONT_ORGANIZATION_ID;
  if (process.env.STRIPE_USE_ENVIRONMENT_PROVIDER !== 'true' || (requireNewCharges && !newPaymentChargesEnabled()) ||
      !organizationId || !process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return { isInstalled: { equals: true } };
  }
  return { OR: [
    { isInstalled: { equals: true } },
    { code: { equals: 'pp_stripe' }, adapterKey: { equals: 'stripe' }, organization: { id: { equals: organizationId } } },
  ] };
}

export function installedPaymentProviderWhere() {
  return environmentProviderWhere(true);
}

export function reconciliationPaymentProviderWhere() {
  return environmentProviderWhere(false);
}

/**
 * New card charges are on whenever a Stripe secret key is configured. A deployment can switch
 * them off with STRIPE_ENABLED=false (reconciliation of existing obligations keeps working).
 */
export function newPaymentChargesEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY) && process.env.STRIPE_ENABLED?.trim().toLowerCase() !== 'false';
}
