import React, { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

const API = 'https://orbit-backend-production-e46d.up.railway.app'
const BRAND = '#C8622A'

const SUPPLIER_COLORS = [
  '#e0f2fe','#fef9c3','#dcfce7','#fce7f3','#ede9fe','#ffedd5','#f1f5f9',
]
function supplierColor(name) {
  if (!name) return '#f1f5f9'
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return SUPPLIER_COLORS[Math.abs(h) % SUPPLIER_COLORS.length]
}

// ── Shared styles ──────────────────────────────────────────────────────────────
const card = {
  background: '#fff',
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  padding: '16px 20px',
}

export default function ShopView() {
  const [tab, setTab] = useState('shop')

  const tabs = [
    { id: 'shop',      label: 'Shop' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'orders',    label: 'Orders' },
  ]

  return (
    <div style={{ fontFamily: "'Neue Montreal', Inter, sans-serif", background: '#f8fafc', minHeight: '100vh', padding: '24px 32px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Shop</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Products, inventory &amp; supplier orders</p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: '#f1f5f9', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
            background: tab === t.id ? '#fff' : 'transparent',
            color: tab === t.id ? '#0f172a' : '#64748b',
            boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
            fontFamily: 'inherit',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'shop'      && <ShopTab />}
      {tab === 'inventory' && <InventoryTab />}
      {tab === 'orders'    && <OrdersTab />}
    </div>
  )
}

// ── Shop Tab ───────────────────────────────────────────────────────────────────

function ShopTab() {
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [category, setCategory] = useState('All')
  const [cart, setCart]         = useState({})   // { productId: qty }
  const [placing, setPlacing]   = useState(false)
  const [success, setSuccess]   = useState(false)

  useEffect(() => {
    axios.get(`${API}/api/shop/products`)
      .then(r => setProducts(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const categories = ['All', ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))]
  const lowStock    = products.filter(p => p.stock_level <= (p.reorder_threshold ?? 10))

  const filtered = products.filter(p => {
    const matchCat = category === 'All' || p.category === category
    const matchQ   = !search || p.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchQ
  })

  // Group cart items by supplier for the cart panel
  const cartItems = Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([pid, qty]) => ({ ...products.find(p => p.id === pid), qty }))

  const cartBySupplier = cartItems.reduce((acc, item) => {
    const key = item.supplier_name || 'Unknown'
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})

  const cartTotal = cartItems.reduce((s, i) => s + i.qty * parseFloat(i.price || 0), 0)

  function addToCart(id) {
    setCart(c => ({ ...c, [id]: (c[id] || 0) + 1 }))
  }
  function removeFromCart(id) {
    setCart(c => ({ ...c, [id]: Math.max(0, (c[id] || 0) - 1) }))
  }

  async function placeOrder() {
    setPlacing(true)
    try {
      const items = cartItems.map(i => ({
        product_id:  i.id,
        qty:         i.qty,
        unit_price:  i.price,
        supplier_id: i.supplier_id || null,
      }))
      await axios.post(`${API}/api/shop/orders`, { items })
      setCart({})
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      // Refresh stock levels
      const r = await axios.get(`${API}/api/shop/products`)
      setProducts(r.data)
    } catch (err) {
      alert('Order failed: ' + (err.response?.data?.error || err.message))
    } finally {
      setPlacing(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      {/* Left: product grid */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Low stock banner */}
        {lowStock.length > 0 && (
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <div>
              <span style={{ fontWeight: 700, color: '#9a3412', fontSize: 13 }}>{lowStock.length} product{lowStock.length > 1 ? 's' : ''} low on stock</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {lowStock.map(p => (
                  <span key={p.id} onClick={() => addToCart(p.id)} style={{
                    background: '#fff', border: '1px solid #fed7aa', borderRadius: 6,
                    padding: '2px 8px', fontSize: 12, cursor: 'pointer', color: '#7c2d12',
                  }}>{p.emoji} {p.name} ({p.stock_level} left) +</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Search + category filter */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search products…"
            style={{ flex: 1, minWidth: 160, padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {categories.map(c => (
              <button key={c} onClick={() => setCategory(c)} style={{
                padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer',
                fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                background: category === c ? BRAND : '#fff',
                color: category === c ? '#fff' : '#64748b',
              }}>{c}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <p style={{ color: '#94a3b8', fontSize: 13 }}>Loading products…</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {filtered.map(p => (
              <ProductCard key={p.id} product={p} qty={cart[p.id] || 0} onAdd={() => addToCart(p.id)} onRemove={() => removeFromCart(p.id)} />
            ))}
          </div>
        )}
      </div>

      {/* Right: cart panel */}
      <div style={{ width: 280, flexShrink: 0, position: 'sticky', top: 24 }}>
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9' }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>Cart</span>
            {cartItems.length > 0 && (
              <span style={{ marginLeft: 8, background: BRAND, color: '#fff', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                {cartItems.reduce((s, i) => s + i.qty, 0)}
              </span>
            )}
          </div>

          {cartItems.length === 0 ? (
            <div style={{ padding: '24px 18px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              Your cart is empty
            </div>
          ) : (
            <>
              <div style={{ padding: '12px 18px', maxHeight: 340, overflowY: 'auto' }}>
                {Object.entries(cartBySupplier).map(([supplier, items]) => (
                  <div key={supplier} style={{ marginBottom: 14 }}>
                    <div style={{
                      fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8,
                      color: '#64748b', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span style={{ background: supplierColor(supplier), borderRadius: 4, padding: '2px 7px' }}>{supplier}</span>
                    </div>
                    {items.map(item => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 18 }}>{item.emoji}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>£{parseFloat(item.price).toFixed(2)} × {item.qty}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button onClick={() => removeFromCart(item.id)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                          <span style={{ fontSize: 12, fontWeight: 700, minWidth: 16, textAlign: 'center' }}>{item.qty}</span>
                          <button onClick={() => addToCart(item.id)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div style={{ padding: '12px 18px', borderTop: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Total</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: BRAND }}>£{cartTotal.toFixed(2)}</span>
                </div>
                {success ? (
                  <div style={{ textAlign: 'center', color: '#16a34a', fontWeight: 700, fontSize: 13 }}>✓ Order placed!</div>
                ) : (
                  <button onClick={placeOrder} disabled={placing} style={{
                    width: '100%', padding: '10px 0', borderRadius: 9, border: 'none',
                    background: BRAND, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                  }}>{placing ? 'Placing…' : 'Place Order'}</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Product Card ───────────────────────────────────────────────────────────────

function ProductCard({ product: p, qty, onAdd, onRemove }) {
  const pct = p.max_stock > 0 ? (p.stock_level / p.max_stock) * 100 : 0
  return (
    <div style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 28, textAlign: 'center' }}>{p.emoji || '📦'}</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>{p.name}</div>
        {p.variant && <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.variant}</div>}
        {p.supplier_name && (
          <span style={{ display: 'inline-block', marginTop: 4, background: supplierColor(p.supplier_name), borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 700, color: '#334155' }}>{p.supplier_name}</span>
        )}
      </div>
      <StockBar pct={pct} level={p.stock_level} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: BRAND }}>£{parseFloat(p.price || 0).toFixed(2)}</span>
        {qty === 0 ? (
          <button onClick={onAdd} style={{
            padding: '5px 12px', borderRadius: 7, border: 'none', background: BRAND,
            color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          }}>Add</button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={onRemove} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 15 }}>−</button>
            <span style={{ fontSize: 13, fontWeight: 800, minWidth: 18, textAlign: 'center' }}>{qty}</span>
            <button onClick={onAdd} style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: BRAND, color: '#fff', cursor: 'pointer', fontSize: 15 }}>+</button>
          </div>
        )}
      </div>
    </div>
  )
}

function StockBar({ pct, level }) {
  const color = pct >= 50 ? '#22c55e' : pct >= 25 ? '#f59e0b' : '#ef4444'
  return (
    <div>
      <div style={{ height: 4, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: color, borderRadius: 4, transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{level} in stock</span>
    </div>
  )
}

// ── Inventory Tab ──────────────────────────────────────────────────────────────

function InventoryTab() {
  const [rows, setRows]   = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState({})

  const load = useCallback(() => {
    setLoading(true)
    axios.get(`${API}/api/shop/inventory`)
      .then(r => setRows(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  async function patchRow(productId, patch) {
    setSaving(s => ({ ...s, [productId]: true }))
    try {
      await axios.patch(`${API}/api/shop/inventory/${productId}`, patch)
    } catch (err) {
      alert('Save failed: ' + (err.response?.data?.error || err.message))
    } finally {
      setSaving(s => ({ ...s, [productId]: false }))
    }
  }

  async function updateField(row, field, value) {
    const updated = {
      auto_reorder:      field === 'auto_reorder'      ? value : (row.auto_reorder      ?? false),
      reorder_threshold: field === 'reorder_threshold' ? value : (row.reorder_threshold ?? 10),
      reorder_qty:       field === 'reorder_qty'       ? value : (row.reorder_qty       ?? 5),
    }
    // Optimistic update
    setRows(rs => rs.map(r => r.product_id === row.product_id ? { ...r, ...updated } : r))
    await patchRow(row.product_id, updated)
  }

  async function quickReorder(row) {
    try {
      const qty = row.reorder_qty ?? 5
      await axios.post(`${API}/api/shop/orders`, {
        items: [{
          product_id:  row.product_id,
          qty,
          unit_price:  row.shop_products?.price ?? 0,
          supplier_id: row.shop_products?.supplier_id ?? null,
        }]
      })
      load()
    } catch (err) {
      alert('Reorder failed: ' + (err.response?.data?.error || err.message))
    }
  }

  async function runAutoReorder() {
    try {
      const r = await axios.post(`${API}/api/shop/inventory/auto-reorder`)
      alert(`Auto-reorder complete: ${r.data.orders_created} order(s) created`)
      load()
    } catch (err) {
      alert('Auto-reorder failed: ' + (err.response?.data?.error || err.message))
    }
  }

  if (loading) return <p style={{ color: '#94a3b8', fontSize: 13 }}>Loading inventory…</p>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={runAutoReorder} style={{
          padding: '9px 18px', borderRadius: 9, border: 'none', background: BRAND,
          color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
        }}>Run Auto-Reorder</button>
      </div>

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['Product', 'Stock', 'Max', 'Auto-Reorder', 'Threshold', 'Reorder Qty', ''].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 800, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const p = row.shop_products || {}
              const pct = row.max_stock > 0 ? (row.stock_level / row.max_stock) * 100 : 0
              return (
                <tr key={row.product_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 20 }}>{p.emoji}</span>
                      <div>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{p.name}</div>
                        {p.variant && <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.variant}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, color: pct < 25 ? '#ef4444' : pct < 50 ? '#f59e0b' : '#22c55e' }}>{row.stock_level}</span>
                      <div style={{ width: 60, height: 4, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: pct < 25 ? '#ef4444' : pct < 50 ? '#f59e0b' : '#22c55e', borderRadius: 4 }} />
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#64748b' }}>{row.max_stock ?? 100}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={row.auto_reorder ?? false}
                        onChange={e => updateField(row, 'auto_reorder', e.target.checked)}
                        style={{ accentColor: BRAND, width: 16, height: 16 }}
                      />
                      <span style={{ fontSize: 12, color: '#64748b' }}>{row.auto_reorder ? 'On' : 'Off'}</span>
                    </label>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <input type="number" min={0} value={row.reorder_threshold ?? 10}
                      onChange={e => updateField(row, 'reorder_threshold', parseInt(e.target.value) || 0)}
                      style={{ width: 60, padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
                    />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <input type="number" min={1} value={row.reorder_qty ?? 5}
                      onChange={e => updateField(row, 'reorder_qty', parseInt(e.target.value) || 1)}
                      style={{ width: 60, padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
                    />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <button onClick={() => quickReorder(row)} style={{
                      padding: '5px 12px', borderRadius: 7, border: `1px solid ${BRAND}`,
                      background: '#fff', color: BRAND, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                    }}>Reorder</button>
                    {saving[row.product_id] && <span style={{ marginLeft: 6, fontSize: 11, color: '#94a3b8' }}>saving…</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            No inventory records yet. Add products and stock in Supabase.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Orders Tab ─────────────────────────────────────────────────────────────────

function OrdersTab() {
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get(`${API}/api/shop/orders`)
      .then(r => setOrders(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function reorder(order) {
    try {
      const items = (order.shop_order_items || []).map(i => ({
        product_id:  i.product_id,
        qty:         i.qty,
        unit_price:  i.unit_price,
        supplier_id: i.supplier_id || null,
      }))
      if (!items.length) return
      await axios.post(`${API}/api/shop/orders`, { items })
      const r = await axios.get(`${API}/api/shop/orders`)
      setOrders(r.data)
    } catch (err) {
      alert('Reorder failed: ' + (err.response?.data?.error || err.message))
    }
  }

  if (loading) return <p style={{ color: '#94a3b8', fontSize: 13 }}>Loading orders…</p>
  if (!orders.length) return <p style={{ color: '#94a3b8', fontSize: 13 }}>No orders yet.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {orders.map(order => (
        <div key={order.id} style={{ ...card }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                background: order.status === 'processing' ? '#fef9c3' : order.status === 'delivered' ? '#dcfce7' : '#f1f5f9',
                color:      order.status === 'processing' ? '#854d0e'  : order.status === 'delivered' ? '#166534' : '#475569',
              }}>{order.status}</span>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                {new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontWeight: 800, color: BRAND, fontSize: 14 }}>£{parseFloat(order.total || 0).toFixed(2)}</span>
              <button onClick={() => reorder(order)} style={{
                padding: '5px 12px', borderRadius: 7, border: `1px solid ${BRAND}`,
                background: '#fff', color: BRAND, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
              }}>Reorder</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(order.shop_order_items || []).map((item, i) => {
              const p = item.shop_products || {}
              const s = item.suppliers || {}
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', borderRadius: 7, padding: '5px 10px', fontSize: 12 }}>
                  <span>{p.emoji}</span>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>{p.name}{p.variant ? ` (${p.variant})` : ''}</span>
                  <span style={{ color: '#64748b' }}>× {item.qty}</span>
                  {s.name && <span style={{ background: supplierColor(s.name), borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{s.name}</span>}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
