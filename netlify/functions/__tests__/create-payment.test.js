import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123')
vi.stubEnv('VITE_SITE_URL', 'http://localhost:3000')

vi.mock('../utils/supabase.js', () => ({
  requireAuth:   vi.fn().mockResolvedValue({ user: { id: 'user-1' }, error: null }),
  adminSupabase: vi.fn(),
  ok:      (body)          => ({ statusCode: 200, body: JSON.stringify(body) }),
  err:     (msg, code=400) => ({ statusCode: code, body: JSON.stringify({ error: msg }) }),
  options: () => ({ statusCode: 204 }),
}))

const { createSessionMock } = vi.hoisted(() => ({ createSessionMock: vi.fn() }))
vi.mock('stripe', () => ({
  default: function Stripe() {
    return { checkout: { sessions: { create: createSessionMock } } }
  },
}))

import * as supabaseUtils from '../utils/supabase.js'
import { handler } from '../create-payment.js'

function parseBody(res) { return JSON.parse(res.body) }

function makeEvent(points) {
  return { httpMethod: 'POST', body: JSON.stringify({ points }), headers: { authorization: 'Bearer tok' } }
}

function makeSupabase({ profile, insertError = null }) {
  const insert = vi.fn().mockResolvedValue({ error: insertError })
  const maybeSingle = vi.fn().mockResolvedValue({ data: profile })
  return {
    from: vi.fn((table) => {
      if (table === 'profiles')            return { select: () => ({ eq: () => ({ maybeSingle }) }) }
      if (table === 'payment_transactions') return { insert }
    }),
    _insert: insert,
  }
}

function mockStripeSuccess() {
  createSessionMock.mockResolvedValue({ id: 'cs_test_123', url: 'https://checkout.stripe.com/pay/cs_test_123' })
}

function sentLineItems() {
  return createSessionMock.mock.calls[0][0].line_items
}

describe('create-payment handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabaseUtils.requireAuth.mockResolvedValue({ user: { id: 'user-1' }, error: null })
  })

  it('charges no tax for admin users', async () => {
    const supabase = makeSupabase({ profile: { role: 'admin', billing_state: null } })
    supabaseUtils.adminSupabase.mockReturnValue(supabase)
    mockStripeSuccess()

    const res = await handler(makeEvent(2500))
    expect(res.statusCode).toBe(200)
    expect(parseBody(res).url).toBe('https://checkout.stripe.com/pay/cs_test_123')

    const insertedRow = supabase._insert.mock.calls[0][0]
    expect(insertedRow.subtotal_usd).toBe('35.00')
    expect(insertedRow.tax_usd).toBe('0.00')
    expect(insertedRow.amount_usd).toBe('35.00')
    expect(insertedRow.billing_state).toBeNull()

    const items = sentLineItems()
    expect(items).toHaveLength(1)
    expect(items[0].price_data.unit_amount).toBe(3500)
  })

  it('adds state sales tax for non-admin users', async () => {
    const supabase = makeSupabase({ profile: { role: 'user', billing_state: 'CA' } }) // 7.25%
    supabaseUtils.adminSupabase.mockReturnValue(supabase)
    mockStripeSuccess()

    const res = await handler(makeEvent(2500)) // $35.00 subtotal
    expect(res.statusCode).toBe(200)

    const insertedRow = supabase._insert.mock.calls[0][0]
    expect(insertedRow.subtotal_usd).toBe('35.00')
    expect(insertedRow.tax_usd).toBe('2.54')   // 35 * 0.0725 = 2.5375 -> 2.54
    expect(insertedRow.amount_usd).toBe('37.54')
    expect(insertedRow.billing_state).toBe('CA')

    const items = sentLineItems()
    expect(items).toHaveLength(2)
    expect(items[0].price_data.unit_amount).toBe(3500)
    expect(items[1].price_data.unit_amount).toBe(254)
  })

  it('charges no tax for non-admin users with no billing state set', async () => {
    const supabase = makeSupabase({ profile: { role: 'user', billing_state: null } })
    supabaseUtils.adminSupabase.mockReturnValue(supabase)
    mockStripeSuccess()

    const res = await handler(makeEvent(2500))
    expect(res.statusCode).toBe(200)

    const insertedRow = supabase._insert.mock.calls[0][0]
    expect(insertedRow.tax_usd).toBe('0.00')
    expect(insertedRow.amount_usd).toBe('35.00')
    expect(sentLineItems()).toHaveLength(1)
  })

  it('charges no tax for non-admin users in no-sales-tax states', async () => {
    const supabase = makeSupabase({ profile: { role: 'user', billing_state: 'OR' } }) // 0%
    supabaseUtils.adminSupabase.mockReturnValue(supabase)
    mockStripeSuccess()

    const res = await handler(makeEvent(2500))
    expect(res.statusCode).toBe(200)

    const insertedRow = supabase._insert.mock.calls[0][0]
    expect(insertedRow.tax_usd).toBe('0.00')
    expect(insertedRow.amount_usd).toBe('35.00')
    expect(sentLineItems()).toHaveLength(1)
  })

  it('returns 500 when Stripe session creation fails', async () => {
    const supabase = makeSupabase({ profile: { role: 'admin', billing_state: null } })
    supabaseUtils.adminSupabase.mockReturnValue(supabase)
    createSessionMock.mockRejectedValue(new Error('Stripe error: invalid API key'))

    const res = await handler(makeEvent(2500))
    expect(res.statusCode).toBe(500)
    expect(parseBody(res).error).toMatch(/invalid API key/i)
  })
})
