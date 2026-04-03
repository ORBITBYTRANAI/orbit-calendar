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
  const [tab, setTab]       = useState('shop')
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    axios.get(`${API}/api/auth/me`)
      .then(r => setIsAdmin(r.data?.salon?.is_admin === true))
      .catch(() => {})
  }, [])

  const tabs = [
    { id: 'shop',      label: 'Shop' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'orders',    label: 'Orders' },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin' }] : []),
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
      {tab === 'admin' && isAdmin && <AdminTab />}
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
                    background: '#0f172a', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
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
      {p.image_base64
        ? <img src={p.image_base64} alt={p.name} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, display: 'block', margin: '0 auto' }} />
        : <div style={{ fontSize: 28, textAlign: 'center' }}>{p.emoji || '📦'}</div>
      }
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
            padding: '5px 12px', borderRadius: 7, border: 'none', background: '#0f172a',
            color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          }}>Add</button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={onRemove} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 15 }}>−</button>
            <span style={{ fontSize: 13, fontWeight: 800, minWidth: 18, textAlign: 'center' }}>{qty}</span>
            <button onClick={onAdd} style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: '#0f172a', color: '#fff', cursor: 'pointer', fontSize: 15 }}>+</button>
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

const emptyInvForm = () => ({ product_id: '', stock_level: 0, max_stock: 100, auto_reorder: false, reorder_threshold: 10, reorder_qty: 5 })

