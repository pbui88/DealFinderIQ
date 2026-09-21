import { randomBytes } from 'crypto'
import Stripe from 'stripe'
import { calculateTax } from '../../../shared/taxRates.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

// Build and fire a Stripe Checkout Session (hosted payment page).
// insertData is merged into the payment_transactions row (e.g. { points, type }).
// Returns { url }; throws on error.
export async function createCheckoutSession({ supabase, userId, subtotal, description, returnUrl, insertData = {} }) {
  const siteUrl = process.env.VITE_SITE_URL || 'http://localhost:3000'
  const refId   = randomBytes(10).toString('hex')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, billing_state')
    .eq('id', userId)
    .maybeSingle()

  let taxAmount = 0
  let taxState  = null
  if (profile?.role !== 'admin' && profile?.billing_state) {
    taxState  = profile.billing_state
    taxAmount = calculateTax(subtotal, taxState)
  }

  const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100

  const { error: insertError } = await supabase
    .from('payment_transactions')
    .insert({
      ref_id:        refId,
      user_id:       userId,
      amount_usd:    totalAmount.toFixed(2),
      subtotal_usd:  subtotal.toFixed(2),
      tax_usd:       taxAmount.toFixed(2),
      billing_state: taxState,
      ...insertData,
    })

  if (insertError) throw new Error(`DB error: ${insertError.message}`)

  const lineItems = [
    {
      price_data: {
        currency:    'usd',
        product_data: { name: description },
        unit_amount: Math.round(subtotal * 100),
      },
      quantity: 1,
    },
  ]
  if (taxAmount > 0) {
    lineItems.push({
      price_data: {
        currency:    'usd',
        product_data: { name: `Sales Tax (${taxState})` },
        unit_amount: Math.round(taxAmount * 100),
      },
      quantity: 1,
    })
  }

  const session = await stripe.checkout.sessions.create({
    mode:                'payment',
    client_reference_id: refId,
    line_items:          lineItems,
    success_url:         `${siteUrl}${returnUrl}`,
    cancel_url:           `${siteUrl}/credits`,
    metadata:            { ref_id: refId },
  })

  return { url: session.url }
}
