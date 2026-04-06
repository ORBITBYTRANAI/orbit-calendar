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

// Categories — stored lowercase, displayed capitalised
const CATEGORIES = ['nails', 'tools', 'skincare']
const CAT_LABEL  = { nails: 'Nails', tools: 'Tools', skincare: 'Skincare' }
const catLabel   = c => CAT_LABEL[c] || (c ? c.charAt(0).toUpperCase() + c.slice(1) : '—')

// ── Shared styles ──────────────────────────────────────────────────────────────
const card = { background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 20px' }
const inp       = { padding: '6px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none' }
const btnSave   = { padding: '6px 14px', borderRadius: 7, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }
const btnCancel = { padding: '6px 14px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }
const btnDelete = { padding: '4px 10px', border: 'none', background: 'none', color: '#ef4444', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }
const btnEdit   = { padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', color: '#475569', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }

const TH = ({ children }) => (
  <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 800, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{children}</th>
)
const TD = ({ children, style }) => (
  <td style={{ padding: '10px 14px', fontSize: 13, color: '#0f172a', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle', ...style }}>{children}</td>
)

const statusBadge = s => ({
  padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700,
  background: s === 'processing' ? '#fef9c3' : s === 'delivered' ? '#dcfce7' : s === 'cancelled' ? '#fee2e2' : '#f1f5f9',
  color:      s === 'processing' ? '#854d0e'  : s === 'delivered' ? '#166534' : s === 'cancelled' ? '#991b1b' : '#475569',
})

// ── Main ShopView ─────────────────────────────────────────────────────────────

export default function ShopView() {
  const [tab,      setTab]      = useState('shop')
  const [isAdmin,  setIsAdmin]  = useState(false)
  const [cartItems, setCartItems] = useState([])  // [{id,product_id,qty,shop_products:{...},supplier_name}]
  const [cartToast, setCartToast] = useState(null)

  useEffect(() => {
    axios.get(`${API}/api/auth/me`)
      .then(r => setIsAdmin(r.data?.salon?.is_admin === true))
      .catch(() => {})
  }, [])

  const loadCart = useCallback(() => {
    axios.get(`${API}/api/shop/cart`)
      .then(r => setCartItems(r.data))
      .catch(console.error)
  }, [])

  useEffect(() => { loadCart() }, [loadCart])

  async function addToCart(productId, qty = 1, productName) {
    // Optimistic update
    setCartItems(prev => {
      const existing = prev.find(i => i.product_id === productId)
      if (existing) return prev.map(i => i.product_id === productId ? { ...i, qty: i.qty + qty } : i)
      return [...prev, { product_id: productId, qty, shop_products: {} }]
    })
    try {
      await axios.post(`${API}/api/shop/cart`, { product_id: productId, qty })
      loadCart()
      setCartToast(`${productName || 'Product'} added to cart`)
      setTimeout(() => setCartToast(t => t === null ? null : null), 2500)
      setTimeout(() => setCartToast(null), 2500)
    } catch (err) {
      alert('Could not add to cart: ' + (err.response?.data?.error || err.message))
      loadCart()
    }
  }

  async function updateCartQty(productId, qty) {
    setCartItems(prev => qty <= 0
      ? prev.filter(i => i.product_id !== productId)
      : prev.map(i => i.product_id === productId ? { ...i, qty } : i)
    )
    try {
      await axios.patch(`${API}/api/shop/cart/${productId}`, { qty })
    } catch (_) { loadCart() }
  }

  async function removeFromCart(productId) {
    setCartItems(prev => prev.filter(i => i.product_id !== productId))
    await axios.delete(`${API}/api/shop/cart/${productId}`).catch(() => loadCart())
  }

  async function clearCart() {
    setCartItems([])
    await axios.delete(`${API}/api/shop/cart`).catch(console.error)
  }

  const totalCartQty = cartItems.reduce((s, i) => s + i.qty, 0)

  const tabs = [
    { id: 'shop',      label: 'Shop' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'cart',      label: totalCartQty > 0 ? `Cart (${totalCartQty})` : 'Cart' },
    { id: 'orders',    label: 'Orders' },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin' }] : []),
  ]

  return (
    <div style={{ fontFamily: "'Neue Montreal', Inter, sans-serif", background: '#f8fafc', minHeight: '100vh', padding: '24px 32px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Shop</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Products, inventory &amp; supplier orders</p>
      </div>

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

      {/* Cart toast */}
      {cartToast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: '#1e293b', color: '#fff', borderRadius: 10, padding: '12px 20px', fontSize: 13, fontWeight: 700, boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>
          ✓ {cartToast}
        </div>
      )}

      {tab === 'shop'      && <ShopTab cartItems={cartItems} onAddToCart={addToCart} onUpdateQty={updateCartQty} onClearCart={clearCart} />}
      {tab === 'inventory' && <InventoryTab onAddToCart={addToCart} />}
      {tab === 'cart'      && <CartTab cartItems={cartItems} onUpdateQty={updateCartQty} onRemove={removeFromCart} onClearCart={clearCart} onOrderPlaced={async () => { await clearCart(); loadCart() }} onGoToOrders={() => setTab('orders')} />}
      {tab === 'orders'    && <OrdersTab isAdmin={isAdmin} />}
      {tab === 'admin' && isAdmin && <AdminTab />}
    </div>
  )
}

// ── Shop Tab ──────────────────────────────────────────────────────────────────

function ShopTab({ cartItems, onAddToCart, onUpdateQty, onClearCart }) {
  const [products, setProducts] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [category, setCategory] = useState('All')
  const [placing,  setPlacing]  = useState(false)
  const [success,  setSuccess]  = useState(false)

  useEffect(() => {
    axios.get(`${API}/api/shop/products`)
      .then(r => setProducts(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const categories = ['All', ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))]
  const lowStock   = products.filter(p => p.stock_level <= (p.reorder_threshold ?? 10))
  const filtered   = products.filter(p => {
    const matchCat = category === 'All' || p.category === category
    const matchQ   = !search || p.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchQ
  })

  // Build cart display from shared cartItems + local products
  const cartMap = Object.fromEntries(cartItems.map(i => [i.product_id, i.qty]))
  const cartEnriched = cartItems.map(ci => {
    const p = products.find(pr => pr.id === ci.product_id) || ci.shop_products || {}
    return { product_id: ci.product_id, qty: ci.qty, ...p, id: ci.product_id, supplier_name: p.supplier_name || ci.shop_products?.suppliers?.name }
  }).filter(i => i.qty > 0)
  const cartBySupplier = cartEnriched.reduce((acc, item) => {
    const key = item.supplier_name || 'Unknown'
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})
  const cartTotal = cartEnriched.reduce((s, i) => s + i.qty * parseFloat(i.price || 0), 0)

  async function placeOrder() {
    if (!cartEnriched.length) return
    setPlacing(true)
    try {
      const items = cartEnriched.map(i => ({
        product_id:  i.id,
        qty:         i.qty,
        unit_price:  i.price,
        supplier_id: i.supplier_id || null,
      }))
      await axios.post(`${API}/api/shop/orders`, { items })
      await onClearCart()
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      const r = await axios.get(`${API}/api/shop/products`)
      setProducts(r.data)
    } catch (err) {
      alert('Order failed: ' + (err.response?.data?.error || err.message))
    } finally { setPlacing(false) }
  }

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {lowStock.length > 0 && (
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <div>
              <span style={{ fontWeight: 700, color: '#9a3412', fontSize: 13 }}>{lowStock.length} product{lowStock.length > 1 ? 's' : ''} low on stock</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {lowStock.map(p => (
                  <span key={p.id} onClick={() => onAddToCart(p.id, 1, p.name)} style={{ background: '#fff', border: '1px solid #fed7aa', borderRadius: 6, padding: '2px 8px', fontSize: 12, cursor: 'pointer', color: '#7c2d12' }}>
                    {p.emoji} {p.name} ({p.stock_level} left) +
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…"
            style={{ flex: 1, minWidth: 160, padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {categories.map(c => (
              <button key={c} onClick={() => setCategory(c)} style={{
                padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                background: category === c ? BRAND : '#fff', color: category === c ? '#fff' : '#64748b',
              }}>{c === 'All' ? 'All' : catLabel(c)}</button>
            ))}
          </div>
        </div>

        {loading ? <p style={{ color: '#94a3b8', fontSize: 13 }}>Loading products…</p> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {filtered.map(p => (
              <ProductCard key={p.id} product={p}
                onAdd={() => onAddToCart(p.id, 1, p.name)} />
            ))}
          </div>
        )}
      </div>

      {/* Slide-in cart panel */}
      <div style={{ width: 280, flexShrink: 0, position: 'sticky', top: 24 }}>
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9' }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>Cart</span>
            {cartEnriched.length > 0 && (
              <span style={{ marginLeft: 8, background: BRAND, color: '#fff', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                {cartEnriched.reduce((s, i) => s + i.qty, 0)}
              </span>
            )}
          </div>
          {cartEnriched.length === 0 ? (
            <div style={{ padding: '24px 18px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Your cart is empty</div>
          ) : (
            <>
              <div style={{ padding: '12px 18px', maxHeight: 340, overflowY: 'auto' }}>
                {Object.entries(cartBySupplier).map(([supplier, items]) => (
                  <div key={supplier} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: '#64748b', marginBottom: 6 }}>
                      <span style={{ background: supplierColor(supplier), borderRadius: 4, padding: '2px 7px' }}>{supplier}</span>
                    </div>
                    {items.map(item => (
                      <div key={item.product_id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 18 }}>{item.emoji || '📦'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>£{parseFloat(item.price || 0).toFixed(2)} × {item.qty}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button onClick={() => onUpdateQty(item.product_id, item.qty - 1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                          <span style={{ fontSize: 12, fontWeight: 700, minWidth: 16, textAlign: 'center' }}>{item.qty}</span>
                          <button onClick={() => onUpdateQty(item.product_id, item.qty + 1)} style={{ width: 22, height: 22, borderRadius: 4, border: 'none', background: '#0f172a', color: '#fff', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
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
                {success
                  ? <div style={{ textAlign: 'center', color: '#16a34a', fontWeight: 700, fontSize: 13 }}>✓ Order placed!</div>
                  : <button onClick={placeOrder} disabled={placing} style={{ width: '100%', padding: '10px 0', borderRadius: 9, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{placing ? 'Placing…' : 'Place Order'}</button>
                }
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Product Card ──────────────────────────────────────────────────────────────

function ProductCard({ product: p, onAdd }) {
  return (
    <div style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', textAlign: 'center' }}>
      {p.image_base64
        ? <img src={p.image_base64} alt={p.name} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />
        : <div style={{ fontSize: 32 }}>{p.emoji || '📦'}</div>
      }
      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.3, flex: 1 }}>{p.name}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: BRAND }}>£{parseFloat(p.price || 0).toFixed(2)}</span>
        <button onClick={onAdd} style={{ padding: '5px 14px', borderRadius: 7, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
      </div>
    </div>
  )
}

// ── Cart Tab ──────────────────────────────────────────────────────────────────

function CartTab({ cartItems, onUpdateQty, onRemove, onClearCart, onOrderPlaced, onGoToOrders }) {
  const [placing, setPlacing] = useState(false)
  const [success, setSuccess] = useState(false)

  // Enrich from joined shop_products data in cartItems
  const enriched = cartItems.map(ci => {
    const p = ci.shop_products || {}
    return {
      product_id:    ci.product_id,
      qty:           ci.qty,
      name:          p.name || '',
      variant:       p.variant || '',
      price:         p.price || 0,
      emoji:         p.emoji || '📦',
      image_base64:  p.image_base64 || null,
      supplier_id:   p.supplier_id || null,
      supplier_name: ci.supplier_name || p.suppliers?.name || null,
    }
  })

  const bySupplier = enriched.reduce((acc, item) => {
    const key = item.supplier_name || 'Unknown'
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})

  const total = enriched.reduce((s, i) => s + i.qty * parseFloat(i.price || 0), 0)

  async function checkout() {
    if (!enriched.length) return
    setPlacing(true)
    try {
      const items = enriched.map(i => ({
        product_id:  i.product_id,
        qty:         i.qty,
        unit_price:  i.price,
        supplier_id: i.supplier_id || null,
      }))
      await axios.post(`${API}/api/shop/orders`, { items })
      setSuccess(true)
      await onOrderPlaced()
      setTimeout(() => { onGoToOrders() }, 1500)
    } catch (err) {
      alert('Checkout failed: ' + (err.response?.data?.error || err.message))
      setPlacing(false)
    }
  }

  if (!enriched.length && !success) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🛒</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>Your cart is empty</div>
        <div style={{ fontSize: 13 }}>Click <strong>Reorder</strong> on any item in Inventory to add it here.</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 660 }}>
      {success && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '14px 18px', marginBottom: 16, color: '#166534', fontWeight: 700, fontSize: 13 }}>
          ✓ Order placed! Redirecting to Orders…
        </div>
      )}

      {Object.entries(bySupplier).map(([supplier, items]) => (
        <div key={supplier} style={{ ...card, marginBottom: 12 }}>
          <div style={{ display: 'inline-block', background: supplierColor(supplier), borderRadius: 5, padding: '3px 10px', fontSize: 11, fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 }}>{supplier}</div>
          {items.map(item => (
            <div key={item.product_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
              {item.image_base64
                ? <img src={item.image_base64} alt={item.name} style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                : <span style={{ fontSize: 24, flexShrink: 0 }}>{item.emoji}</span>
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{item.name}{item.variant ? ` (${item.variant})` : ''}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  £{parseFloat(item.price).toFixed(2)} each · subtotal <strong>£{(item.qty * parseFloat(item.price)).toFixed(2)}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => onUpdateQty(item.product_id, item.qty - 1)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 16 }}>−</button>
                <span style={{ fontSize: 13, fontWeight: 800, minWidth: 22, textAlign: 'center' }}>{item.qty}</span>
                <button onClick={() => onUpdateQty(item.product_id, item.qty + 1)} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: '#0f172a', color: '#fff', cursor: 'pointer', fontSize: 16 }}>+</button>
              </div>
              <button onClick={() => onRemove(item.product_id)} style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 20, padding: '0 4px', lineHeight: 1 }}>×</button>
            </div>
          ))}
        </div>
      ))}

      <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>Order total</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: BRAND }}>£{total.toFixed(2)}</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => onClearCart()} style={{ ...btnCancel, padding: '10px 18px' }}>Clear cart</button>
          <button onClick={checkout} disabled={placing || success} style={{ ...btnSave, padding: '10px 28px', fontSize: 13 }}>
            {placing ? 'Placing…' : 'Checkout →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Inventory Tab ─────────────────────────────────────────────────────────────

const emptyInvForm = () => ({ product_id: '', stock_level: 0, auto_reorder: false, reorder_qty: 5 })

function InventoryTab({ onAddToCart }) {
  const [rows,       setRows]       = useState([])
  const [products,   setProducts]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState({})
  const [adding,     setAdding]     = useState(false)
  const [invForm,    setInvForm]    = useState(emptyInvForm())
  const [formSaving, setFormSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      axios.get(`${API}/api/shop/inventory`),
      axios.get(`${API}/api/shop/products`),
    ]).then(([invR, prodR]) => {
      setRows(invR.data); setProducts(prodR.data)
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  function setF(k, v) { setInvForm(f => ({ ...f, [k]: v })) }

  async function saveNewInventory() {
    if (!invForm.product_id) return alert('Select a product')
    setFormSaving(true)
    try {
      await axios.patch(`${API}/api/shop/inventory/${invForm.product_id}`, {
        stock_level: invForm.stock_level,
        auto_reorder: invForm.auto_reorder, reorder_qty: invForm.reorder_qty,
      })
      setAdding(false); setInvForm(emptyInvForm()); load()
    } catch (err) {
      alert('Save failed: ' + (err.response?.data?.error || err.message))
    } finally { setFormSaving(false) }
  }

  async function patchRow(productId, patch) {
    setSaving(s => ({ ...s, [productId]: true }))
    try { await axios.patch(`${API}/api/shop/inventory/${productId}`, patch) }
    catch (err) { alert('Save failed: ' + (err.response?.data?.error || err.message)) }
    finally { setSaving(s => ({ ...s, [productId]: false })) }
  }

  async function updateField(row, field, value) {
    const updated = {
      auto_reorder: field === 'auto_reorder' ? value : (row.auto_reorder ?? false),
      reorder_qty:  field === 'reorder_qty'  ? value : (row.reorder_qty  ?? 5),
    }
    setRows(rs => rs.map(r => r.product_id === row.product_id ? { ...r, ...updated } : r))
    await patchRow(row.product_id, updated)
  }

  const numInp = { width: 60, padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none' }
  if (loading) return <p style={{ color: '#94a3b8', fontSize: 13 }}>Loading inventory…</p>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        {!adding && (
          <button onClick={() => setAdding(true)} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Add Inventory</button>
        )}
      </div>

      {adding && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: '#0f172a', marginBottom: 12 }}>Add inventory record</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            {[
              { label: 'Product', content: (
                <select value={invForm.product_id} onChange={e => setF('product_id', e.target.value)} style={{ ...numInp, width: 200 }}>
                  <option value="">— select —</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.variant ? ` (${p.variant})` : ''}</option>)}
                </select>
              )},
              { label: 'Stock level', content: <input type="number" min={0} value={invForm.stock_level} onChange={e => setF('stock_level', parseInt(e.target.value) || 0)} style={numInp} /> },
              { label: 'Reorder qty', content: <input type="number" min={1} value={invForm.reorder_qty}  onChange={e => setF('reorder_qty',  parseInt(e.target.value) || 1)} style={numInp} /> },
            ].map(({ label, content }) => (
              <div key={label}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
                {content}
              </div>
            ))}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>Auto-reorder</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', height: 30 }}>
                <input type="checkbox" checked={invForm.auto_reorder} onChange={e => setF('auto_reorder', e.target.checked)} style={{ accentColor: '#0f172a', width: 16, height: 16 }} />
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
              {['Product', 'SKU', 'Stock', 'Auto-Reorder', 'Reorder qty', ''].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 800, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const p = row.shop_products || {}
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
                  <td style={{ padding: '12px 16px', color: '#64748b', fontFamily: 'monospace', fontSize: 12 }}>{p.sku || '—'}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0f172a' }}>{row.stock_level}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={row.auto_reorder ?? false} onChange={e => updateField(row, 'auto_reorder', e.target.checked)} style={{ accentColor: '#0f172a', width: 16, height: 16 }} />
                      <span style={{ fontSize: 12, color: '#64748b' }}>{row.auto_reorder ? 'On' : 'Off'}</span>
                    </label>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <input type="number" min={1} value={row.reorder_qty ?? 5} onChange={e => updateField(row, 'reorder_qty', parseInt(e.target.value) || 1)} style={numInp} />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <button
                      onClick={() => onAddToCart(row.product_id, row.reorder_qty ?? 1, p.name)}
                      style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Reorder
                    </button>
                    {saving[row.product_id] && <span style={{ marginLeft: 6, fontSize: 11, color: '#94a3b8' }}>saving…</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No inventory records yet.</div>
        )}
      </div>
    </div>
  )
}

// ── Orders Tab ────────────────────────────────────────────────────────────────

function OrdersTab({ isAdmin }) {
  const [orders,    setOrders]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [viewOrder, setViewOrder] = useState(null)

  const loadOrders = useCallback(() => {
    setLoading(true)
    axios.get(`${API}/api/shop/orders`)
      .then(r => setOrders(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadOrders() }, [loadOrders])

  const canCancel = o => o.status === 'pending' || o.status === 'paid'

  async function cancelOrder(order) {
    if (!window.confirm('Cancel this order? Stock levels will be restored.')) return
    try {
      await axios.post(`${API}/api/shop/orders/${order.id}/cancel`)
      loadOrders()
    } catch (err) {
      alert(err.response?.data?.error || 'Could not cancel order.')
    }
  }

  async function markProcessing(orderId) {
    try {
      await axios.post(`${API}/api/shop/admin/orders/${orderId}/mark-processing`)
      loadOrders()
    } catch (err) {
      alert(err.response?.data?.error || 'Could not update.')
    }
  }

  async function cleanupGhosts() {
    try {
      const r = await axios.post(`${API}/api/shop/admin/orders/cleanup-ghosts`)
      alert(`Done — ${r.data.deleted} ghost order${r.data.deleted !== 1 ? 's' : ''} deleted.`)
      loadOrders()
    } catch (err) {
      alert(err.response?.data?.error || 'Cleanup failed.')
    }
  }

  if (loading) return <p style={{ color: '#94a3b8', fontSize: 13 }}>Loading orders…</p>
  if (!orders.length) return <p style={{ color: '#94a3b8', fontSize: 13 }}>No orders yet.</p>

  return (
    <>
      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button onClick={cleanupGhosts} style={{ ...btnCancel, padding: '7px 14px', fontSize: 12, color: '#ef4444', borderColor: '#fca5a5' }}>
            Clean up ghost orders
          </button>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {orders.map(order => (
          <div key={order.id} style={{ ...card }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={statusBadge(order.status)}>{order.status}</span>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  {new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 800, color: BRAND, fontSize: 14 }}>£{parseFloat(order.total || 0).toFixed(2)}</span>
                {isAdmin && canCancel(order) && (
                  <button onClick={() => markProcessing(order.id)} style={{ ...btnSave, padding: '4px 10px', fontSize: 11 }}>
                    Mark Processing
                  </button>
                )}
                <button onClick={() => setViewOrder(order)} style={{ ...btnEdit, padding: '4px 12px' }}>View</button>
                {canCancel(order)
                  ? <button onClick={() => cancelOrder(order)} style={{ ...btnCancel, padding: '4px 12px', color: '#ef4444', borderColor: '#fca5a5' }}>Cancel</button>
                  : <button disabled title="Order is already being processed and can no longer be cancelled"
                      style={{ ...btnCancel, padding: '4px 12px', color: '#cbd5e1', cursor: 'not-allowed', borderColor: '#e2e8f0' }}>Cancel</button>
                }
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(order.shop_order_items || []).map((item, i) => {
                const p = item.shop_products || {}
                const s = item.suppliers    || {}
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

      {/* Order detail modal */}
      {viewOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 900, color: '#0f172a', margin: 0 }}>Order Details</h2>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  {new Date(viewOrder.created_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              </div>
              <button onClick={() => setViewOrder(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
              <span style={statusBadge(viewOrder.status)}>{viewOrder.status}</span>
              {viewOrder.tracking_number && (
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Tracking: {viewOrder.tracking_number}</span>
              )}
            </div>

            {Object.entries(
              (viewOrder.shop_order_items || []).reduce((acc, item) => {
                const key = item.suppliers?.name || 'Unknown'
                if (!acc[key]) acc[key] = []
                acc[key].push(item)
                return acc
              }, {})
            ).map(([supplier, items]) => (
              <div key={supplier} style={{ marginBottom: 16 }}>
                <div style={{ display: 'inline-block', background: supplierColor(supplier), borderRadius: 5, padding: '3px 10px', fontSize: 11, fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>{supplier}</div>
                {items.map((item, i) => {
                  const p = item.shop_products || {}
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: 20 }}>{p.emoji || '📦'}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}{p.variant ? ` (${p.variant})` : ''}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>£{parseFloat(item.unit_price || 0).toFixed(2)} × {item.qty}</div>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 13 }}>£{(parseFloat(item.unit_price || 0) * item.qty).toFixed(2)}</div>
                    </div>
                  )
                })}
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid #e2e8f0', marginTop: 4 }}>
              <span style={{ fontWeight: 800, fontSize: 14 }}>Total</span>
              <span style={{ fontWeight: 900, fontSize: 16, color: BRAND }}>£{parseFloat(viewOrder.total || 0).toFixed(2)}</span>
            </div>
            <button onClick={() => setViewOrder(null)} style={{ ...btnSave, width: '100%', padding: '10px 0', marginTop: 16, fontSize: 13 }}>Close</button>
          </div>
        </div>
      )}
    </>
  )
}

// ── Admin Tab ─────────────────────────────────────────────────────────────────

function AdminTab() {
  const [suppliers, setSuppliers] = useState([])
  const [products,  setProducts]  = useState([])

  const loadSuppliers = useCallback(() =>
    axios.get(`${API}/api/shop/suppliers`).then(r => setSuppliers(r.data)).catch(console.error), [])
  const loadProducts  = useCallback(() =>
    axios.get(`${API}/api/shop/products`).then(r => setProducts(r.data)).catch(console.error), [])

  useEffect(() => { loadSuppliers(); loadProducts() }, [loadSuppliers, loadProducts])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <SuppliersSection suppliers={suppliers} onRefresh={loadSuppliers} />
      <ProductsSection  products={products}   suppliers={suppliers} onRefresh={() => { loadProducts(); loadSuppliers() }} />
    </div>
  )
}

// ── Suppliers section ─────────────────────────────────────────────────────────

function emptySupplier() { return { name: '', contact_email: '', website: '' } }

function SuppliersSection({ suppliers, onRefresh }) {
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form,   setForm]   = useState(emptySupplier())
  const [saving, setSaving] = useState(false)

  function startAdd()   { setAdding(true); setEditId(null); setForm(emptySupplier()) }
  function startEdit(s) { setEditId(s.id); setAdding(false); setForm({ name: s.name, contact_email: s.contact_email || '', website: s.website || '' }) }
  function cancel()     { setAdding(false); setEditId(null) }
  function set(k, v)    { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    if (!form.name.trim()) return alert('Name is required')
    setSaving(true)
    try {
      editId ? await axios.patch(`${API}/api/shop/admin/suppliers/${editId}`, form)
             : await axios.post(`${API}/api/shop/admin/suppliers`, form)
      cancel(); onRefresh()
    } catch (err) { alert(err.response?.data?.error || err.message) }
    finally { setSaving(false) }
  }

  async function del(id) {
    if (!window.confirm('Delete this supplier?')) return
    try { await axios.delete(`${API}/api/shop/admin/suppliers/${id}`); onRefresh() }
    catch (err) { alert(err.response?.data?.error || err.message) }
  }

  const formRow = (
    <tr>
      <TD><input value={form.name}          onChange={e => set('name', e.target.value)}          placeholder="Supplier name"       style={{ ...inp, width: 160 }} /></TD>
      <TD><input value={form.contact_email} onChange={e => set('contact_email', e.target.value)} placeholder="contact@example.com" style={{ ...inp, width: 180 }} /></TD>
      <TD><input value={form.website}       onChange={e => set('website', e.target.value)}       placeholder="https://…"           style={{ ...inp, width: 160 }} /></TD>
      <TD><div style={{ display: 'flex', gap: 6 }}>
        <button onClick={save} disabled={saving} style={btnSave}>{saving ? 'Saving…' : 'Save'}</button>
        <button onClick={cancel} style={btnCancel}>Cancel</button>
      </div></TD>
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
          <thead><tr style={{ background: '#f8fafc' }}><TH>Name</TH><TH>Contact email</TH><TH>Website</TH><TH></TH></tr></thead>
          <tbody>
            {adding && formRow}
            {suppliers.map(s => editId === s.id
              ? <tr key={s.id}>{formRow.props.children}</tr>
              : <tr key={s.id}>
                  <TD style={{ fontWeight: 700 }}>{s.name}</TD>
                  <TD style={{ color: '#64748b' }}>{s.contact_email || '—'}</TD>
                  <TD style={{ color: '#64748b' }}>{s.website || '—'}</TD>
                  <TD><div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => startEdit(s)} style={btnEdit}>Edit</button>
                    <button onClick={() => del(s.id)} style={btnDelete}>Delete</button>
                  </div></TD>
                </tr>
            )}
            {suppliers.length === 0 && !adding && (
              <tr><td colSpan={4} style={{ padding: '20px 14px', color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>No suppliers yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Products section ──────────────────────────────────────────────────────────

function compressImage(file, cb) {
  const url = URL.createObjectURL(file)
  const img = new window.Image()
  img.onload = () => {
    const MAX = 800, scale = img.width > MAX ? MAX / img.width : 1
    const canvas = document.createElement('canvas')
    canvas.width  = Math.round(img.width  * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(url)
    cb(canvas.toDataURL('image/jpeg', 0.7))
  }
  img.src = url
}

function emptyProduct() { return { name: '', sku: '', variant: '', price: '', category: CATEGORIES[0], supplier_id: '', image_base64: null } }

function ProductsSection({ products, suppliers, onRefresh }) {
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form,   setForm]   = useState(emptyProduct())
  const [saving, setSaving] = useState(false)

  function startAdd()   { setAdding(true); setEditId(null); setForm(emptyProduct()) }
  function startEdit(p) {
    setEditId(p.id); setAdding(false)
    setForm({ name: p.name, sku: p.sku || '', variant: p.variant || '', price: p.price || '', category: p.category || CATEGORIES[0], supplier_id: p.supplier_id || '', image_base64: p.image_base64 || null })
  }
  function cancel()  { setAdding(false); setEditId(null) }
  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    if (!form.name.trim()) return alert('Name is required')
    setSaving(true)
    try {
      const body = { ...form, price: parseFloat(form.price) || 0, supplier_id: form.supplier_id || null, image_base64: form.image_base64 || null, sku: form.sku || null }
      editId ? await axios.patch(`${API}/api/shop/admin/products/${editId}`, body)
             : await axios.post(`${API}/api/shop/admin/products`, body)
      cancel(); onRefresh()
    } catch (err) { alert(err.response?.data?.error || err.message) }
    finally { setSaving(false) }
  }

  async function del(id) {
    if (!window.confirm('Delete this product?')) return
    try { await axios.delete(`${API}/api/shop/admin/products/${id}`); onRefresh() }
    catch (err) { alert(err.response?.data?.error || err.message) }
  }

  const formRow = (
    <tr>
      <TD>
        <label style={{ cursor: 'pointer', display: 'block' }}>
          {form.image_base64
            ? <img src={form.image_base64} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
            : <div style={{ width: 40, height: 40, borderRadius: 6, background: '#f1f5f9', border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>+</div>
          }
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) compressImage(e.target.files[0], b64 => set('image_base64', b64)) }} />
        </label>
      </TD>
      <TD><input value={form.name}    onChange={e => set('name',    e.target.value)} placeholder="Product name" style={{ ...inp, width: 130 }} /></TD>
      <TD><input value={form.sku}     onChange={e => set('sku',     e.target.value)} placeholder="SKU-001"      style={{ ...inp, width: 90  }} /></TD>
      <TD><input value={form.variant} onChange={e => set('variant', e.target.value)} placeholder="e.g. 15ml"   style={{ ...inp, width: 90  }} /></TD>
      <TD>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 13, color: '#64748b' }}>£</span>
          <input type="number" min={0} step={0.01} value={form.price} onChange={e => set('price', e.target.value)} style={{ ...inp, width: 70 }} />
        </div>
      </TD>
      <TD>
        <select value={form.category} onChange={e => set('category', e.target.value)} style={{ ...inp }}>
          {CATEGORIES.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
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
            <TH>Photo</TH><TH>Name</TH><TH>SKU</TH><TH>Variant</TH><TH>Price</TH><TH>Category</TH><TH>Supplier</TH><TH></TH>
          </tr></thead>
          <tbody>
            {adding && formRow}
            {products.map(p => editId === p.id
              ? <tr key={p.id}>{formRow.props.children}</tr>
              : <tr key={p.id}>
                  <TD>
                    {p.image_base64
                      ? <img src={p.image_base64} alt={p.name} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />
                      : <div style={{ width: 40, height: 40, borderRadius: 6, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{p.emoji || '📦'}</div>
                    }
                  </TD>
                  <TD style={{ fontWeight: 700 }}>{p.name}</TD>
                  <TD style={{ color: '#64748b', fontFamily: 'monospace', fontSize: 12 }}>{p.sku || '—'}</TD>
                  <TD style={{ color: '#64748b' }}>{p.variant || '—'}</TD>
                  <TD>£{parseFloat(p.price || 0).toFixed(2)}</TD>
                  <TD style={{ color: '#64748b' }}>{catLabel(p.category)}</TD>
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
            )}
            {products.length === 0 && !adding && (
              <tr><td colSpan={8} style={{ padding: '20px 14px', color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>No products yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
