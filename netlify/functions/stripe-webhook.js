import Stripe from 'stripe'
import { adminSupabase } from './utils/supabase.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

const CORS = { 'Content-Type': 'application/json' }
const respond = (statusCode, body) => ({ statusCode, headers: CORS, body: JSON.stringify(body) })

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' })

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64')
    : (event.body || '')

  const signature = event.headers['stripe-signature'] || event.headers['Stripe-Signature']

  let stripeEvent
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (e) {
    console.error('Stripe webhook signature verification failed:', e.message)
    return respond(401, { error: 'Invalid signature' })
  }

  if (stripeEvent.type !== 'checkout.session.completed') {
    return respond(200, { received: true })
  }

  const session = stripeEvent.data.object
  const refId   = session.client_reference_id || session.metadata?.ref_id
  const transId = session.payment_intent

  if (!refId) {
    console.error('Webhook missing client_reference_id:', session.id)
    return respond(200, { received: true })
  }

  const supabase = adminSupabase()
  const { data: completed, error: rpcError } = await supabase.rpc('complete_payment_transaction', {
    p_ref_id:   refId,
    p_trans_id: transId ?? null,
  })

  if (rpcError) {
    console.error('Failed to complete payment:', rpcError.message, '| ref:', refId)
    return respond(500, { error: 'Failed to apply credits' })
  }

  if (completed) {
    console.log(`Credited payment ref ${refId} | trans ${transId}`)
  } else {
    console.log('Duplicate or unknown webhook — ref:', refId)
  }

  return respond(200, { received: true })
}