function InventoryTab() {
  const [rows,     setRows]     = useState([])
  const [products, setProducts] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState({})
  const [adding,   setAdding]   = useState(false)
  const [invForm,  setInvForm]  = useState(emptyInvForm())
  const [formSaving, setFormSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      axios.get(`${API}/api/shop/inventory`),
      axios.get(`${API}/api/shop/products`),
    ]).then(([invR, prodR]) => {
      setRows(invR.data)
      setProducts(prodR.data)
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  function setF(k, v) { setInvForm(f => ({ ...f, [k]: v })) }

  async function saveNewInventory() {
    if (!invForm.product_id) return alert('Select a product')
    setFormSaving(true)
    try {
      await axios.patch(`${API}/api/shop/inventory/${invForm.product_id}`, {
        stock_level:       invForm.stock_level,
        max_stock:         invForm.max_stock,
        auto_reorder:      invForm.auto_reorder,
        reorder_threshold: invForm.reorder_threshold,
        reorder_qty:       invForm.reorder_qty,
      })
      setAdding(false)
      setInvForm(emptyInvForm())
      load()
    } catch (err) {
      alert('Save failed: ' + (err.response?.data?.error || err.message))
    } finally { setFormSaving(false) }
  }

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

  const numInp = { width: 60, padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none' }

  if (loading) return <p style={{ color: '#94a3b8', fontSize: 13 }}>Loading inventory…</p>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        {!adding && (
          <button onClick={() => setAdding(true)} style={{
            padding: '9px 18px', borderRadius: 9, border: 'none', background: '#0f172a',
            color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          }}>Add Inventory</button>
        )}
      </div>

      {adding && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: '#0f172a', marginBottom: 12 }}>Add inventory record</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>Product</div>
              <select value={invForm.product_id} onChange={e => setF('product_id', e.target.value)}
                style={{ ...numInp, width: 200 }}>
                <option value="">— select —</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.variant ? ` (${p.variant})` : ''}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>Stock level</div>
              <input type="number" min={0} value={invForm.stock_level} onChange={e => setF('stock_level', parseInt(e.target.value) || 0)} style={numInp} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>Max stock</div>
              <input type="number" min={1} value={invForm.max_stock} onChange={e => setF('max_stock', parseInt(e.target.value) || 1)} style={numInp} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>Threshold</div>
              <input type="number" min={0} value={invForm.reorder_threshold} onChange={e => setF('reorder_threshold', parseInt(e.target.value) || 0)} style={numInp} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>Reorder qty</div>
              <input type="number" min={1} value={invForm.reorder_qty} onChange={e => setF('reorder_qty', parseInt(e.target.value) || 1)} style={numInp} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>Auto-reorder</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', height: 30 }}>
                <input type="checkbox" checked={invForm.auto_reorder} onChange={e => setF('auto_reorder', e.target.checked)}
                  style={{ accentColor: '#0f172a', width: 16, height: 16 }} />
                <span style={{ fontSize: 12, color: '#64748b' }}>On</span>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveNewInventory} disabled={formSaving} style={{ ...btnSave, padding: '7px 16px' }}>{formSaving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => { setAdding(false); setInvForm(emptyInvForm()) }} style={{ ...btnCancel, padding: '7px 16px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

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
                      {p.image_base64
                        ? <img src={p.image_base64} alt={p.name} style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 5 }} />
                        : <span style={{ fontSize: 20 }}>{p.emoji}</span>
                      }
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
                        style={{ accentColor: '#0f172a', width: 16, height: 16 }}
                      />
                      <span style={{ fontSize: 12, color: '#64748b' }}>{row.auto_reorder ? 'On' : 'Off'}</span>
                    </label>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <input type="number" min={0} value={row.reorder_threshold ?? 10}
                      onChange={e => updateField(row, 'reorder_threshold', parseInt(e.target.value) || 0)}
                      style={numInp}
                    />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <input type="number" min={1} value={row.reorder_qty ?? 5}
                      onChange={e => updateField(row, 'reorder_qty', parseInt(e.target.value) || 1)}
                      style={numInp}
                    />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <button onClick={() => quickReorder(row)} style={{
                      padding: '5px 12px', borderRadius: 7, border: 'none',
                      background: '#0f172a', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
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
            No inventory records yet. Click "Add Inventory" to set stock levels.
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
                padding: '5px 12px', borderRadius: 7, border: 'none',
                background: '#0f172a', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
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

// ── Admin Tab ──────────────────────────────────────────────────────────────────

const CATEGORIES = ['nails', 'tools', 'skincare']

const inp = { padding: '6px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none' }
const btnSave = { padding: '6px 14px', borderRadius: 7, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }
const btnCancel = { padding: '6px 14px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }
const btnDelete = { padding: '4px 10px', border: 'none', background: 'none', color: '#ef4444', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }
const btnEdit   = { padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', color: '#475569', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }

const TH = ({ children }) => (
  <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 800, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
    {children}
  </th>
)
const TD = ({ children, style }) => (
  <td style={{ padding: '10px 14px', fontSize: 13, color: '#0f172a', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle', ...style }}>
    {children}
  </td>
)

function AdminTab() {
  const [suppliers, setSuppliers] = useState([])
  const [products,  setProducts]  = useState([])

  const loadSuppliers = useCallback(() =>
    axios.get(`${API}/api/shop/suppliers`).then(r => setSuppliers(r.data)).catch(console.error)
  , [])

  const loadProducts = useCallback(() =>
    axios.get(`${API}/api/shop/products`).then(r => setProducts(r.data)).catch(console.error)
  , [])

  useEffect(() => { loadSuppliers(); loadProducts() }, [loadSuppliers, loadProducts])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <SuppliersSection suppliers={suppliers} onRefresh={loadSuppliers} />
      <ProductsSection  products={products}   suppliers={suppliers} onRefresh={() => { loadProducts(); loadSuppliers() }} />
    </div>
  )
}

// ── Suppliers section ──────────────────────────────────────────────────────────

function emptySupplier() { return { name: '', contact_email: '', website: '' } }

function SuppliersSection({ suppliers, onRefresh }) {
  const [adding,  setAdding]  = useState(false)
  const [editId,  setEditId]  = useState(null)
  const [form,    setForm]    = useState(emptySupplier())
  const [saving,  setSaving]  = useState(false)

  function startAdd()        { setAdding(true); setEditId(null); setForm(emptySupplier()) }
  function startEdit(s)      { setEditId(s.id); setAdding(false); setForm({ name: s.name, contact_email: s.contact_email || '', website: s.website || '' }) }
  function cancel()          { setAdding(false); setEditId(null) }
  function set(k, v)         { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    if (!form.name.trim()) return alert('Name is required')
    setSaving(true)
    try {
      if (editId) {
        await axios.patch(`${API}/api/shop/admin/suppliers/${editId}`, form)
      } else {
        await axios.post(`${API}/api/shop/admin/suppliers`, form)
      }
      cancel(); onRefresh()
    } catch (err) {
      alert(err.response?.data?.error || err.message)
    } finally { setSaving(false) }
  }

  async function del(id) {
    if (!window.confirm('Delete this supplier?')) return
    try {
      await axios.delete(`${API}/api/shop/admin/suppliers/${id}`)
      onRefresh()
    } catch (err) {
      alert(err.response?.data?.error || err.message)
    }
  }

  const formRow = (
    <tr>
      <TD><input value={form.name}          onChange={e => set('name', e.target.value)}          placeholder="Supplier name" style={{ ...inp, width: 160 }} /></TD>
      <TD><input value={form.contact_email} onChange={e => set('contact_email', e.target.value)} placeholder="contact@example.com" style={{ ...inp, width: 180 }} /></TD>
      <TD><input value={form.website}       onChange={e => set('website', e.target.value)}       placeholder="https://…" style={{ ...inp, width: 160 }} /></TD>
      <TD>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={save} disabled={saving} style={btnSave}>{saving ? 'Saving…' : 'Save'}</button>
          <button onClick={cancel} style={btnCancel}>Cancel</button>
        </div>
      </TD>
    </tr>
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0 }}>Suppliers</h2>
        {!adding && <button onClick={startAdd} style={{ ...btnSave, padding: '7px 16px' }}>+ Add Supplier</button>}
      </div>
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#f8fafc' }}>
            <TH>Name</TH><TH>Contact email</TH><TH>Website</TH><TH></TH>
          </tr></thead>
          <tbody>
            {adding && formRow}
            {suppliers.map(s => editId === s.id ? (
              <tr key={s.id}>{formRow.props.children}</tr>
            ) : (
              <tr key={s.id}>
                <TD style={{ fontWeight: 700 }}>{s.name}</TD>
                <TD style={{ color: '#64748b' }}>{s.contact_email || '—'}</TD>
                <TD style={{ color: '#64748b' }}>{s.website || '—'}</TD>
                <TD>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => startEdit(s)} style={btnEdit}>Edit</button>
                    <button onClick={() => del(s.id)} style={btnDelete}>Delete</button>
                  </div>
                </TD>
              </tr>
            ))}
            {suppliers.length === 0 && !adding && (
              <tr><td colSpan={4} style={{ padding: '20px 14px', color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>No suppliers yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Products section ───────────────────────────────────────────────────────────

function compressImage(file, cb) {
  const url = URL.createObjectURL(file)
  const img = new window.Image()
  img.onload = () => {
    const MAX = 800
    const scale = img.width > MAX ? MAX / img.width : 1
    const canvas = document.createElement('canvas')
    canvas.width  = Math.round(img.width  * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(url)
    cb(canvas.toDataURL('image/jpeg', 0.7))
  }
  img.src = url
}

function emptyProduct() { return { name: '', variant: '', price: '', category: CATEGORIES[0], supplier_id: '', image_base64: null } }

function ProductsSection({ products, suppliers, onRefresh }) {
  const [adding, setAdding]  = useState(false)
  const [editId, setEditId]  = useState(null)
  const [form,   setForm]    = useState(emptyProduct())
  const [saving, setSaving]  = useState(false)

  function startAdd()   { setAdding(true); setEditId(null); setForm(emptyProduct()) }
  function startEdit(p) { setEditId(p.id); setAdding(false); setForm({ name: p.name, variant: p.variant || '', price: p.price || '', category: p.category || CATEGORIES[0], supplier_id: p.supplier_id || '', image_base64: p.image_base64 || null }) }
  function cancel()     { setAdding(false); setEditId(null) }
  function set(k, v)    { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    if (!form.name.trim()) return alert('Name is required')
    setSaving(true)
    try {
      const body = { ...form, price: parseFloat(form.price) || 0, supplier_id: form.supplier_id || null, image_base64: form.image_base64 || null }
      if (editId) {
        await axios.patch(`${API}/api/shop/admin/products/${editId}`, body)
      } else {
        await axios.post(`${API}/api/shop/admin/products`, body)
      }
      cancel(); onRefresh()
    } catch (err) {
      alert(err.response?.data?.error || err.message)
    } finally { setSaving(false) }
  }

  async function del(id) {
    if (!window.confirm('Delete this product?')) return
    try {
      await axios.delete(`${API}/api/shop/admin/products/${id}`)
      onRefresh()
    } catch (err) {
      alert(err.response?.data?.error || err.message)
    }
  }

  const formRow = (
    <tr>
      <TD>
        <label style={{ cursor: 'pointer', display: 'block' }}>
          {form.image_base64
            ? <img src={form.image_base64} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
            : <div style={{ width: 40, height: 40, borderRadius: 6, background: '#f1f5f9', border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>+</div>
          }
          <input type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => { if (e.target.files[0]) compressImage(e.target.files[0], b64 => set('image_base64', b64)) }} />
        </label>
      </TD>
      <TD><input value={form.name}    onChange={e => set('name', e.target.value)}    placeholder="Product name" style={{ ...inp, width: 140 }} /></TD>
      <TD><input value={form.variant} onChange={e => set('variant', e.target.value)} placeholder="e.g. 15ml" style={{ ...inp, width: 100 }} /></TD>
      <TD>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 13, color: '#64748b' }}>£</span>
          <input type="number" min={0} step={0.01} value={form.price} onChange={e => set('price', e.target.value)} style={{ ...inp, width: 70 }} />
        </div>
      </TD>
      <TD>
        <select value={form.category} onChange={e => set('category', e.target.value)} style={{ ...inp }}>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </TD>
      <TD>
        <select value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)} style={{ ...inp }}>
          <option value="">— none —</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </TD>
      <TD>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={save} disabled={saving} style={btnSave}>{saving ? 'Saving…' : 'Save'}</button>
          <button onClick={cancel} style={btnCancel}>Cancel</button>
        </div>
      </TD>
    </tr>
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0 }}>Products</h2>
        {!adding && <button onClick={startAdd} style={{ ...btnSave, padding: '7px 16px' }}>+ Add Product</button>}
      </div>
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#f8fafc' }}>
            <TH>Photo</TH><TH>Name</TH><TH>Variant</TH><TH>Price</TH><TH>Category</TH><TH>Supplier</TH><TH></TH>
          </tr></thead>
          <tbody>
            {adding && formRow}
            {products.map(p => editId === p.id ? (
              <tr key={p.id}>{formRow.props.children}</tr>
            ) : (
              <tr key={p.id}>
                <TD>
                  {p.image_base64
                    ? <img src={p.image_base64} alt={p.name} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />
                    : <div style={{ width: 40, height: 40, borderRadius: 6, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{p.emoji || '📦'}</div>
                  }
                </TD>
                <TD style={{ fontWeight: 700 }}>{p.name}</TD>
                <TD style={{ color: '#64748b' }}>{p.variant || '—'}</TD>
                <TD>£{parseFloat(p.price || 0).toFixed(2)}</TD>
                <TD style={{ color: '#64748b' }}>{p.category || '—'}</TD>
                <TD>
                  {p.supplier_name
                    ? <span style={{ background: supplierColor(p.supplier_name), borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 700 }}>{p.supplier_name}</span>
                    : <span style={{ color: '#94a3b8' }}>—</span>}
                </TD>
                <TD>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => startEdit(p)} style={btnEdit}>Edit</button>
                    <button onClick={() => del(p.id)} style={btnDelete}>Delete</button>
                  </div>
                </TD>
              </tr>
            ))}
            {products.length === 0 && !adding && (
              <tr><td colSpan={7} style={{ padding: '20px 14px', color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>No products yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
