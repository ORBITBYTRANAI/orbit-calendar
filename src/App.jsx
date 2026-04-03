import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Analytics from './Analytics'
import ShopView from './Shop'
import orbitLogo from './assets/orbit-logo.png'
import FullCalendar from '@fullcalendar/react'
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import axios from 'axios'

const API = 'https://orbit-backend-production-e46d.up.railway.app'

// Constants 
const CATEGORIES = [
 { label: 'Nail Enhancements', color: '#f4cccc' },
 { label: 'Natural Nails',     color: '#c9daf8' },
 { label: 'Service Add On',    color: '#fde68a' },
 { label: 'Beauty',            color: '#c182ca' },
]
const CATEGORY_COLOR = Object.fromEntries(CATEGORIES.map(c => [c.label, c.color]))
function getPaymentMethods(country) {
 return country === 'UK'
   ? ['Cash', 'Card', 'Stripe Deposit', 'Gift Card']
   : ['Cash', 'Chuyển Khoản', 'Terminal', 'Gift Card']
}
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

const DEFAULT_HOURS = DAYS.map((d, i) => ({
 day: d,
 open: i < 6,
 from: '10:00',
 to: '19:00',
}))

// Shared styles 
const lbl = { display:'block', fontSize:11, fontWeight:800, color:'#64748b', textTransform:'uppercase', letterSpacing:0.8, marginBottom:5, marginTop:14 }
const inp = { width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13, boxSizing:'border-box', fontFamily:'inherit', outline:'none' }
const btnPrimary = { padding:'11px 20px', borderRadius:10, border:'none', background:'#0f172a', color:'#fff', fontWeight:800, cursor:'pointer', fontSize:13 }
const btnGhost = { padding:'11px 20px', borderRadius:10, border:'1px solid #e2e8f0', background:'#fff', fontWeight:800, cursor:'pointer', fontSize:13, color:'#0f172a' }
const btnDanger = { padding:'11px 20px', borderRadius:10, border:'none', background:'#ef4444', color:'#fff', fontWeight:800, cursor:'pointer', fontSize:13 }
const btnGreen  = { padding:'11px 20px', borderRadius:10, border:'none', background:'#059669', color:'#fff', fontWeight:800, cursor:'pointer', fontSize:13 }
const btnAmber  = { padding:'11px 20px', borderRadius:10, border:'none', background:'#f59e0b', color:'#fff', fontWeight:800, cursor:'pointer', fontSize:13 }

// Modal wrapper 
function Modal({ title, onClose, children, width }) {
 return (
 <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999, padding:16 }}>
 <div style={{ background:'#fff', borderRadius:18, padding:28, width:width||460, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
 <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
 <h2 style={{ fontSize:18, fontWeight:900, color:'#0f172a' }}>{title}</h2>
 <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#94a3b8', lineHeight:1 }}>×</button>
 </div>
 {children}
 </div>
 </div>
 )
}

// Flag Icon
function FlagIcon({ active, size=14 }) {
 return (
   <svg width={size} height={size+2} viewBox="0 0 12 14" fill="none" style={{ display:'block', flexShrink:0 }}>
     <line x1="1.5" y1="1" x2="1.5" y2="13" stroke={active ? '#ef4444' : '#d1d5db'} strokeWidth="1.5" strokeLinecap="round"/>
     <path d="M1.5 1.5 L10.5 4.5 L1.5 7.5 Z" fill={active ? '#ef4444' : '#d1d5db'} stroke={active ? '#ef4444' : '#d1d5db'} strokeWidth="0.5"/>
   </svg>
 )
}

// Checkout Modal 
function CheckoutModal({ booking, services, onClose, onComplete, receiptData, country, loyaltyDiscount }) {
 const selectedSvcs = booking.service_ids?.length
 ? booking.service_ids.map(id => services.find(s => s.id === id)).filter(Boolean)
 : (booking.service_id ? [services.find(s => s.id === booking.service_id)].filter(Boolean) : [])
 const svc = selectedSvcs[0] || services.find(s => s.id === booking.service_id)
 const upsellItems = Array.isArray(booking.upsell_products) ? booking.upsell_products : []
 const upsellTotal = upsellItems.reduce((sum, p) => sum + parseFloat(p.price || 0), 0)
 const defaultTotal = parseFloat((selectedSvcs.reduce((sum, s) => sum + parseFloat(s?.price || 0), 0) + upsellTotal).toFixed(2)) || parseFloat(svc?.price || 0)
 const discountAmt = (loyaltyDiscount && !receiptData) ? (parseFloat(loyaltyDiscount) || 0) : 0

 // Initialise synchronously from pre-fetched receiptData so receipt shows with no flash
 const initDone   = booking.status === 'completed'
 const initTotal  = receiptData?.total_amount ?? Math.max(0, defaultTotal - discountAmt)
 const initSplits = (Array.isArray(receiptData?.payments) && receiptData.payments.length)
   ? receiptData.payments
   : [{ method: 'Cash', amount: Math.max(0, defaultTotal - discountAmt) }]
 const initNotes  = receiptData?.notes || ''

 const [total, setTotal] = useState(initTotal)
 const [splits, setSplits] = useState(initSplits)
 const [notes, setNotes] = useState(initNotes)
 const [loading, setLoading] = useState(false)
 const [done, setDone] = useState(initDone)
 const [sendingEmail, setSendingEmail] = useState(false)
 const [receiptSent, setReceiptSent] = useState(false)
 const [gcValidation, setGcValidation] = useState({}) // index → { ok, remaining_balance, error }
 const [gcValidating, setGcValidating] = useState({})

 async function validateGiftCard(i) {
   const code = (splits[i]?.gift_card_code || '').trim()
   if (!code) return
   setGcValidating(prev => ({ ...prev, [i]: true }))
   try {
     const { data } = await axios.post(API + '/api/gift-cards/validate', { code })
     setGcValidation(prev => ({ ...prev, [i]: { ok: true, ...data } }))
     // Auto-fill amount = min(card remaining, checkout remaining)
     const currentSplitTotal = splits.reduce((s, p, idx) => idx === i ? s : s + (parseFloat(p.amount) || 0), 0)
     const checkoutRemaining = parseFloat((total - currentSplitTotal).toFixed(2))
     const apply = parseFloat(Math.min(data.remaining_balance, checkoutRemaining > 0 ? checkoutRemaining : data.remaining_balance).toFixed(2))
     updateSplit(i, 'amount', apply)
   } catch (err) {
     setGcValidation(prev => ({ ...prev, [i]: { ok: false, error: err.response?.data?.error || 'Invalid gift card' } }))
   }
   setGcValidating(prev => ({ ...prev, [i]: false }))
 }

 const splitTotal = splits.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
 const remaining = parseFloat((total - splitTotal).toFixed(2))
 const balanced = Math.abs(remaining) < 0.01

 function addSplit() { setSplits(prev => [...prev, { method: 'Cash', amount: remaining > 0 ? remaining : 0 }]) }
 function removeSplit(i) { setSplits(prev => prev.filter((_, idx) => idx !== i)) }
 function updateSplit(i, field, value) {
 setSplits(prev => prev.map((s, idx) => idx !== i ? s : { ...s, [field]: value }))
 }

 async function handleCheckout() {
 if (!balanced) { alert(`Payment total £${splitTotal.toFixed(2)} doesn't match bill £${total.toFixed(2)}`); return }
 setLoading(true)
 try {
 await axios.post(API + '/api/checkouts', {
 booking_id: booking.id, total_amount: total, payments: splits, notes
 })
 setDone(true)
 onComplete(booking.id, false)
 // Reset loyalty discount flag on the customer after checkout
 if (discountAmt > 0 && booking.customer_id) {
   axios.patch(API + '/api/customers/' + booking.customer_id, { loyalty_discount_active: false }).catch(() => {})
 }
 } catch (err) {
 alert(err.response?.data?.error || 'Checkout failed.')
 setLoading(false)
 }
 }

 if (done) {
 const receiptId = 'RCP-' + booking.id?.slice(0,8).toUpperCase()
 const printedAt = new Date().toLocaleString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })

 function printReceipt() {
 const w = window.open('', '_blank', 'width=420,height=600')
 w.document.write(`
 <html><head><title>Receipt ${receiptId}</title>
 <style>
 body { font-family: ui-sans-serif, sans-serif; padding: 32px; color: #0f172a; max-width: 380px; margin: 0 auto; }
 h1 { font-size: 22px; font-weight: 900; margin: 0 0 4px; }
 .sub { font-size: 12px; color: #64748b; margin-bottom: 24px; }
 .divider { border: none; border-top: 1px solid #e2e8f0; margin: 16px 0; }
 .row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; }
 .label { color: #64748b; }
 .total-row { display: flex; justify-content: space-between; font-size: 16px; font-weight: 900; margin-top: 8px; }
 .payment { font-size: 12px; color: #64748b; margin-bottom: 4px; }
 .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 32px; }
 </style></head><body>
 <h1>Orbit</h1>
 <div class="sub">Receipt · ${receiptId}</div>
 <div class="row"><span class="label">Client</span><span>${booking.customers?.full_name || 'Guest'}</span></div>
 <div class="row"><span class="label">Service</span><span>${svc?.name || '—'}</span></div>
 <div class="row"><span class="label">Technician</span><span>${booking.technicians?.name || '—'}</span></div>
 <div class="row"><span class="label">Date</span><span>${new Date(booking.start_time).toLocaleString('en-GB', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span></div>
 <hr class="divider"/>
 ${splits.map(s => `<div class="payment">${s.method} — £${parseFloat(s.amount).toFixed(2)}</div>`).join('')}
 <div class="total-row"><span>Total</span><span>£${total.toFixed(2)}</span></div>
 <hr class="divider"/>
 <div class="footer">Printed ${printedAt}<br/>Thank you for visiting!</div>
 </body></html>
 `)
 w.document.close()
 w.focus()
 setTimeout(() => { w.print(); w.close() }, 300)
 }

 async function emailReceipt() {
 const email = booking.customers?.email
 if (!email) return
 setSendingEmail(true)
 try {
   await axios.post(API + '/api/email-receipt', {
     to:             email,
     customerName:   booking.customers?.full_name || 'Guest',
     serviceNames:   selectedSvcs.length > 0 ? selectedSvcs.map(s => s.name) : [svc?.name || '—'],
     technicianName: booking.technicians?.name || '—',
     startTime:      booking.start_time,
     payments:       splits,
     total,
   })
   setReceiptSent(true)
   setTimeout(() => setReceiptSent(false), 3000)
 } catch (err) {
   alert('Failed to send receipt: ' + (err.response?.data?.error || err.message))
 }
 setSendingEmail(false)
 }

 return (
 <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999, padding:16 }}>
 <div style={{ background:'#fff', borderRadius:18, padding:28, width:440, boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
 <div style={{ textAlign:'center', marginBottom:20 }}>
 <div style={{ fontSize:40, marginBottom:8 }}></div>
 <div style={{ fontSize:18, fontWeight:900, color:'#059669' }}>Payment Complete</div>
 <div style={{ fontSize:12, color:'#94a3b8', marginTop:4 }}>{receiptId}</div>
 </div>
 <div style={{ background:'#f8fafc', borderRadius:14, padding:18, border:'1px solid #e2e8f0', marginBottom:20 }}>
 <div style={{ fontWeight:900, fontSize:15, marginBottom:10 }}>{booking.customers?.full_name || 'Guest'}</div>
 <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:6 }}>
 <span style={{ color:'#64748b' }}>Service{selectedSvcs.length > 1 ? 's' : ''}</span>
 <span style={{ fontWeight:700, textAlign:'right', maxWidth:200 }}>
 {selectedSvcs.length > 0 ? selectedSvcs.map(s => s.name).join(', ') : (svc?.name || '—')}
 </span>
 </div>
 <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:6 }}>
 <span style={{ color:'#64748b' }}>Technician</span>
 <span style={{ fontWeight:700 }}>{booking.technicians?.name || '—'}</span>
 </div>
 <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:12 }}>
 <span style={{ color:'#64748b' }}>Date</span>
 <span style={{ fontWeight:700 }}>{new Date(booking.start_time).toLocaleString('en-GB', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
 </div>
 <div style={{ borderTop:'1px solid #e2e8f0', paddingTop:10, marginTop:4 }}>
{upsellItems.length > 0 && upsellItems.map((p, i) => (
<div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#c9a96e', marginBottom:3 }}>
  <span>{p.name}</span><span>£{parseFloat(p.price || 0).toFixed(2)}</span>
</div>
))}
 {discountAmt > 0 && (
 <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#059669', fontWeight:700, marginBottom:4 }}>
   <span>Loyalty Discount</span><span>-Â£{discountAmt.toFixed(2)}</span>
 </div>
 )}
 {splits.map((s, i) => (
 <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#64748b', marginBottom:4 }}>
 <span>{s.method}</span><span>£{parseFloat(s.amount).toFixed(2)}</span>
 </div>
 ))}
 <div style={{ display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:900, marginTop:6 }}>
 <span>Total</span><span>£{total.toFixed(2)}</span>
 </div>
 </div>
 </div>
 <div style={{ display:'flex', gap:10 }}>
 <button onClick={printReceipt} style={{ ...btnPrimary, flex:1 }}> Print Receipt</button>
 {booking.customers?.email && (
   receiptSent
     ? <div style={{ flex:1, textAlign:'center', fontSize:13, fontWeight:700, color:'#059669', padding:'11px 0' }}>Receipt sent!</div>
     : <button onClick={emailReceipt} disabled={sendingEmail} style={{ ...btnGhost, flex:1, opacity: sendingEmail ? 0.7 : 1 }}>
         {sendingEmail ? 'Sending…' : ' Email Receipt'}
       </button>
 )}
 <button onClick={() => onComplete(booking.id, true)} style={{ ...btnGhost, padding:'11px 14px' }}>Close</button>
 </div>
 </div>
 </div>
 )
 }

 return (
 <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999, padding:16 }}>
 <div style={{ background:'#fff', borderRadius:18, padding:28, width:500, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
 <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
 <h2 style={{ fontSize:18, fontWeight:900 }}>Checkout</h2>
 <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#94a3b8' }}>×</button>
 </div>
 <div style={{ background:'#f8fafc', borderRadius:12, padding:16, marginBottom:20, border:'1px solid #e2e8f0' }}>
 <div style={{ fontWeight:800, fontSize:15, marginBottom:6 }}>{booking.customers?.full_name || 'Guest'}</div>
 <div style={{ fontSize:13, color:'#64748b' }}>
 {svc?.name || 'Service'}{booking.technicians?.name ? ' · ' + booking.technicians.name : ''}
 </div>
 <div style={{ fontSize:13, color:'#64748b', marginTop:3 }}>
 {new Date(booking.start_time).toLocaleString('en-GB', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
 </div>
 </div>
 {upsellItems.length > 0 && (
<div style={{ background:'#fdf6ee', border:'1px solid #f4d9b0', borderRadius:8, padding:'10px 12px', marginBottom:12 }}>
  <div style={{ fontSize:11, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:0.8, marginBottom:6 }}>Add-on Products</div>
  {upsellItems.map((p, i) => (
    <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:3 }}>
      <span>{p.name}</span>
      <span style={{ fontWeight:700 }}>£{parseFloat(p.price || 0).toFixed(2)}</span>
    </div>
  ))}
</div>
)}
 {discountAmt > 0 && (
 <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, marginTop:10, marginBottom:4, fontSize:13, fontWeight:700, color:'#059669' }}>
   <span>Loyalty Discount applied</span><span>-Â£{discountAmt.toFixed(2)}</span>
 </div>
 )}
 <label style={lbl}>Total Amount (£)</label>
 <input style={inp} type="number" min="0" step="0.01" value={total} onChange={e => {
 const v = parseFloat(e.target.value) || 0
 setTotal(v)
 if (splits.length === 1) setSplits([{ ...splits[0], amount: v }])
 }} />
 <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:16, marginBottom:8 }}>
 <span style={{ fontSize:11, fontWeight:800, color:'#64748b', textTransform:'uppercase', letterSpacing:0.8 }}>Payment Method</span>
 <button onClick={addSplit} style={{ fontSize:12, padding:'4px 12px', borderRadius:8, border:'1px solid #e2e8f0', background:'#f8fafc', cursor:'pointer', fontWeight:700 }}>+ Split Payment</button>
 </div>
 {splits.map((split, i) => (
 <div key={i} style={{ marginBottom:10 }}>
   <div style={{ display:'flex', gap:8, alignItems:'center' }}>
     <select style={{ ...inp, flex:'0 0 160px', width:'auto' }} value={split.method}
       onChange={e => { updateSplit(i, 'method', e.target.value); setGcValidation(prev => { const n={...prev}; delete n[i]; return n }) }}>
       {getPaymentMethods(country).map(m => <option key={m}>{m}</option>)}
     </select>
     <input style={{ ...inp, flex:1, width:'auto' }} type="number" min="0" step="0.01"
       value={split.amount} onChange={e => updateSplit(i, 'amount', e.target.value)} placeholder="Amount" />
     {splits.length > 1 && (
       <button onClick={() => { removeSplit(i); setGcValidation(prev => { const n={...prev}; delete n[i]; return n }) }}
         style={{ background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:22, lineHeight:1, padding:'0 4px' }}>×</button>
     )}
   </div>
   {split.method === 'Gift Card' && (
     <div style={{ marginTop:5 }}>
       <div style={{ display:'flex', gap:6 }}>
         <input style={{ ...inp, flex:1, fontFamily:'monospace', fontSize:13, textTransform:'uppercase' }}
           placeholder="Code e.g. GC-XXXX-XXXX"
           value={split.gift_card_code || ''}
           onChange={e => { updateSplit(i, 'gift_card_code', e.target.value.toUpperCase()); setGcValidation(prev => { const n={...prev}; delete n[i]; return n }) }} />
         <button onClick={() => validateGiftCard(i)} disabled={gcValidating[i]}
           style={{ ...btnGhost, padding:'8px 12px', fontSize:12, whiteSpace:'nowrap', opacity: gcValidating[i] ? 0.6 : 1 }}>
           {gcValidating[i] ? '…' : 'Validate'}
         </button>
       </div>
       {gcValidation[i] && (
         gcValidation[i].ok
           ? <div style={{ fontSize:12, color:'#059669', fontWeight:700, marginTop:4 }}>
               Balance available: £{parseFloat(gcValidation[i].remaining_balance).toFixed(2)}
             </div>
           : <div style={{ fontSize:12, color:'#ef4444', fontWeight:700, marginTop:4 }}>
               {gcValidation[i].error}
             </div>
       )}
     </div>
   )}
 </div>
 ))}
 <div style={{ padding:'8px 12px', borderRadius:8, marginBottom:16, marginTop:4,
 background: balanced ? '#f0fdf4' : '#fef2f2',
 border: `1px solid ${balanced ? '#bbf7d0' : '#fecaca'}`,
 fontSize:13, fontWeight:700, color: balanced ? '#059669' : '#ef4444' }}>
 {balanced
 ? ` Fully paid — £${total.toFixed(2)}`
 : remaining > 0
 ? `£${remaining.toFixed(2)} still remaining`
 : `£${Math.abs(remaining).toFixed(2)} overpaid`}
 </div>
 <label style={lbl}>Notes (optional)</label>
 <textarea style={{ ...inp, height:60, resize:'vertical' }} value={notes}
 onChange={e => setNotes(e.target.value)} placeholder="Any checkout notes…" />
 <div style={{ display:'flex', gap:10, marginTop:20 }}>
 <button onClick={handleCheckout} disabled={loading || done}
 style={{ ...btnGreen, flex:1, opacity: loading ? 0.7 : 1 }}>
 {loading ? 'Processing…' : `Complete Checkout · £${total.toFixed(2)}`}
 </button>
 <button onClick={onClose} style={btnGhost}>Cancel</button>
 </div>
 </div>
 </div>
 )
}

// Opening Hours Modal 
function OpeningHoursModal({ hours, onSave, onClose }) {
 const [local, setLocal] = useState(hours.map(h => ({ ...h })))

 function toggle(i) { setLocal(prev => prev.map((h, idx) => idx !== i ? h : { ...h, open: !h.open })) }
 function setField(i, field, value) { setLocal(prev => prev.map((h, idx) => idx !== i ? h : { ...h, [field]: value })) }

 return (
 <Modal title="Opening Hours" onClose={onClose} width={480}>
 <p style={{ fontSize:13, color:'#64748b', marginTop:8, marginBottom:16 }}>
 Check a day to mark it as open. Closed days will be greyed out on the calendar.
 </p>
 <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
 {local.map((h, i) => (
 <div key={h.day} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:10,
 background: h.open ? '#f0fdf4' : '#f8fafc', border:`1px solid ${h.open ? '#bbf7d0' : '#e2e8f0'}` }}>
 <input type="checkbox" checked={h.open} onChange={() => toggle(i)}
 style={{ width:16, height:16, cursor:'pointer', accentColor:'#059669' }} />
 <span style={{ fontWeight:700, fontSize:13, width:100, color: h.open ? '#0f172a' : '#94a3b8' }}>{h.day}</span>
 {h.open ? (
 <>
 <input type="text" value={h.from} onChange={e => setField(i, 'from', e.target.value)}
 style={{ ...inp, width:72, padding:'6px 10px' }} placeholder="09:00" />
 <span style={{ fontSize:13, color:'#64748b' }}>–</span>
 <input type="text" value={h.to} onChange={e => setField(i, 'to', e.target.value)}
 style={{ ...inp, width:72, padding:'6px 10px' }} placeholder="19:00" />
 </>
 ) : (
 <span style={{ fontSize:12, color:'#94a3b8', fontStyle:'italic' }}>Closed</span>
 )}
 </div>
 ))}
 </div>
 <div style={{ display:'flex', gap:10, marginTop:20 }}>
 <button onClick={() => onSave(local)} style={{ ...btnPrimary, flex:1 }}>Save Hours</button>
 <button onClick={onClose} style={btnGhost}>Cancel</button>
 </div>
 </Modal>
 )
}

// Inbox View 
function InboxView({ country }) {
 const [conversations, setConversations] = useState([])
 const [activeConv, setActiveConv] = useState(null)
 const [messages, setMessages] = useState([])
 const [reply, setReply] = useState('')
 const [loading, setLoading] = useState(false)
 const [channel, setChannel] = useState('all')
 const [folder, setFolder] = useState('all')
 const bottomRef = useRef(null)

 useEffect(() => { loadConversations() }, [])
 useEffect(() => { if (activeConv) loadMessages(activeConv.id) }, [activeConv])
 useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

 async function loadConversations() {
 try {
   const { data } = await axios.get(API + '/api/conversations')
   console.log('[Inbox] raw API response:', data)
   console.log('[Inbox] email conversations:', (data || []).filter(c => c.channel === 'email'))
   setConversations(data || [])
 } catch (err) {
   console.error('[Inbox] loadConversations error:', err)
 }
 }
 async function loadMessages(convId) {
 try {
   const { data } = await axios.get(API + '/api/conversations/' + convId + '/messages')
   console.log('[Inbox] messages raw:', data)
   if (data?.length) console.log('[Inbox] first message keys:', Object.keys(data[0]), 'values:', data[0])
   setMessages(data || [])
 } catch (err) { console.error('[Inbox] loadMessages error:', err) }
 }
 async function sendReply() {
 if (!reply.trim() || !activeConv) return
 setLoading(true)
 const text = reply
 const optimistic = { id: 'tmp-' + Date.now(), body: text, sender_type: 'staff', created_at: new Date().toISOString() }
 setMessages(prev => [...prev, optimistic])
 setReply('')
 try {
   if (activeConv.channel === 'email') {
     await axios.post(API + '/api/inbox/email-reply', { conversation_id: activeConv.id, body: text })
   } else {
     await axios.post(API + '/api/conversations/' + activeConv.id + '/messages', { body: text, sender_type: 'staff' })
   }
 } catch {}
 setLoading(false)
 loadConversations()
 }
 async function moveFolder(convId, newFolder) {
 try {
 await axios.patch(API + '/api/conversations/' + convId + '/folder', { folder: newFolder })
 setConversations(prev => prev.map(c => c.id === convId ? { ...c, folder: newFolder } : c))
 if (activeConv?.id === convId) setActiveConv(prev => ({ ...prev, folder: newFolder }))
 } catch {}
 }

 const CHANNEL_COLORS = { zalo: '#0068ff', messenger: '#00b2ff', instagram: '#e1306c', website: '#c9a96e', email: '#10b981' }
 const CHANNEL_LABELS = { zalo: 'Zalo', messenger: 'Messenger', instagram: 'Instagram', website: 'Chat Widget', email: 'Email' }
 const CHANNELS = ['all', 'website', 'messenger', 'instagram', 'email']
 const FOLDERS = ['all', 'inquiries', 'feedback']
 const FOLDER_LABELS = { all: 'All', inquiries: 'General Inquiries', feedback: 'Feedback' }
 const FOLDER_ICONS = { all: '', inquiries: '', feedback: '' }

 const filtered = conversations.filter(c => {
 const chMatch = channel === 'all' || c.channel === channel
 // folder filter only applies to website conversations; email/messenger/etc always pass
 const folderMatch = c.channel !== 'website' || folder === 'all' || c.folder === folder || (folder === 'inquiries' && !c.folder)
 return chMatch && folderMatch
 })

 const tabStyle = (active) => ({
 padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
 fontWeight: 700, fontSize: 12,
 background: active ? '#0f172a' : '#f1f5f9',
 color: active ? '#fff' : '#64748b',
 })

 return (
 <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
 {/* Sidebar */}
 <div style={{ width: activeConv ? 340 : undefined, flex: activeConv ? undefined : 1, borderRight: activeConv ? '1px solid #e2e8f0' : 'none', display: 'flex', flexDirection: 'column', background: '#fff' }}>
 <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0' }}>
 <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 10 }}>Inbox</div>

 {/* Channel dropdown */}
 <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
 <select value={channel} onChange={e => { const v = e.target.value; setChannel(v); if (v !== 'all' && v !== 'website') setFolder('all') }}
 style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600, background: '#fff', outline: 'none', cursor: 'pointer' }}>
 <option value="all">All Channels</option>
 {CHANNELS.filter(c => c !== 'all').map(ch => (
 <option key={ch} value={ch}>{CHANNEL_LABELS[ch] || ch}</option>
 ))}
 </select>
 {(channel === 'all' || channel === 'website') && (
 <select value={folder} onChange={e => setFolder(e.target.value)}
 style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600, background: '#fff', outline: 'none', cursor: 'pointer' }}>
 {FOLDERS.map(f => (
 <option key={f} value={f}>{FOLDER_LABELS[f]}</option>
 ))}
 </select>
 )}
 </div>
 </div>

 <div style={{ flex: 1, overflowY: 'auto' }}>
 {filtered.length === 0 && (
 <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No messages yet.</div>
 )}
 {filtered.map(c => (
 <div key={c.id} onClick={() => setActiveConv(c)}
 style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: activeConv?.id === c.id ? '#f0f7ff' : '#fff' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
 <div style={{ fontWeight: 800, fontSize: 13 }}>{c.channel === 'email' && c.subject ? c.subject : (c.customer_name || 'Unknown')}</div>
 <div style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 8, background: CHANNEL_COLORS[c.channel] || '#64748b', color: '#fff' }}>
 {CHANNEL_LABELS[c.channel] || c.channel}
 </div>
 </div>
 {c.channel === 'email' && c.customer_name && (
 <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 2 }}>{c.customer_name}</div>
 )}
 {c.folder && c.folder !== 'inquiries' && (
 <div style={{ fontSize: 10, color: '#c9a96e', fontWeight: 700, marginBottom: 2 }}>
 {FOLDER_ICONS[c.folder]} {FOLDER_LABELS[c.folder]}
 </div>
 )}
 <div style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.last_message || '—'}</div>
 <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
 {c.last_message_at ? new Date(c.last_message_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
 </div>
 </div>
 ))}
 </div>
 </div>

 {/* Conversation pane */}
 {activeConv && (
 <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
 <>
 <div style={{ padding: '12px 20px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
 <div style={{ fontWeight: 900, fontSize: 15 }}>{activeConv.channel === 'email' && activeConv.subject ? activeConv.subject : activeConv.customer_name}</div>
 {activeConv.channel === 'email' && activeConv.customer_email
   ? <div style={{ fontSize: 12, color: '#64748b' }}>{activeConv.customer_name} &lt;{activeConv.customer_email}&gt;</div>
   : activeConv.customer_phone && <div style={{ fontSize: 12, color: '#64748b' }}>{activeConv.customer_phone}</div>
 }
 <div style={{ fontSize: 11, fontWeight: 800, padding: '2px 10px', borderRadius: 10, background: CHANNEL_COLORS[activeConv.channel] || '#64748b', color: '#fff' }}>
 {CHANNEL_LABELS[activeConv.channel] || activeConv.channel}
 </div>
 {/* Move folder button — only for website conversations */}
 {activeConv.channel === 'website' && (
 <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
 {FOLDERS.filter(f => f !== 'all' && f !== activeConv.folder).map(f => (
 <button key={f} onClick={() => moveFolder(activeConv.id, f)}
 style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>
 Move to {FOLDER_LABELS[f]}
 </button>
 ))}
 </div>
 )}
 </div>

 <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
 {messages.map(m => (
 <div key={m.id} style={{ display: 'flex', justifyContent: m.sender_type === 'staff' ? 'flex-end' : 'flex-start' }}>
 <div style={{
 maxWidth: '70%', padding: '10px 14px', borderRadius: 14,
 background: m.sender_type === 'staff' ? '#0f172a' : '#fff',
 color: m.sender_type === 'staff' ? '#fff' : '#0f172a',
 fontSize: 13, boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
 borderBottomRightRadius: m.sender_type === 'staff' ? 4 : 14,
 borderBottomLeftRadius: m.sender_type === 'staff' ? 14 : 4,
 }}>
 {(() => {
 const text = m.body || m.content || m.text || ''
 if (text.startsWith('[Photo] ')) return (
   <a href={text.replace('[Photo] ', '')} target="_blank" rel="noreferrer"
   style={{ color: m.sender_type === 'staff' ? '#c9a96e' : '#0068ff', fontSize: 13 }}>
   View attached photo
   </a>
 )
 return text
 })()}
 <div style={{ fontSize: 10, opacity: 0.5, marginTop: 4, textAlign: m.sender_type === 'staff' ? 'right' : 'left' }}>
 {new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
 </div>
 </div>
 </div>
 ))}
 <div ref={bottomRef} />
 </div>

 <div style={{ padding: 16, background: '#fff', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 10 }}>
 <input
 style={{ flex: 1, padding: '11px 14px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
 placeholder="Type a reply..." value={reply}
 onChange={e => setReply(e.target.value)}
 onKeyDown={e => e.key === 'Enter' && sendReply()} />
 <button onClick={sendReply} disabled={loading}
 style={{ padding: '11px 20px', borderRadius: 12, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 13 }}>
 Send
 </button>
 </div>
 </>
 </div>
 )}
 </div>
 )
}

// Client Detail View
function ClientDetail({ client, loading, onBack }) {
 const [editName,  setEditName]  = useState(client?.full_name || '')
 const [editPhone, setEditPhone] = useState(client?.phone     || '')
 const [editEmail, setEditEmail] = useState(client?.email     || '')
 const [difficult, setDifficult] = useState(client?.difficult_client || false)
 const [stars, setStars]         = useState(client?.stars_earned || 0)
 const [cycles, setCycles]       = useState(client?.loyalty_cycles_completed || 0)
 const [discountActive, setDiscountActive] = useState(client?.loyalty_discount_active || false)
 const [saving, setSaving]       = useState(false)

 // Track committed baseline so dirty detection works after save without re-fetch
 const [base, setBase] = useState({
   full_name: client?.full_name || '', phone: client?.phone || '', email: client?.email || '',
   difficult_client: client?.difficult_client || false, stars_earned: client?.stars_earned || 0,
   loyalty_cycles_completed: client?.loyalty_cycles_completed || 0,
   loyalty_discount_active: client?.loyalty_discount_active || false,
 })

 useEffect(() => {
   const b = {
     full_name: client?.full_name || '', phone: client?.phone || '', email: client?.email || '',
     difficult_client: client?.difficult_client || false, stars_earned: client?.stars_earned || 0,
     loyalty_cycles_completed: client?.loyalty_cycles_completed || 0,
     loyalty_discount_active: client?.loyalty_discount_active || false,
   }
   setBase(b)
   setEditName(b.full_name); setEditPhone(b.phone); setEditEmail(b.email)
   setDifficult(b.difficult_client); setStars(b.stars_earned)
   setCycles(b.loyalty_cycles_completed); setDiscountActive(b.loyalty_discount_active)
 }, [client])

 const dirty =
   editName  !== base.full_name        ||
   editPhone !== base.phone            ||
   editEmail !== base.email            ||
   difficult !== base.difficult_client ||
   stars     !== base.stars_earned

 function clickStar(n) {
   let newStars = n, newCycles = cycles, newDiscount = discountActive
   if (n === 5) { newStars = 0; newCycles = cycles + 1; newDiscount = true }
   setStars(newStars); setCycles(newCycles); setDiscountActive(newDiscount)
 }

 function toggleDifficult() {
   setDifficult(d => !d)
 }

 async function handleSave() {
   setSaving(true)
   const putPayload   = { full_name: editName, phone: editPhone, email: editEmail }
   const patchPayload = {
     difficult_client:          difficult,
     stars_earned:              stars,
     loyalty_cycles_completed:  cycles,
     loyalty_discount_active:   discountActive,
   }
   console.log('[ClientDetail] PUT payload →',   putPayload)
   console.log('[ClientDetail] PATCH payload →', patchPayload)
   try {
     const [putRes, patchRes] = await Promise.all([
       axios.put(API + '/api/customers/' + client.id, putPayload),
       axios.patch(API + '/api/customers/' + client.id, patchPayload),
     ])
     console.log('[ClientDetail] PUT response ✓',   putRes.data)
     console.log('[ClientDetail] PATCH response ✓', patchRes.data)
     setBase({
       full_name: editName, phone: editPhone, email: editEmail,
       difficult_client: difficult, stars_earned: stars,
       loyalty_cycles_completed: cycles, loyalty_discount_active: discountActive,
     })
   } catch (err) {
     const detail = err?.response?.data?.error || err?.response?.data || err.message
     console.error('[ClientDetail] save FAILED — status:', err?.response?.status, 'detail:', detail)
     alert('Save failed: ' + detail)
   }
   setSaving(false)
 }

 const fieldInput = (value, onChange, placeholder, style) => (
   <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
     style={{ border:'none', borderBottom:'1px dashed #cbd5e1', outline:'none', background:'transparent',
       padding:'0 0 2px', fontFamily:'inherit', cursor:'text', ...style }} />
 )

 if (loading || !client.bookings) {
   return (
   <div style={{ padding:24, flex:1, overflowY:'auto' }}>
   <button onClick={onBack} style={{ background:'none', border:'none', color:'#64748b', fontWeight:700, fontSize:14, cursor:'pointer', marginBottom:16, padding:0 }}>← Back to Clients</button>
   <div style={{ color:'#94a3b8', fontSize:14 }}>Loading...</div>
   </div>
   )
 }
 const stats = [
 { label:'Total Visits', value: client.total_visits || 0 },
 { label:'Total Spend', value: client.total_spend > 0 ? `£${(client.total_spend||0).toFixed(2)}` : '—' },
 { label:'Last Visit', value: client.last_visit ? new Date(client.last_visit).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—' },
 { label:'Member Since', value: new Date(client.created_at).toLocaleDateString('en-GB', { month:'short', year:'numeric' }) },
 ]
 return (
 <div style={{ padding:24, flex:1, overflowY:'auto' }}>
 <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
   <button onClick={onBack} style={{ background:'none', border:'none', color:'#64748b', fontWeight:700, fontSize:14, cursor:'pointer', padding:0 }}>← Back to Clients</button>
   <button onClick={handleSave} disabled={!dirty || saving}
     style={{ background: dirty ? '#0f172a' : '#e2e8f0', color: dirty ? '#fff' : '#94a3b8',
       border:'none', borderRadius:8, padding:'7px 18px', fontSize:13, fontWeight:700,
       cursor: (!dirty || saving) ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
     {saving ? 'Saving…' : 'Save'}
   </button>
 </div>
 <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:24 }}>
 <div style={{ width:52, height:52, borderRadius:'50%', background:'#0f172a', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:900, flexShrink:0 }}>
 {editName?.[0]?.toUpperCase() || '?'}
 </div>
 <div style={{ flex:1, minWidth:0 }}>
   <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
     {fieldInput(editName, setEditName, 'Client name', { fontSize:22, fontWeight:900, color:'#0f172a', width:'100%' })}
     <button onClick={toggleDifficult} title={difficult ? 'Remove difficult flag' : 'Flag as difficult client'}
       style={{ background:'none', border:'none', cursor:'pointer', padding:3, display:'flex', alignItems:'center', flexShrink:0 }}>
       <FlagIcon active={difficult} size={16} />
     </button>
   </div>
   <div style={{ display:'flex', alignItems:'center', gap:8 }}>
     {fieldInput(editPhone, setEditPhone, 'Phone', { fontSize:13, color:'#64748b' })}
     <span style={{ color:'#cbd5e1', fontSize:13 }}>·</span>
     {fieldInput(editEmail, setEditEmail, 'Email', { fontSize:13, color:'#64748b', flex:1 })}
   </div>
 </div>
 </div>

 {/* Loyalty Stars */}
 <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', padding:'16px 20px', marginBottom:20 }}>
   <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
     <div style={{ fontSize:13, fontWeight:800, color:'#0f172a' }}>Loyalty</div>
     <div style={{ fontSize:12, color:'#64748b' }}>{cycles} {cycles === 1 ? 'cycle' : 'cycles'} completed</div>
   </div>
   <div style={{ display:'flex', alignItems:'center', gap:10 }}>
     <div style={{ display:'flex', gap:6 }}>
       {[1,2,3,4,5].map(n => (
         <button key={n} onClick={() => clickStar(n)}
           style={{ background:'none', border:'none', cursor:'pointer', padding:2, fontSize:22, lineHeight:1, color: n <= stars ? '#f59e0b' : '#d1d5db' }}>
           {n <= stars ? '★' : '☆'}
         </button>
       ))}
     </div>
     {discountActive && (
       <div style={{ marginLeft:8, padding:'3px 10px', background:'#fef3c7', border:'1px solid #fde68a', borderRadius:20, fontSize:11, fontWeight:800, color:'#92400e' }}>
         Discount unlocked!
       </div>
     )}
   </div>
   {discountActive && (
     <div style={{ marginTop:8, fontSize:12, color:'#059669', fontWeight:600 }}>
       Loyalty discount will apply automatically at their next checkout.
     </div>
   )}
 </div>

 <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:28 }}>
 {stats.map(s => (
 <div key={s.label} style={{ background:'#fff', borderRadius:12, padding:'16px 18px', border:'1px solid #e2e8f0' }}>
 <div style={{ fontSize:11, fontWeight:800, color:'#64748b', textTransform:'uppercase', letterSpacing:0.8, marginBottom:6 }}>{s.label}</div>
 <div style={{ fontSize:22, fontWeight:900, color:'#0f172a' }}>{s.value}</div>
 </div>
 ))}
 </div>
 <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:20 }}>
 <div>
 <div style={{ fontSize:13, fontWeight:800, color:'#0f172a', marginBottom:12 }}>Booking History</div>
 <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', overflow:'hidden' }}>
 <table style={{ width:'100%', borderCollapse:'collapse' }}>
 <thead>
 <tr style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
 {['Date','Service','Technician','Status','Paid'].map(h => (
 <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:800, color:'#64748b', textTransform:'uppercase', letterSpacing:0.8 }}>{h}</th>
 ))}
 </tr>
 </thead>
 <tbody>
 {(client.bookings||[]).map((b,i) => {
 const co = Array.isArray(b.checkouts) ? b.checkouts[0] : b.checkouts
 return (
 <tr key={b.id} style={{ borderBottom: i < client.bookings.length-1 ? '1px solid #f1f5f9' : 'none' }}>
 <td style={{ padding:'11px 14px', fontSize:13, color:'#475569' }}>
 {new Date(b.start_time).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' })}
 </td>
 <td style={{ padding:'11px 14px', fontSize:13, fontWeight:600 }}>{b.services?.name||'—'}</td>
 <td style={{ padding:'11px 14px', fontSize:13, color:'#475569' }}>{b.technicians?.name||'—'}</td>
 <td style={{ padding:'11px 14px' }}>
 <span style={{ fontSize:11, fontWeight:800, padding:'3px 8px', borderRadius:6,
 background: b.status==='completed' ? '#f0fdf4' : '#fef9c3',
 color: b.status==='completed' ? '#059669' : '#854d0e' }}>{b.status}</span>
 </td>
 <td style={{ padding:'11px 14px', fontSize:13, fontWeight:700, color: co?.total_amount ? '#059669' : '#94a3b8' }}>
 {co?.total_amount ? `£${parseFloat(co.total_amount).toFixed(2)}` : '—'}
 </td>
 </tr>
 )
 })}
 {!client.bookings?.length && (
 <tr><td colSpan={5} style={{ padding:'32px 14px', textAlign:'center', color:'#94a3b8', fontSize:13 }}>No bookings yet.</td></tr>
 )}
 </tbody>
 </table>
 </div>
 </div>
 <div>
 <div style={{ fontSize:13, fontWeight:800, color:'#0f172a', marginBottom:12 }}>Favourite Services</div>
 <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', padding:16 }}>
 {(client.top_services||[]).length > 0 ? client.top_services.map((s,i) => (
 <div key={s.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom: i < client.top_services.length-1 ? '1px solid #f1f5f9' : 'none' }}>
 <span style={{ fontSize:13, fontWeight:600 }}>{s.name}</span>
 <span style={{ fontSize:12, color:'#64748b', fontWeight:700 }}>{s.count}×</span>
 </div>
 )) : (
 <div style={{ color:'#94a3b8', fontSize:13, textAlign:'center', padding:'20px 0' }}>No services yet.</div>
 )}
 </div>
 </div>
 </div>
 </div>
 )
}

// Clients List View
function ClientsView() {
 const [clients, setClients] = useState([])
 const [search, setSearch] = useState('')
 const [loading, setLoading] = useState(true)
 const [selected, setSelected] = useState(null)
 const [detail, setDetail] = useState(null)
 const [detailLoading, setDetailLoading] = useState(false)

 useEffect(() => { loadClients() }, [search])

 async function loadClients() {
 setLoading(true)
 try {
 const params = search ? `?search=${encodeURIComponent(search)}` : ''
 const res = await axios.get(API + '/api/customers' + params)
 setClients(res.data)
 } catch (err) { console.error(err) }
 setLoading(false)
 }

 async function openDetail(client) {
 setSelected(client)
 setDetailLoading(true)
 try {
 const res = await axios.get(API + '/api/customers/' + client.id)
 setDetail(res.data)
 } catch (err) { console.error(err) }
 setDetailLoading(false)
 }

 if (selected) {
 return <ClientDetail client={detail || selected} loading={detailLoading} onBack={() => { setSelected(null); setDetail(null) }} />
 }

 return (
 <div style={{ padding:24, flex:1, overflowY:'auto' }}>
 <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
 <h1 style={{ fontSize:20, fontWeight:900, color:'#0f172a', margin:0 }}>Clients</h1>
 <input style={{ ...inp, width:280 }} placeholder="Search name, phone or email…"
 value={search} onChange={e => setSearch(e.target.value)} />
 </div>
 {loading ? (
 <div style={{ color:'#94a3b8', fontSize:14 }}>Loading…</div>
 ) : (
 <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', overflow:'hidden' }}>
 <table style={{ width:'100%', borderCollapse:'collapse' }}>
 <thead>
 <tr style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
 {['Name','Phone','Email','Visits','Last Visit','Total Spend','Flag'].map(h => (
 <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, fontWeight:800, color:'#64748b', textTransform:'uppercase', letterSpacing:0.8 }}>{h}</th>
 ))}
 </tr>
 </thead>
 <tbody>
 {clients.map((c,i) => (
 <tr key={c.id} onClick={() => openDetail(c)}
 style={{ borderBottom: i < clients.length-1 ? '1px solid #f1f5f9' : 'none', cursor:'pointer', background:'#fff' }}
 onMouseEnter={e => e.currentTarget.style.background='#f8fafc'}
 onMouseLeave={e => e.currentTarget.style.background='#fff'}>
 <td style={{ padding:'12px 16px', fontWeight:700, fontSize:14, color:'#0f172a' }}>{c.full_name}</td>
 <td style={{ padding:'12px 16px', fontSize:13, color:'#475569' }}>{c.phone||'—'}</td>
 <td style={{ padding:'12px 16px', fontSize:13, color:'#475569' }}>{c.email||'—'}</td>
 <td style={{ padding:'12px 16px', fontSize:13, fontWeight:700, color:'#0f172a' }}>{c.total_visits}</td>
 <td style={{ padding:'12px 16px', fontSize:13, color:'#475569' }}>
 {c.last_visit ? new Date(c.last_visit).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—'}
 </td>
 <td style={{ padding:'12px 16px', fontSize:13, fontWeight:700, color:'#059669' }}>
 {c.total_spend > 0 ? `£${c.total_spend.toFixed(2)}` : '—'}
 </td>
 <td style={{ padding:'12px 16px' }} onClick={e => e.stopPropagation()}>
 <button
   title={c.difficult_client ? 'Remove difficult flag' : 'Flag as difficult client'}
   onClick={async () => {
     const newVal = !c.difficult_client
     setClients(prev => prev.map(x => x.id === c.id ? { ...x, difficult_client: newVal } : x))
     await axios.patch(API + '/api/customers/' + c.id, { difficult_client: newVal }).catch(() => {})
   }}
   style={{ background:'none', border:'none', cursor:'pointer', padding:4, display:'flex', alignItems:'center' }}
 >
   <FlagIcon active={c.difficult_client || false} size={14} />
 </button>
 </td>
 </tr>
 ))}
 {clients.length === 0 && (
 <tr><td colSpan={6} style={{ padding:'40px 16px', textAlign:'center', color:'#94a3b8', fontSize:14 }}>
 {search ? 'No clients found matching your search.' : 'No clients yet.'}
 </td></tr>
 )}
 </tbody>
 </table>
 </div>
 )}
 </div>
 )
}

// Login Page
function LoginPage({ onLogin }) {
 const [email, setEmail] = useState('')
 const [password, setPassword] = useState('')
 const [error, setError] = useState('')
 const [loading, setLoading] = useState(false)

 async function handleSubmit(e) {
   e.preventDefault()
   setError('')
   setLoading(true)
   try {
     const { data } = await axios.post(API + '/api/auth/login', { email, password })
     onLogin(data.session.access_token, data.salon)
   } catch (err) {
     setError(err.response?.data?.error || 'Login failed. Check your email and password.')
   }
   setLoading(false)
 }

 return (
   <div style={{ minHeight:'100vh', width:'100vw', display:'flex', alignItems:'center', justifyContent:'center', background:'#f8f8fc', fontFamily:'ui-sans-serif, system-ui, sans-serif', margin:0, padding:0 }}>
     <div style={{ background:'#fff', borderRadius:20, padding:40, width:380, boxShadow:'0 20px 60px rgba(0,0,0,0.12)' }}>
       <div style={{ marginBottom:28, textAlign:'center' }}>
         <img src={orbitLogo} alt="Orbit" style={{ width:40, height:40, objectFit:'contain', marginBottom:12 }} />
         <div style={{ fontSize:26, fontWeight:800, color:'#0f172a', fontFamily:"'Neue Montreal', ui-sans-serif, system-ui, sans-serif" }}>Orbit Calendar</div>
         <div style={{ fontSize:13, color:'#64748b', marginTop:4, fontWeight:600 }}>Sign in to your salon</div>
       </div>
       <form onSubmit={handleSubmit}>
         <label style={lbl}>Email</label>
         <input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
         <label style={lbl}>Password</label>
         <input style={inp} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
         {error && <div style={{ marginTop:12, padding:'9px 12px', background:'#fef2f2', borderRadius:8, color:'#ef4444', fontSize:13, fontWeight:600 }}>{error}</div>}
         <button type="submit" disabled={loading} style={{ ...btnPrimary, width:'100%', marginTop:20, opacity: loading ? 0.7 : 1 }}>
           {loading ? 'Signing in…' : 'Sign In'}
         </button>
       </form>
       <div style={{ marginTop:16, textAlign:'center', fontSize:13, color:'#64748b' }}>
         No account? <button onClick={() => onLogin(null, null, 'signup')} style={{ background:'none', border:'none', color:'#3b82f6', fontWeight:700, cursor:'pointer', fontSize:13, padding:0 }}>Create one</button>
       </div>
     </div>
   </div>
 )
}

// Signup Page
function SignupPage({ onLogin, onBack }) {
 const [form, setForm] = useState({ email:'', password:'', confirm:'', salon_name:'', address:'', country:'UK' })
 const [error, setError] = useState('')
 const [loading, setLoading] = useState(false)

 async function handleSubmit(e) {
   e.preventDefault()
   setError('')
   if (form.password !== form.confirm) { setError('Passwords do not match.'); return }
   if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return }
   setLoading(true)
   try {
     const { data } = await axios.post(API + '/api/auth/signup', {
       email: form.email, password: form.password,
       salon_name: form.salon_name, address: form.address, country: form.country
     })
     if (data.session) {
       onLogin(data.session.access_token, data.salon)
     } else {
       setError('Account created! Please check your email to confirm before signing in.')
     }
   } catch (err) {
     setError(err.response?.data?.error || 'Signup failed.')
   }
   setLoading(false)
 }

 const f = (field) => ({ value: form[field], onChange: e => setForm({ ...form, [field]: e.target.value }) })

 return (
   <div style={{ minHeight:'100vh', background:'#f8fafc', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'ui-sans-serif, system-ui, sans-serif' }}>
     <div style={{ background:'#fff', borderRadius:20, padding:40, width:420, boxShadow:'0 20px 60px rgba(0,0,0,0.12)', maxHeight:'95vh', overflowY:'auto' }}>
       <div style={{ marginBottom:24, textAlign:'center' }}>
         <div style={{ fontSize:26, fontWeight:800, color:'#0f172a', fontFamily:"'Neue Montreal', ui-sans-serif, system-ui, sans-serif" }}>Orbit Calendar</div>
         <div style={{ fontSize:13, color:'#64748b', marginTop:4, fontWeight:600 }}>Create your salon account</div>
       </div>
       <form onSubmit={handleSubmit}>
         <label style={lbl}>Email</label>
         <input style={inp} type="email" {...f('email')} placeholder="you@example.com" required />
         <label style={lbl}>Password</label>
         <input style={inp} type="password" {...f('password')} placeholder="Min. 6 characters" required />
         <label style={lbl}>Confirm Password</label>
         <input style={inp} type="password" {...f('confirm')} placeholder="Repeat password" required />
         <label style={lbl}>Salon Name</label>
         <input style={inp} {...f('salon_name')} placeholder="e.g. Orbit Nails" required />
         <label style={lbl}>Address (optional)</label>
         <input style={inp} {...f('address')} placeholder="e.g. 123 High Street, London" />
         <label style={lbl}>Country</label>
         <select style={inp} {...f('country')}>
           <option value="UK">United Kingdom</option>
           <option value="Vietnam">Vietnam</option>
         </select>
         {error && <div style={{ marginTop:12, padding:'9px 12px', background:'#fef2f2', borderRadius:8, color:'#ef4444', fontSize:13, fontWeight:600 }}>{error}</div>}
         <button type="submit" disabled={loading} style={{ ...btnPrimary, width:'100%', marginTop:20, opacity: loading ? 0.7 : 1 }}>
           {loading ? 'Creating account…' : 'Create Account'}
         </button>
       </form>
       <div style={{ marginTop:16, textAlign:'center', fontSize:13, color:'#64748b' }}>
         Already have an account? <button onClick={onBack} style={{ background:'none', border:'none', color:'#3b82f6', fontWeight:700, cursor:'pointer', fontSize:13, padding:0 }}>Sign in</button>
       </div>
     </div>
   </div>
 )
}

// Main App (authenticated)
function MainApp({ salon, onLogout }) {
 const calRef = useRef(null)
 const bubbleClickRef = useRef(false) // prevents dateClick from navigating when bubble is clicked

 const [bookings, setBookings] = useState([])
 const [technicians, setTechnicians] = useState([])
 const [services, setServices] = useState([])
 const [view, setView] = useState('calendar')
 const [showBooking, setShowBooking] = useState(false)
 const [editingId, setEditingId] = useState(null)
 const [showTechMgr, setShowTechMgr] = useState(false)
 const [showSvcMgr, setShowSvcMgr] = useState(false)
 const [showCapMgr, setShowCapMgr] = useState(false)
 const [showHours, setShowHours] = useState(false)
 const [capTech, setCapTech] = useState(null)
 const [capSelected, setCapSelected] = useState(new Set())
 const [techCaps, setTechCaps] = useState({})
 const [newTechName, setNewTechName] = useState('')
 const [newSvc, setNewSvc] = useState({ name:'', duration_minutes:60, price:'', category:'Nail Enhancements' })
 const [showCheckout, setShowCheckout] = useState(false)
 const [checkoutBooking, setCheckoutBooking] = useState(null)
 const [checkoutReceiptData, setCheckoutReceiptData] = useState(null)
 const [checkoutLoyaltyDiscount, setCheckoutLoyaltyDiscount] = useState(0)
 const [openingHours, setOpeningHours] = useState(DEFAULT_HOURS)
 const [hoursLoaded, setHoursLoaded] = useState(false)
 const [svcSearch, setSvcSearch] = useState('')
 const [techNotes, setTechNotes] = useState({})
 const [calDate, setCalDate] = useState(() => new Date().toISOString().slice(0, 10))
 const [openBubbleDate, setOpenBubbleDate] = useState(null)
 const [bubblePos, setBubblePos] = useState(null)
 const [calView, setCalView] = useState('resourceTimeGridDay')
 const [phoneMatches, setPhoneMatches] = useState([])
 const [clientNotes, setClientNotes] = useState('')
 const [clientDifficult, setClientDifficult] = useState(false)

 const emptyForm = { full_name:'', phone:'', email:'', technician_id:'', service_ids:[], start_time:'', notes:'' }
 const [form, setForm] = useState(emptyForm)

 useEffect(() => { loadAll() }, [])

 async function loadAll() {
 try {
 const [b, t, s] = await Promise.all([
 axios.get(API + '/api/bookings'),
 axios.get(API + '/api/technicians'),
 axios.get(API + '/api/services'),
 ])
 setBookings(b.data)
 setTechnicians(t.data)
 // Deduplicate services by name
 const seen = new Set()
 setServices(s.data.filter(svc => { if (seen.has(svc.name)) return false; seen.add(svc.name); return true }))
 } catch (err) { console.error('Load error:', err) }
 // Load opening hours from backend
 try {
 const h = await axios.get(API + '/api/settings/opening_hours')
 if (h.data?.value) { setOpeningHours(JSON.parse(h.data.value)); setHoursLoaded(true) }
 } catch (_) { setHoursLoaded(true) }
 }

 // Auto-refresh bookings every 15 minutes
 useEffect(() => {
 const interval = setInterval(() => {
 axios.get(API + '/api/bookings').then(r => setBookings(r.data)).catch(() => {})
 }, 15 * 60 * 1000)
 return () => clearInterval(interval)
 }, [])

 // Load technician daily notes when date or technician list changes
 useEffect(() => {
 if (!technicians.length || !calDate) return
 Promise.all(
   technicians.map(t =>
     axios.get(API + `/api/settings/tech_note_${t.id}_${calDate}`).catch(() => ({ data: null }))
   )
 ).then(results => {
   const loaded = {}
   results.forEach((r, i) => {
     loaded[`${technicians[i].id}_${calDate}`] = r.data?.value ?? ''
   })
   setTechNotes(prev => ({ ...prev, ...loaded }))
 })
 }, [calDate, technicians])

 async function saveTechNote(techId, date, value) {
 setTechNotes(prev => ({ ...prev, [`${techId}_${date}`]: value }))
 try {
   await axios.post(API + `/api/settings/tech_note_${techId}_${date}`, { value })
 } catch (err) {
   console.error('Tech note save failed:', err.response?.data || err.message)
 }
 }

 // Close month bubble dropdown when clicking outside
 useEffect(() => {
 if (!openBubbleDate) return
 function close() { setOpenBubbleDate(null); setBubblePos(null) }
 document.addEventListener('click', close)
 return () => document.removeEventListener('click', close)
 }, [openBubbleDate])

 // Calendar resources & events — memoized so FullCalendar doesn't re-process on unrelated renders
 const resources = useMemo(() => technicians.map(t => ({ id: t.id, title: t.name })), [technicians])

 const closedDayNames = useMemo(() => openingHours.filter(h => !h.open).map(h => {
   const idx = DAYS.indexOf(h.day)
   return (idx + 1) % 7
 }), [openingHours])

 const events = useMemo(() => bookings.map(b => {
 const isCompleted = b.status === 'completed'
 const isVisualiser = b.source === 'visualiser'
 let color
 if (isCompleted) color = '#D1D5DB'
 else if (isVisualiser) color = '#1e3a8a'
 else if (b.services?.category === 'Service Add On' && Array.isArray(b.service_ids) && b.service_ids.length > 1) {
   const primary = b.service_ids.map(id => services.find(s => s.id === id)).find(s => s && s.category !== 'Service Add On')
   color = primary ? (primary.color || CATEGORY_COLOR[primary.category] || '#94a3b8') : CATEGORY_COLOR['Service Add On'] || '#fde68a'
 } else {
   color = b.services?.color || CATEGORY_COLOR[b.services?.category] || '#94a3b8'
 }

 let title = (b.customers?.full_name || 'Guest') + ' · ' + (b.services?.name || '')
 if (isVisualiser && b.ai_prediction) title = (b.customers?.full_name || 'Guest') + ' · ' + b.ai_prediction

 return {
 id: b.id,
 resourceId: b.technician_id,
 title,
 start: b.start_time,
 end: b.end_time,
 backgroundColor: color,
 borderColor: color,
 textColor: isVisualiser ? '#fff' : '#1e293b',
 editable: !isCompleted,
 extendedProps: b,
 }
 }), [bookings, services])

 // Opening hours → slot range (slotMax extends 1 hr past closing for staff overflow)
 const { slotMin, slotMax } = useMemo(() => {
   const openDays = openingHours.filter(h => h.open)
   const earliestOpen = openDays.length ? openDays.reduce((a, b) => a.from < b.from ? a : b).from : '09:00'
   const latestClose  = openDays.length ? openDays.reduce((a, b) => a.to > b.to ? a : b).to : '20:00'
   const slotMin = earliestOpen + ':00'
   const [closeH, closeM] = latestClose.split(':').map(Number)
   const overflowH = closeH + 1
   const slotMax = String(overflowH).padStart(2, '0') + ':' + String(closeM).padStart(2, '0') + ':00'
   return { slotMin, slotMax }
 }, [openingHours])

 const calendarCss = useMemo(() => `
.fc .fc-day-today { background: #fff !important; }
.fc .fc-timegrid-col.fc-day-today { background: #fff !important; }
.fc .fc-daygrid-day.fc-day-today { background: #fff !important; }
.fc .fc-timegrid-slot { height: 60px !important; }
.fc { font-family: ui-sans-serif, system-ui, sans-serif !important; }
.fc .fc-toolbar-title { font-size: 18px; font-weight: 800; }
.fc .fc-button { background: #0f172a !important; border-color: #0f172a !important; font-weight: 700 !important; border-radius: 8px !important; }
.fc .fc-button:hover { background: #1e293b !important; }
.fc .fc-button-active { background: #334155 !important; border-color: #334155 !important; }
.fc-event { border-radius: 6px !important; font-size: 12px !important; font-weight: 700 !important; }
.fc .fc-col-header-cell { font-weight: 800; font-size: 13px; padding: 6px 0; }
.fc .fc-timegrid-slot-label { font-size: 11px; color: #94a3b8; }
.fc .fc-daygrid-day-number { font-weight: 700; }
.fc .fc-daygrid-day-events { display: none !important; }
.fc .fc-daygrid-day-top { flex-direction: row; }
${closedDayNames.map(d => `.fc .fc-day[data-dow="${d}"] { background: #f1f5f9 !important; opacity: 0.6; }`).join('\n')}
`, [closedDayNames])

 // Date / slot click handlers — wrapped in useCallback so FullCalendar gets stable references
 const handleDateClick = useCallback((info) => {
 // Bubble button sets this flag so its click doesn't also trigger navigation
 if (bubbleClickRef.current) { bubbleClickRef.current = false; return }
 const api = calRef.current?.getApi()
 if (api?.view.type === 'dayGridMonth') {
   api.changeView('resourceTimeGridDay', info.dateStr)
 }
 }, [])

 const openCreate = useCallback((info) => {
 const api = calRef.current?.getApi()
 if (api?.view.type === 'dayGridMonth') return
 setEditingId(null)
 setSvcSearch('')
 setForm({ ...emptyForm, technician_id: info.resource?.id || '', start_time: info.startStr?.slice(0,16) || '' })
 setShowBooking(true)
 }, [emptyForm])

 async function openEdit(info) {
 const b = info.event.extendedProps
 const status = b.status || info.event.extendedProps?.status
 if (status === 'completed') {
 // Fetch receipt data BEFORE opening modal so it renders in receipt view immediately
 const fullBooking = bookings.find(bk => bk.id === info.event.id) || b
 let receiptData = null
 try {
 const res = await axios.get(API + '/api/checkouts/' + info.event.id)
 receiptData = res.data
 } catch (_) {}
 let loyaltyAmt = 0
 if (fullBooking.customers?.loyalty_discount_active && !receiptData) {
   try { const r = await axios.get(API + '/api/settings/loyalty_discount'); loyaltyAmt = parseFloat(r.data?.value || '0') || 0 } catch (_) {}
 }
 setCheckoutLoyaltyDiscount(loyaltyAmt)
 setCheckoutReceiptData(receiptData)
 setCheckoutBooking(fullBooking)
 setShowCheckout(true)
 return
 }
 setEditingId(info.event.id)
 setSvcSearch('')
 const rawIds = b.service_ids?.length ? b.service_ids : (b.service_id ? [b.service_id] : [])
 const existingIds = rawIds.filter(id => id && typeof id === 'string' && id.length > 0)
 setForm({
 full_name: b.customers?.full_name || '',
 phone: b.customers?.phone || '',
 email: b.customers?.email || '',
 technician_id: b.technician_id,
 service_ids: existingIds,
 start_time: b.start_time ? new Date(b.start_time).toLocaleString('sv-SE', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }).slice(0,16).replace(' ', 'T') : '',
 notes: b.notes || '',
 })
 setShowBooking(true)
 }

 // Open edit modal from a raw booking object (used by month view bubble)
 async function openEditFromBooking(bk) {
 setOpenBubbleDate(null)
 if (bk.status === 'completed') {
   let receiptData = null
   try { const r = await axios.get(API + '/api/checkouts/' + bk.id); receiptData = r.data } catch (_) {}
   let loyaltyAmt = 0
   if (bk.customers?.loyalty_discount_active && !receiptData) {
     try { const r = await axios.get(API + '/api/settings/loyalty_discount'); loyaltyAmt = parseFloat(r.data?.value || '0') || 0 } catch (_) {}
   }
   setCheckoutLoyaltyDiscount(loyaltyAmt)
   setCheckoutReceiptData(receiptData)
   setCheckoutBooking(bk)
   setShowCheckout(true)
   return
 }
 setEditingId(bk.id)
 setSvcSearch('')
 const rawIds = bk.service_ids?.length ? bk.service_ids : (bk.service_id ? [bk.service_id] : [])
 setForm({
   full_name: bk.customers?.full_name || '',
   phone: bk.customers?.phone || '',
   email: bk.customers?.email || '',
   technician_id: bk.technician_id,
   service_ids: rawIds.filter(id => id && typeof id === 'string'),
   start_time: bk.start_time ? new Date(bk.start_time).toLocaleString('sv-SE', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }).slice(0,16).replace(' ', 'T') : '',
   notes: bk.notes || '',
 })
 setShowBooking(true)
 }

 // Phone lookup — fires when phone field changes
 async function handlePhoneChange(value) {
 setForm(f => ({ ...f, phone: value }))
 if (value.replace(/\D/g, '').length < 3) { setPhoneMatches([]); return }
 try {
   const { data } = await axios.get(API + '/api/customers?search=' + encodeURIComponent(value))
   setPhoneMatches(Array.isArray(data) ? data.slice(0, 6) : [])
 } catch (_) { setPhoneMatches([]) }
 }

 // Select a customer from the phone dropdown
 async function selectCustomer(c) {
 setForm(f => ({ ...f, full_name: c.full_name, phone: c.phone, email: c.email || '' }))
 setPhoneMatches([])
 // Set difficult flag immediately from list data while full profile loads
 setClientDifficult(c.difficult_client || false)
 // Fetch full profile for client notes, authoritative difficult flag, and email
 try {
   const { data } = await axios.get(API + '/api/customers/' + c.id)
   setClientNotes(data?.client_notes || data?.notes || '')
   setClientDifficult(data?.difficult_client || false)
   if (data?.email) setForm(f => ({ ...f, email: data.email }))
 } catch (_) { setClientNotes('') }
 }

 // Save booking
 async function handleSave() {
 if (!form.full_name.trim()) { alert('Please enter the client name.'); return }
 if (!form.phone.trim()) { alert('Please enter a phone number.'); return }
 if (!form.technician_id) { alert('Please select a technician.'); return }
 if (!form.service_ids?.length) { alert('Please select at least one service.'); return }
 if (!form.start_time) { alert('Please set a start time.'); return }

 const selectedSvcs = (form.service_ids || []).map(id => services.find(s => s.id === id)).filter(Boolean)
 if (!selectedSvcs.length) { alert('Please select at least one service.'); return }

 const primarySvc = selectedSvcs[0]
 const color = primarySvc ? (primarySvc.color || CATEGORY_COLOR[primarySvc.category] || '#94a3b8') : '#94a3b8'
 const totalMins = Math.max(15, selectedSvcs.reduce((sum, s) => sum + (s.duration_minutes || 60), 0))
 const [datePart, timePart] = form.start_time.split('T')
 const [year, month, day] = datePart.split('-').map(Number)
 const [hours, minutes] = timePart.split(':').map(Number)
 const start = new Date(year, month - 1, day, hours, minutes)
 const end = new Date(start.getTime() + totalMins * 60000)
 const svcTitle = selectedSvcs.map(s => s.name).join(' + ')

 try {
 if (editingId) {
 // Optimistic update
 setBookings(prev => prev.map(b => b.id !== editingId ? b : {
 ...b,
 technician_id: form.technician_id,
 service_id: primarySvc?.id,
 service_ids: form.service_ids,
 start_time: start.toISOString(),
 end_time: end.toISOString(),
 notes: form.notes,
 customers: { ...b.customers, full_name: form.full_name, phone: form.phone, email: form.email },
 services: primarySvc ? { ...primarySvc, color, name: svcTitle } : b.services,
 }))
 setShowBooking(false)
 const booking = bookings.find(b => b.id === editingId)
 if (booking?.customer_id) {
 await axios.put(API + '/api/customers/' + booking.customer_id, {
 full_name: form.full_name, phone: form.phone, email: form.email || null
 })
 }
await axios.put(API + '/api/bookings/' + editingId, {
 technician_id: form.technician_id,
 service_id: primarySvc?.id,
 service_ids: form.service_ids,
 start_time: start.toISOString(),
 end_time: end.toISOString(),
 notes: form.notes,
 })
 } else {
 setShowBooking(false)
 const custRes = await axios.post(API + '/api/customers', {
 full_name: form.full_name, phone: form.phone, email: form.email || null
 })
 const bookRes = await axios.post(API + '/api/bookings', {
 customer_id: custRes.data.id,
 technician_id: form.technician_id,
 service_id: primarySvc?.id,
 service_ids: form.service_ids,
 start_time: start.toISOString(),
 end_time: end.toISOString(),
 notes: form.notes,
 source: 'manual',
 })
 setBookings(prev => [...prev, {
 ...bookRes.data,
 customers: { full_name: form.full_name, phone: form.phone, email: form.email },
 services: primarySvc ? { ...primarySvc, color, name: svcTitle } : null,
 }])
 }
 } catch (err) {
 console.error(err)
 alert(err.response?.data?.error || 'Something went wrong.')
 loadAll()
 }
 }

 async function handleCancel() {
 if (!window.confirm('Cancel this appointment?')) return
 setBookings(prev => prev.filter(b => b.id !== editingId))
 setShowBooking(false)
 await axios.delete(API + '/api/bookings/' + editingId)
 }

 async function handleNoShow() {
 if (!window.confirm('Mark this appointment as no show?')) return
 setBookings(prev => prev.map(b => b.id !== editingId ? b : { ...b, status: 'no_show' }))
 setShowBooking(false)
 await axios.put(API + '/api/bookings/' + editingId, { status: 'no_show' })
 }

 const handleDrop = useCallback(async (info) => {
 const id = info.event.id, start = info.event.startStr, end = info.event.endStr
 const techId = info.event.getResources()[0]?.id
 setBookings(prev => prev.map(b => b.id !== id ? b : { ...b, start_time: start, end_time: end, technician_id: techId }))
 await axios.put(API + '/api/bookings/' + id, { start_time: start, end_time: end, technician_id: techId })
 }, [])

 const handleResize = useCallback(async (info) => {
 const id = info.event.id, end = info.event.endStr
 setBookings(prev => prev.map(b => b.id !== id ? b : { ...b, end_time: end }))
 await axios.put(API + '/api/bookings/' + id, { end_time: end })
 }, [])

 // Technician CRUD 
 async function addTechnician() {
 if (!newTechName.trim()) return
 try {
 const { data } = await axios.post(API + '/api/technicians', { name: newTechName.trim(), display_order: technicians.length })
 setTechnicians(prev => [...prev, data])
 setNewTechName('')
 } catch (err) { alert(err.response?.data?.error || 'Could not add.') }
 }
 async function removeTechnician(id) {
 if (!window.confirm('Remove this technician? Their bookings will also be removed.')) return
 try {
 await axios.delete(API + '/api/technicians/' + id)
 setTechnicians(prev => prev.filter(t => t.id !== id))
 setBookings(prev => prev.filter(b => b.technician_id !== id))
 } catch (err) { alert(err.response?.data?.error || 'Could not remove.') }
 }

 // Service CRUD 
 async function addService() {
 if (!newSvc.name.trim() || !newSvc.price) { alert('Please enter name and price.'); return }
 try {
 const color = CATEGORY_COLOR[newSvc.category] || '#94a3b8'
 const { data } = await axios.post(API + '/api/services', { ...newSvc, color, price: parseFloat(newSvc.price) })
 setServices(prev => [...prev, data])
 setNewSvc({ name:'', duration_minutes:60, price:'', category:'Nail Enhancements' })
 } catch (err) { alert(err.response?.data?.error || 'Could not add.') }
 }
 async function removeService(id) {
 if (!window.confirm('Remove this service?')) return
 try {
 await axios.delete(API + '/api/services/' + id)
 setServices(prev => prev.filter(s => s.id !== id))
 } catch (err) { alert(err.response?.data?.error || 'Could not remove.') }
 }

 // Capabilities 
 function openCapMgr(tech) {
 setCapTech(tech)
 setCapSelected(new Set(techCaps[tech.id] || services.map(s => s.id)))
 setShowCapMgr(true)
 }
 function toggleCap(serviceId) {
 setCapSelected(prev => { const n = new Set(prev); n.has(serviceId) ? n.delete(serviceId) : n.add(serviceId); return n })
 }
 function saveCaps() {
 setTechCaps(prev => ({ ...prev, [capTech.id]: Array.from(capSelected) }))
 setShowCapMgr(false)
 }
 function servicesForTech(techId) {
 const caps = techCaps[techId]
 return caps ? services.filter(s => caps.includes(s.id)) : services
 }

 // Filtered services for booking modal 
 function filteredServices(techId) {
 const base = techId ? servicesForTech(techId) : services
 if (!svcSearch.trim()) return base
 return base.filter(s => s.name.toLowerCase().includes(svcSearch.toLowerCase()))
 }

 async function saveHours(newHours) {
 setOpeningHours(newHours)
 setShowHours(false)
 try { await axios.post(API + '/api/settings/opening_hours', { value: JSON.stringify(newHours) }) } catch (_) {}
 }

 const grouped = CATEGORIES.map(cat => ({ ...cat, items: services.filter(s => s.category === cat.label) })).filter(g => g.items.length > 0)

 return (
 <div style={{ display:'flex', height:'100vh', fontFamily:'ui-sans-serif, system-ui, sans-serif', background:'#ffffff', overflow:'hidden' }}>

 {/* Sidebar */}
 <div style={{ width:230, background:'#ffffff', color:'#0f172a', display:'flex', flexDirection:'column', flexShrink:0, borderRight:'1px solid #e2e8f0' }}>
 <div style={{ padding:'20px 20px 14px', display:'flex', alignItems:'center', gap:10 }}>
 <img src={orbitLogo} alt="Orbit" style={{ width:40, height:40, objectFit:'contain', flexShrink:0 }} />
 <div>
   <div style={{ fontSize:18, fontWeight:800, color:'#0f172a', fontFamily:"'Neue Montreal', ui-sans-serif, system-ui, sans-serif", letterSpacing:'-0.3px' }}>Orbit Calendar</div>
   <div style={{ fontSize:11, color:'#94a3b8', marginTop:1, fontWeight:600 }}>{salon?.name || ''}</div>
 </div>
 </div>

 {/* Nav */}
 <div style={{ padding:'0 10px', marginBottom:8 }}>
 {[
 { id:'calendar', icon:'', label:'Calendar' },
 { id:'clients', icon:'', label:'Clients' },
 { id:'inbox', icon:'', label:'Inbox' },
 { id:'analytics', icon:'', label:'Analytics' },
{ id:'giftcards', icon:'', label:'Gift Cards' },
{ id:'shop',      icon:'', label:'Shop' },
{ id:'widget',    icon:'', label:'Chat Widget' },
 ].map(n => (
 <button key={n.id} onClick={() => setView(n.id)}
 style={{ width:'100%', textAlign:'left', padding:'9px 12px', borderRadius:10, border:'none',
 background: view===n.id ? '#f1f5f9' : 'transparent',
 color: view===n.id ? '#0f172a' : '#64748b', fontWeight:700, fontSize:13,
 cursor:'pointer', display:'flex', alignItems:'center', gap:9, marginBottom:2 }}>
 <span>{n.icon}</span>{n.label}
 </button>
 ))}
 <button onClick={() => setShowHours(true)}
 style={{ width:'100%', textAlign:'left', padding:'9px 12px', borderRadius:10, border:'none',
 background:'transparent', color:'#64748b', fontWeight:700, fontSize:13,
 cursor:'pointer', display:'flex', alignItems:'center', gap:9, marginBottom:2 }}>
 <span></span>Opening Hours
 </button>
 </div>

 <div style={{ height:1, background:'#e2e8f0', margin:'4px 16px 12px' }} />

 <div style={{ padding:'0 20px', flex:1, overflowY:'auto' }}>
 {/* Technicians */}
 <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
 <div style={{ fontSize:10, color:'#94a3b8', fontWeight:800, textTransform:'uppercase', letterSpacing:1 }}>Technicians</div>
 <button onClick={() => setShowTechMgr(true)} style={{ fontSize:18, lineHeight:1, background:'none', border:'none', color:'#94a3b8', cursor:'pointer' }}>+</button>
 </div>
 {technicians.map(t => (
 <div key={t.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0' }}>
 <button onClick={() => openCapMgr(t)} style={{ background:'none', border:'none', color:'#0f172a', fontWeight:700, fontSize:13, cursor:'pointer', padding:0 }}>{t.name}</button>
 <button onClick={() => removeTechnician(t.id)} style={{ background:'none', border:'none', color:'#cbd5e1', cursor:'pointer', fontSize:12 }}></button>
 </div>
 ))}

 <div style={{ height:1, background:'#e2e8f0', margin:'14px 0' }} />

 {/* Services */}
 <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
 <div style={{ fontSize:10, color:'#94a3b8', fontWeight:800, textTransform:'uppercase', letterSpacing:1 }}>Services</div>
 <button onClick={() => setShowSvcMgr(true)} style={{ fontSize:18, lineHeight:1, background:'none', border:'none', color:'#94a3b8', cursor:'pointer' }}>+</button>
 </div>
 {grouped.map(g => (
 <div key={g.label} style={{ marginBottom:10 }}>
 <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
 <div style={{ width:8, height:8, borderRadius:2, background:g.color, flexShrink:0 }} />
 <span style={{ fontSize:10, color:'#94a3b8', fontWeight:800, textTransform:'uppercase', letterSpacing:0.5 }}>{g.label}</span>
 </div>
 {g.items.map(s => (
 <div key={s.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'3px 0 3px 14px' }}>
 <span style={{ fontSize:12, color:'#334155', fontWeight:600 }}>{s.name}</span>
 <button onClick={() => removeService(s.id)} style={{ background:'none', border:'none', color:'#cbd5e1', cursor:'pointer', fontSize:11 }}></button>
 </div>
 ))}
 </div>
 ))}
 </div>

 {/* Logout */}
 <div style={{ padding:'12px 10px 16px' }}>
   <button onClick={onLogout} style={{ width:'100%', textAlign:'left', padding:'9px 12px', borderRadius:10, border:'none', background:'transparent', color:'#94a3b8', fontWeight:700, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:9 }}>
     Sign Out
   </button>
 </div>
 </div>

 {/* Main content */}
 <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
 {view === 'calendar' && (
 <div style={{ flex:1, overflow:'auto', padding:24 }}>
 <style>{calendarCss}</style>
 <FullCalendar
 ref={calRef}
 plugins={[resourceTimeGridPlugin, dayGridPlugin, interactionPlugin]}
 initialView="resourceTimeGridDay"
 resources={resources}
 events={events}
 selectable={true}
 editable={true}
 select={openCreate}
 eventClick={openEdit}
 eventDrop={handleDrop}
 eventResize={handleResize}
 dateClick={handleDateClick}
 slotMinTime={slotMin}
 slotMaxTime={slotMax}
 slotDuration="00:30:00"
 snapDuration="00:05:00"
 allDaySlot={false}
 height="auto"
 headerToolbar={{ left:'prev,next today', center:'title', right:'resourceTimeGridDay,dayGridMonth' }}
 eventContent={(info) => {
   const bk = info.event.extendedProps
   const startTime = bk.start_time ? bk.start_time.split('+')[0].split('T')[1]?.slice(0, 5) : ''
   const endTime   = bk.end_time   ? bk.end_time.split('+')[0].split('T')[1]?.slice(0, 5)   : ''
   const name = bk.customers?.full_name || 'Guest'
   const svc  = bk.services?.name || ''
   const timeRange = startTime && endTime ? `${startTime} - ${endTime}` : startTime
   return (
     <div style={{ display:'flex', flexDirection:'column', justifyContent:'flex-start', alignItems:'flex-start', overflow:'hidden', height:'100%', padding:'2px 4px', fontSize:'inherit', lineHeight:1.3 }}>
       {timeRange && <span style={{ whiteSpace:'nowrap', fontWeight:600, fontSize:'0.85em' }}>{timeRange}</span>}
       <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', width:'100%' }}>{name}{svc ? ' · ' + svc : ''}</span>
     </div>
   )
 }}
 buttonText={{ today:'Today', resourceTimeGridDay:'Day', dayGridMonth:'Month' }}
 datesSet={(info) => {
   setCalView(info.view.type)
   if (info.view.type === 'resourceTimeGridDay') {
     setCalDate(info.startStr.slice(0, 10))
   }
 }}
 dayCellContent={(arg) => {
   // Only show bubbles in month view — day view uses resourceLabelContent for column headers
   if (calView !== 'dayGridMonth') return <span>{arg.dayNumberText}</span>
   const dateStr = arg.date.toLocaleDateString('sv-SE')
   const dayBks = bookings
     .filter(b => b.start_time && b.status !== 'cancelled' && new Date(b.start_time).toLocaleDateString('sv-SE') === dateStr)
     .sort((a, b) => a.start_time < b.start_time ? -1 : 1)
   const isOpen = openBubbleDate === dateStr
   return (
     <div style={{ width:'100%', minHeight:70, padding:'4px 4px 0', display:'flex', flexDirection:'column', alignItems:'flex-start' }}>
       <span style={{ fontWeight:700, fontSize:13, color:'#0f172a', marginBottom:6 }}>{arg.dayNumberText}</span>
       {dayBks.length > 0 && (
         <button
           onClick={e => {
             bubbleClickRef.current = true
             e.stopPropagation()
             if (isOpen) {
               setOpenBubbleDate(null)
               setBubblePos(null)
             } else {
               const rect = e.currentTarget.getBoundingClientRect()
               setOpenBubbleDate(dateStr)
               setBubblePos({ top: rect.bottom + 4, left: rect.left })
             }
           }}
           style={{ alignSelf:'center', background:'#0f172a', color:'#fff', border:'none', borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:700, cursor:'pointer', lineHeight:'18px', whiteSpace:'nowrap' }}
         >
           {dayBks.length} {dayBks.length === 1 ? 'Appt' : 'Appts'}
         </button>
       )}
     </div>
   )
 }}
 resourceLabelContent={(info) => {
   const techId = info.resource.id
   const noteKey = `${techId}_${calDate}`
   return (
     <div style={{ display:'flex', flexDirection:'column', gap:3, padding:'2px 4px' }}>
       <span style={{ fontWeight:800 }}>{info.resource.title}</span>
       <input
         key={techNotes[noteKey] !== undefined ? noteKey : 'pending_' + noteKey}
         style={{ fontSize:10, color:'#64748b', border:'none', borderBottom:'1px dashed #e2e8f0', background:'transparent', outline:'none', width:'100%', fontFamily:'inherit', padding:'1px 0' }}
         placeholder="Add a note..."
         defaultValue={techNotes[noteKey] ?? ''}
         onBlur={e => saveTechNote(techId, calDate, e.target.value)}
         onClick={e => e.stopPropagation()}
       />
     </div>
   )
 }}
 />
 </div>
 )}
 {view === 'clients' && <ClientsView />}
 {view === 'inbox' && <InboxView country={salon?.country} />}
 {view === 'analytics'  && <div style={{ flex:1, overflowY:'auto' }}><Analytics /></div>}
{view === 'giftcards'  && <GiftCardsView />}
{view === 'shop'       && <ShopView />}
{view === 'widget'     && <WidgetSettingsView salon={salon} />}
 </div>

 {/* Modals */}

 {showHours && (
 <OpeningHoursModal hours={openingHours} onSave={saveHours} onClose={() => setShowHours(false)} />
 )}

 {showCheckout && checkoutBooking && (
 <CheckoutModal
 booking={checkoutBooking}
 services={services}
 receiptData={checkoutReceiptData}
 country={salon?.country}
 loyaltyDiscount={checkoutLoyaltyDiscount}
 onClose={() => { setShowCheckout(false); setCheckoutBooking(null); setCheckoutReceiptData(null) }}
 onComplete={(id, closeModal = true) => {
 setBookings(prev => prev.map(b => b.id !== id ? b : { ...b, status:'completed' }))
 if (closeModal) { setShowCheckout(false); setCheckoutBooking(null); setCheckoutReceiptData(null) }
 }}
 />
 )}

 {showBooking && (
 <Modal title={editingId ? 'Edit Booking' : 'New Booking'} onClose={() => { setShowBooking(false); setPhoneMatches([]); setClientNotes(''); setClientDifficult(false) }}>
 <label style={lbl}>Phone *</label>
 <div style={{ position:'relative' }}>
 <input style={inp} type="tel" value={form.phone} onChange={e => handlePhoneChange(e.target.value)} placeholder="e.g. 0912 345 678" autoComplete="off" />
 {phoneMatches.length > 0 && (
   <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:300, background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', overflow:'hidden', marginTop:2 }}>
     {phoneMatches.map(c => (
       <button key={c.id} onClick={() => selectCustomer(c)}
         style={{ width:'100%', textAlign:'left', padding:'9px 14px', background:'none', border:'none', borderBottom:'1px solid #f1f5f9', cursor:'pointer', display:'block' }}>
         <div style={{ fontWeight:700, fontSize:13, color:'#0f172a' }}>{c.full_name}</div>
         <div style={{ fontSize:11, color:'#64748b', marginTop:1 }}>{c.phone}</div>
       </button>
     ))}
   </div>
 )}
 </div>

 <label style={lbl}>Client Name *</label>
 <div style={{ position:'relative' }}>
 <input style={inp} value={form.full_name} onChange={e => setForm({...form, full_name:e.target.value})} placeholder="e.g. Ngoc Anh" />
 {clientDifficult && <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)' }}><FlagIcon active={true} size={13} /></span>}
 </div>
 {clientDifficult && (
 <div style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 10px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, marginTop:6, fontSize:12, color:'#dc2626', fontWeight:700 }}>
   <FlagIcon active={true} size={12} /> {salon?.country === 'VN' ? 'Khách hàng khó tính — hãy cẩn thận' : 'Difficult client — handle with care'}
 </div>
 )}

 <label style={lbl}>Email (optional)</label>
 <input style={inp} type="email" value={form.email} onChange={e => setForm({...form, email:e.target.value})} placeholder="e.g. ngoc@email.com" />

 <label style={lbl}>Technician *</label>
 <select style={inp} value={form.technician_id} onChange={e => setForm({...form, technician_id:e.target.value, service_ids:[]})}>
 <option value=''>Select technician…</option>
 {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
 </select>

 {clientNotes && (
 <div style={{ marginTop:10, padding:'10px 12px', background:'#fffbeb', borderRadius:8, border:'1px solid #fde68a' }}>
   <div style={{ fontSize:10, fontWeight:800, color:'#92400e', textTransform:'uppercase', letterSpacing:0.8, marginBottom:4 }}>Client Notes</div>
   <div style={{ fontSize:13, color:'#78350f', whiteSpace:'pre-wrap' }}>{clientNotes}</div>
 </div>
 )}

 <label style={lbl}>Service *</label>
 <input
 style={{ ...inp, marginBottom:6, background:'#f8fafc' }}
 value={svcSearch}
 onChange={e => setSvcSearch(e.target.value)}
 onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
 placeholder=" Search services…"
 />
 <div style={{ border:'1px solid #e2e8f0', borderRadius:8, overflowY:'auto', maxHeight:180, background:'#fff' }}>
 {filteredServices(form.technician_id).length === 0 ? (
 <div style={{ padding:'10px 12px', fontSize:13, color:'#94a3b8' }}>No services found…</div>
 ) : filteredServices(form.technician_id).map(s => {
 const selected = form.service_ids?.includes(s.id)
 return (
 <div key={s.id} onClick={() => {
 const ids = form.service_ids || []
 setForm({...form, service_ids: selected ? ids.filter(id => id !== s.id) : [...ids, s.id]})
 }}
 style={{ padding:'9px 12px', fontSize:13, cursor:'pointer', borderBottom:'1px solid #f1f5f9',
 background: selected ? '#eff6ff' : '#fff', display:'flex', alignItems:'center', gap:10 }}>
 <div style={{ width:16, height:16, borderRadius:4, border: selected ? 'none' : '2px solid #cbd5e1',
 background: selected ? '#3b82f6' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
 {selected && <span style={{ color:'#fff', fontSize:11, fontWeight:900 }}></span>}
 </div>
 <span style={{ flex:1, fontWeight: selected ? 700 : 500, color: selected ? '#1d4ed8' : '#0f172a' }}>{s.name}</span>
 <span style={{ fontSize:12, color: selected ? '#3b82f6' : '#94a3b8', fontWeight:600 }}>£{s.price} · {s.duration_minutes}m</span>
 </div>
 )
 })}
 </div>

 {form.service_ids?.length > 0 && (() => {
 const sel = form.service_ids.map(id => services.find(s => s.id === id)).filter(Boolean)
 const totalP = sel.reduce((s, x) => s + parseFloat(x.price || 0), 0)
 const totalM = sel.reduce((s, x) => s + (x.duration_minutes || 0), 0)
 return (
 <div style={{ marginTop:6, padding:'7px 12px', background:'#f0fdf4', borderRadius:8, fontSize:12, color:'#059669', fontWeight:700, display:'flex', justifyContent:'space-between' }}>
 <span>{sel.length} service{sel.length > 1 ? 's' : ''} selected</span>
 <span>£{totalP.toFixed(2)} · {totalM}m total</span>
 </div>
 )
 })()}

 <label style={lbl}>Start Time *</label>
 <input style={inp} type="datetime-local" value={form.start_time} onChange={e => setForm({...form, start_time:e.target.value})} />

 <label style={lbl}>Notes</label>
 <textarea style={{...inp, height:68, resize:'vertical'}} value={form.notes} onChange={e => setForm({...form, notes:e.target.value})} placeholder="Optional notes…" />

{(() => {
const editingBk = editingId ? bookings.find(b => b.id === editingId) : null
const addons = Array.isArray(editingBk?.upsell_products) ? editingBk.upsell_products : []
if (!addons.length) return null
const addonsTotal = addons.reduce((s, p) => s + parseFloat(p.price || 0), 0)
return (
<div style={{ marginTop:10, padding:'10px 12px', background:'#fdf6ee', border:'1px solid #f4d9b0', borderRadius:8 }}>
  <div style={{ fontSize:10, fontWeight:800, color:'#92400e', textTransform:'uppercase', letterSpacing:0.8, marginBottom:6 }}>Add-ons (from chat booking)</div>
  {addons.map((p, i) => (
    <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:3 }}>
      <span style={{ color:'#78350f' }}>{p.name}</span>
      <span style={{ fontWeight:700, color:'#78350f' }}>£{parseFloat(p.price || 0).toFixed(2)}</span>
    </div>
  ))}
  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, fontWeight:800, color:'#c9a96e', borderTop:'1px solid #f4d9b0', paddingTop:5, marginTop:4 }}>
    <span>Add-ons total</span><span>£{addonsTotal.toFixed(2)}</span>
  </div>
</div>
)
})()}

 <div style={{ display:'flex', gap:10, marginTop:20, flexWrap:'wrap' }}>
 <button onClick={handleSave} style={{...btnPrimary, flex:1}}>Save Booking</button>
 {editingId && (
 <button onClick={async () => {
 const b = bookings.find(b => b.id === editingId)
 setShowBooking(false)
 let loyaltyAmt = 0
 if (b?.customers?.loyalty_discount_active) {
   try { const r = await axios.get(API + '/api/settings/loyalty_discount'); loyaltyAmt = parseFloat(r.data?.value || '0') || 0 } catch (_) {}
 }
 setCheckoutLoyaltyDiscount(loyaltyAmt)
 setCheckoutBooking(b)
 setShowCheckout(true)
 }} style={{...btnGreen, flex:1}}>Checkout</button>
 )}
 {editingId && <button onClick={handleNoShow} style={{...btnAmber, flex:1}}>No Show</button>}
 {editingId && <button onClick={handleCancel} style={{...btnDanger, flex:1}}>Cancel Appt</button>}
 </div>
 </Modal>
 )}

 {showTechMgr && (
 <Modal title="Manage Technicians" onClose={() => setShowTechMgr(false)}>
 <div style={{ display:'flex', gap:8, marginTop:12 }}>
 <input style={{...inp, flex:1}} value={newTechName}
 onChange={e => setNewTechName(e.target.value)} placeholder="Technician name…"
 onKeyDown={e => e.key==='Enter' && addTechnician()} />
 <button onClick={addTechnician} style={btnPrimary}>Add</button>
 </div>
 <div style={{ marginTop:14, display:'flex', flexDirection:'column', gap:8 }}>
 {technicians.map(t => (
 <div key={t.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'#f8fafc', borderRadius:10, border:'1px solid #e2e8f0' }}>
 <div>
 <div style={{ fontWeight:700, fontSize:14 }}>{t.name}</div>
 <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>{(techCaps[t.id] ? techCaps[t.id].length : services.length)} services</div>
 </div>
 <div style={{ display:'flex', gap:8 }}>
 <button onClick={() => { setShowTechMgr(false); openCapMgr(t) }} style={{...btnGhost, padding:'6px 12px', fontSize:12}}>Services</button>
 <button onClick={() => removeTechnician(t.id)} style={{...btnDanger, padding:'6px 12px', fontSize:12}}>Remove</button>
 </div>
 </div>
 ))}
 </div>
 </Modal>
 )}

 {showCapMgr && capTech && (
 <Modal title={`${capTech.name} — Services`} onClose={() => setShowCapMgr(false)} width={420}>
 <p style={{ fontSize:13, color:'#64748b', marginTop:8, marginBottom:16 }}>Tick the services this technician can perform.</p>
 {CATEGORIES.map(cat => {
 const catServices = services.filter(s => s.category === cat.label)
 if (!catServices.length) return null
 return (
 <div key={cat.label} style={{ marginBottom:14 }}>
 <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
 <div style={{ width:10, height:10, borderRadius:2, background:cat.color }} />
 <span style={{ fontSize:11, fontWeight:800, color:'#64748b', textTransform:'uppercase', letterSpacing:0.5 }}>{cat.label}</span>
 </div>
 {catServices.map(s => (
 <label key={s.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:8, cursor:'pointer',
 background: capSelected.has(s.id) ? '#f0f7ff' : '#fff', border:'1px solid #e2e8f0', marginBottom:5 }}>
 <input type="checkbox" checked={capSelected.has(s.id)} onChange={() => toggleCap(s.id)} style={{ width:16, height:16, cursor:'pointer' }} />
 <span style={{ fontWeight:700, fontSize:13 }}>{s.name}</span>
 <span style={{ fontSize:12, color:'#94a3b8', marginLeft:'auto' }}>£{s.price} · {s.duration_minutes}m</span>
 </label>
 ))}
 </div>
 )
 })}
 <div style={{ display:'flex', gap:10, marginTop:20 }}>
 <button onClick={saveCaps} style={btnPrimary}>Save</button>
 <button onClick={() => setShowCapMgr(false)} style={btnGhost}>Cancel</button>
 </div>
 </Modal>
 )}

 {showSvcMgr && (
 <Modal title="Manage Services" onClose={() => setShowSvcMgr(false)}>
 <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:12 }}>
 <div style={{ gridColumn:'1/-1' }}>
 <label style={lbl}>Service Name</label>
 <input style={inp} value={newSvc.name} onChange={e => setNewSvc({...newSvc, name:e.target.value})} placeholder="e.g. Gel Manicure" />
 </div>
 <div>
 <label style={lbl}>Duration (mins)</label>
 <input style={inp} type="number" value={newSvc.duration_minutes} onChange={e => setNewSvc({...newSvc, duration_minutes:parseInt(e.target.value)})} />
 </div>
 <div>
 <label style={lbl}>Price (£)</label>
 <input style={inp} type="number" value={newSvc.price} onChange={e => setNewSvc({...newSvc, price:e.target.value})} placeholder="45" />
 </div>
 <div style={{ gridColumn:'1/-1' }}>
 <label style={lbl}>Category</label>
 <select style={inp} value={newSvc.category} onChange={e => setNewSvc({...newSvc, category:e.target.value})}>
 {CATEGORIES.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
 </select>
 <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8 }}>
 <div style={{ width:14, height:14, borderRadius:3, background: CATEGORY_COLOR[newSvc.category] }} />
 <span style={{ fontSize:12, color:'#64748b' }}>Colour assigned automatically</span>
 </div>
 </div>
 </div>
 <button onClick={addService} style={{...btnPrimary, width:'100%', marginTop:14}}>Add Service</button>
 <div style={{ marginTop:16, display:'flex', flexDirection:'column', gap:6 }}>
 {CATEGORIES.map(cat => {
 const catSvcs = services.filter(s => s.category === cat.label)
 if (!catSvcs.length) return null
 return (
 <div key={cat.label}>
 <div style={{ display:'flex', alignItems:'center', gap:6, margin:'10px 0 6px' }}>
 <div style={{ width:10, height:10, borderRadius:2, background:cat.color }} />
 <span style={{ fontSize:11, fontWeight:800, color:'#64748b', textTransform:'uppercase', letterSpacing:0.5 }}>{cat.label}</span>
 </div>
 {catSvcs.map(s => (
 <div key={s.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 14px', background:'#f8fafc', borderRadius:10, border:'1px solid #e2e8f0', marginBottom:5 }}>
 <div style={{ display:'flex', alignItems:'center', gap:10 }}>
 <div style={{ width:10, height:10, borderRadius:'50%', background:cat.color }} />
 <span style={{ fontWeight:700, fontSize:13 }}>{s.name}</span>
 <span style={{ fontSize:12, color:'#94a3b8' }}>£{s.price} · {s.duration_minutes}m</span>
 </div>
 <button onClick={() => removeService(s.id)} style={{...btnDanger, padding:'5px 10px', fontSize:12}}>Remove</button>
 </div>
 ))}
 </div>
 )
 })}
 </div>
 </Modal>
 )}

 {/* Month view bubble dropdown portal — renders on document.body so it never affects calendar cell layout */}
 {openBubbleDate && bubblePos && (() => {
   const portalBks = bookings
     .filter(b => b.start_time && b.status !== 'cancelled' && new Date(b.start_time).toLocaleDateString('sv-SE') === openBubbleDate)
     .sort((a, b) => a.start_time < b.start_time ? -1 : 1)
   return createPortal(
     <div
       onClick={e => { bubbleClickRef.current = true; e.stopPropagation() }}
       style={{ position:'fixed', top: bubblePos.top, left: bubblePos.left, zIndex:9000, background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.18)', overflow:'hidden', minWidth:200, maxWidth:280 }}
     >
       {portalBks.map((bk, i) => (
         <button
           key={bk.id}
           onClick={e => { bubbleClickRef.current = true; e.stopPropagation(); setOpenBubbleDate(null); setBubblePos(null); openEditFromBooking(bk) }}
           style={{ width:'100%', textAlign:'left', padding:'8px 12px', background:'none', border:'none', borderBottom: i < portalBks.length - 1 ? '1px solid #f1f5f9' : 'none', cursor:'pointer', display:'block' }}
         >
           <div style={{ fontWeight:700, fontSize:12, color:'#0f172a' }}>
             {new Date(bk.start_time).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })} · {bk.customers?.full_name || 'Guest'}
           </div>
           {bk.services?.name && <div style={{ fontSize:11, color:'#64748b', marginTop:1 }}>{bk.services.name}</div>}
         </button>
       ))}
     </div>,
     document.body
   )
 })()}
 </div>
 )
}

// ── Gift Cards ─────────────────────────────────────────────────────────────────
const emptyPerson = { name:'', phone:'', email:'' }

function GiftCardsView() {
  const [cards, setCards]     = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [value, setValue]         = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [sender, setSender]       = useState(emptyPerson)
  const [recipient, setRecipient] = useState(emptyPerson)
  const [issuing, setIssuing]     = useState(false)
  const [newCard, setNewCard] = useState(null)
  const [copied, setCopied]   = useState(false)

  useEffect(() => {
    axios.get(API + '/api/gift-cards')
      .then(r => setCards(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function issueCard() {
    if (!value || parseFloat(value) <= 0) { alert('Enter a valid value'); return }
    if (!paymentMethod) { alert('Please select a payment method'); return }
    setIssuing(true)
    try {
      const { data } = await axios.post(API + '/api/gift-cards/purchase', {
        value: parseFloat(value),
        payment_method:    paymentMethod,
        sender_name:       sender.name    || undefined,
        sender_phone:      sender.phone   || undefined,
        sender_email:      sender.email   || undefined,
        recipient_name:    recipient.name    || undefined,
        recipient_phone:   recipient.phone   || undefined,
        recipient_email:   recipient.email   || undefined,
      })
      setCards(prev => [data, ...prev])
      setNewCard(data)
      setValue('')
      setPaymentMethod('')
      setSender(emptyPerson)
      setRecipient(emptyPerson)
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to issue gift card')
    }
    setIssuing(false)
  }

  function copyCode(code) {
    navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  const statusColor = s => s === 'active' ? '#059669' : s === 'redeemed' ? '#64748b' : '#ef4444'
  const statusBg    = s => s === 'active' ? '#f0fdf4' : s === 'redeemed' ? '#f8fafc' : '#fef2f2'

  const filtered = cards.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.code.toLowerCase().includes(q)
      || (c.sender_name    || '').toLowerCase().includes(q)
      || (c.recipient_name || '').toLowerCase().includes(q)
      || String(c.value).includes(q)
  })

  const secHead   = { fontSize:11, fontWeight:800, color:'#64748b', textTransform:'uppercase', letterSpacing:0.8, marginBottom:12 }
  const personLbl = { ...lbl, marginTop:10 }
  const personInp = (person, setPerson, field) => ({
    style: inp,
    value: person[field],
    onChange: e => setPerson(p => ({ ...p, [field]: e.target.value })),
  })

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'32px 28px', maxWidth:800 }}>
      <h2 style={{ fontSize:22, fontWeight:900, color:'#0f172a', marginBottom:24 }}>Gift Cards</h2>

      {/* Issue form */}
      <div style={{ background:'#fff', borderRadius:14, padding:22, border:'1px solid #e2e8f0', marginBottom:28 }}>
        <div style={secHead}>Issue New Gift Card</div>

        {/* Value */}
        <div style={{ maxWidth:160 }}>
          <label style={{ ...lbl, marginTop:0 }}>Value (£) *</label>
          <input style={inp} type="number" min="1" step="0.01" placeholder="e.g. 50"
            value={value} onChange={e => setValue(e.target.value)} />
        </div>

        {/* Two-column: Sender + Recipient */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginTop:18 }}>
          {/* Sender */}
          <div style={{ background:'#f8fafc', borderRadius:10, padding:14, border:'1px solid #f1f5f9' }}>
            <div style={{ fontSize:13, fontWeight:800, color:'#0f172a', marginBottom:2 }}>Nguoi gui</div>
            <div style={{ fontSize:11, color:'#94a3b8', marginBottom:10 }}>Sender — person buying the card</div>
            <label style={personLbl}>Name</label>
            <input {...personInp(sender, setSender, 'name')} placeholder="tên người gửi" />
            <label style={personLbl}>Phone</label>
            <input {...personInp(sender, setSender, 'phone')} placeholder="e.g. 07700 900000" />
            <label style={personLbl}>Email</label>
            <input {...personInp(sender, setSender, 'email')} type="email" placeholder="sender@email.com" />
          </div>

          {/* Recipient */}
          <div style={{ background:'#fdf6ee', borderRadius:10, padding:14, border:'1px solid #f4d9b0' }}>
            <div style={{ fontSize:13, fontWeight:800, color:'#0f172a', marginBottom:2 }}>Nguoi nhan</div>
            <div style={{ fontSize:11, color:'#94a3b8', marginBottom:10 }}>Recipient — person receiving the card</div>
            <label style={personLbl}>Name</label>
            <input {...personInp(recipient, setRecipient, 'name')} placeholder="tên người nhận" />
            <label style={personLbl}>Phone</label>
            <input {...personInp(recipient, setRecipient, 'phone')} placeholder="e.g. 07700 900001" />
            <label style={personLbl}>Email</label>
            <input {...personInp(recipient, setRecipient, 'email')} type="email" placeholder="recipient@email.com" />
          </div>
        </div>

        <div style={{ marginTop:18, maxWidth:200 }}>
          <label style={{ ...lbl, marginTop:0 }}>Payment Method *</label>
          <select style={{ ...inp, color: paymentMethod ? '#0f172a' : '#94a3b8' }}
            value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
            <option value="">Select…</option>
            <option value="Terminal">Terminal</option>
            <option value="Cash">Cash</option>
          </select>
        </div>

        <button onClick={issueCard} disabled={issuing}
          style={{ ...btnPrimary, marginTop:14, opacity: (issuing || !paymentMethod) ? 0.6 : 1 }}>
          {issuing ? 'Generating…' : 'Generate Card'}
        </button>

        {newCard && (
          <div style={{ marginTop:16, padding:'14px 16px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:800, color:'#059669', textTransform:'uppercase', letterSpacing:0.8, marginBottom:4 }}>Gift card created</div>
              <div style={{ fontSize:20, fontWeight:900, color:'#0f172a', letterSpacing:2, fontFamily:'monospace' }}>{newCard.code}</div>
              {(newCard.recipient_email || newCard.sender_email) && (
                <div style={{ fontSize:12, color:'#059669', marginTop:4 }}>
                  {newCard.recipient_email && `Card sent to ${newCard.recipient_email}`}
                  {newCard.recipient_email && newCard.sender_email && ' · '}
                  {newCard.sender_email && `Receipt sent to ${newCard.sender_email}`}
                </div>
              )}
            </div>
            <button onClick={() => copyCode(newCard.code)} style={{ ...btnGhost, fontSize:12, padding:'8px 14px' }}>
              {copied ? 'Copied!' : 'Copy Code'}
            </button>
          </div>
        )}
      </div>

      {/* Search + list */}
      <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', overflow:'hidden' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ ...secHead, marginBottom:0 }}>All Gift Cards</div>
          <input style={{ ...inp, maxWidth:240, marginLeft:'auto' }}
            placeholder="Search by code, name, value…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {loading ? (
          <div style={{ padding:24, color:'#94a3b8', fontSize:13 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:24, color:'#94a3b8', fontSize:13 }}>No gift cards found.</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                {['Code','Value','Remaining','Status','Payment','Sender','Recipient','Issued'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:800, color:'#64748b', fontSize:11, textTransform:'uppercase', letterSpacing:0.6, whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} style={{ borderTop:'1px solid #f1f5f9' }}>
                  <td style={{ padding:'12px 14px', fontFamily:'monospace', fontWeight:700, fontSize:12, color:'#0f172a', letterSpacing:1, whiteSpace:'nowrap' }}>{c.code}</td>
                  <td style={{ padding:'12px 14px', fontWeight:700, whiteSpace:'nowrap' }}>£{parseFloat(c.value).toFixed(2)}</td>
                  <td style={{ padding:'12px 14px', fontWeight:700, whiteSpace:'nowrap', color: parseFloat(c.remaining_balance) > 0 ? '#059669' : '#94a3b8' }}>£{parseFloat(c.remaining_balance).toFixed(2)}</td>
                  <td style={{ padding:'12px 14px' }}>
                    <span style={{ background: statusBg(c.status), color: statusColor(c.status), fontWeight:700, fontSize:11, padding:'3px 9px', borderRadius:20, textTransform:'capitalize', whiteSpace:'nowrap' }}>
                      {c.status}
                    </span>
                  </td>
                  <td style={{ padding:'12px 14px', color:'#64748b', fontWeight:600 }}>{c.payment_method || '—'}</td>
                  <td style={{ padding:'12px 14px' }}>
                    {c.sender_name && <div style={{ fontWeight:700, color:'#0f172a' }}>{c.sender_name}</div>}
                    {c.sender_phone && <div style={{ fontSize:11, color:'#64748b' }}>{c.sender_phone}</div>}
                    {c.sender_email && <div style={{ fontSize:11, color:'#64748b' }}>{c.sender_email}</div>}
                    {!c.sender_name && !c.sender_email && <span style={{ color:'#94a3b8' }}>—</span>}
                  </td>
                  <td style={{ padding:'12px 14px' }}>
                    {c.recipient_name && <div style={{ fontWeight:700, color:'#0f172a' }}>{c.recipient_name}</div>}
                    {c.recipient_phone && <div style={{ fontSize:11, color:'#64748b' }}>{c.recipient_phone}</div>}
                    {c.recipient_email && <div style={{ fontSize:11, color:'#64748b' }}>{c.recipient_email}</div>}
                    {!c.recipient_name && !c.recipient_email && <span style={{ color:'#94a3b8' }}>—</span>}
                  </td>
                  <td style={{ padding:'12px 14px', color:'#94a3b8', fontSize:12, whiteSpace:'nowrap' }}>{new Date(c.issued_at).toLocaleDateString('en-GB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Widget Settings ────────────────────────────────────────────────────────────
function WidgetSettingsView({ salon }) {
  const salonId   = salon?.id   || ''
  const salonName = salon?.name || ''
  const widgetUrl = API + '/widget/widget-page.html?salon=' + encodeURIComponent(salonId) + '&name=' + encodeURIComponent(salonName)
  const embedCode = '<script src="' + API + '/widget/orbit-chat-widget.js?salon=' + salonId + '"><\/script>'

  const [upsellEnabled, setUpsellEnabled] = useState(false)
  const [products, setProducts]           = useState([])
  const [saving, setSaving]               = useState(false)
  const [copied, setCopied]               = useState(null)

  useEffect(() => {
    if (!salonId) return
    Promise.all([
      axios.get(API + '/api/settings/widget_upsell_enabled').catch(() => ({ data: null })),
      axios.get(API + '/api/settings/widget_upsell_products').catch(() => ({ data: null })),
    ]).then(([er, pr]) => {
      if (er.data?.value != null) setUpsellEnabled(er.data.value === 'true')
      if (pr.data?.value) { try { setProducts(JSON.parse(pr.data.value)) } catch (_) {} }
    })
  }, [salonId])

  function copy(text, key) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key); setTimeout(() => setCopied(null), 2000)
    }).catch(() => {
      const el = document.createElement('textarea'); el.value = text
      document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el)
      setCopied(key); setTimeout(() => setCopied(null), 2000)
    })
  }

  function updateProduct(i, field, value) {
    setProducts(prev => prev.map((p, idx) => idx !== i ? p : { ...p, [field]: value }))
  }

  function handleImageUpload(i, file) {
    if (!file) return
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 800
      const scale = img.width > MAX ? MAX / img.width : 1
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      updateProduct(i, 'imageData', canvas.toDataURL('image/jpeg', 0.7))
    }
    img.src = url
  }

  async function saveSettings() {
    setSaving(true)
    try {
      await Promise.all([
        axios.post(API + '/api/settings/widget_upsell_enabled', { value: String(upsellEnabled) }),
        axios.post(API + '/api/settings/widget_upsell_products', { value: JSON.stringify(products) }),
      ])
    } catch (err) { alert('Save failed: ' + (err.response?.data?.error || err.message)) }
    setSaving(false)
  }

  const card     = { background:'#fff', borderRadius:14, padding:20, marginBottom:18, border:'1px solid #e2e8f0' }
  const secTitle = { fontSize:14, fontWeight:800, color:'#0f172a', marginBottom:3 }
  const secSub   = { fontSize:12, color:'#94a3b8', marginBottom:12 }
  const copyRow  = { display:'flex', gap:8, alignItems:'center' }
  const codeBox  = { ...inp, background:'#f8fafc', flex:1, fontFamily:'monospace', fontSize:11, color:'#475569', cursor:'default' }

  return (
    <div style={{ flex:1, overflowY:'auto', padding:32 }}>
      <div style={{ maxWidth:620 }}>
        <h2 style={{ fontSize:18, fontWeight:900, marginBottom:22, color:'#0f172a' }}>Widget Settings</h2>

        <div style={card}>
          <div style={secTitle}>Standalone Booking Page</div>
          <div style={secSub}>Share this link — opens a hosted booking page with the chat widget.</div>
          <div style={copyRow}>
            <input readOnly style={codeBox} value={widgetUrl} onClick={e => e.target.select()} />
            <button onClick={() => copy(widgetUrl, 'link')}
              style={{ ...btnGhost, padding:'8px 14px', fontSize:12, background: copied==='link' ? '#059669' : '#fff', color: copied==='link' ? '#fff' : '#0f172a', borderColor: copied==='link' ? '#059669' : '#e2e8f0' }}>
              {copied === 'link' ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        <div style={card}>
          <div style={secTitle}>Embed Script</div>
          <div style={secSub}>Paste into any webpage to embed the booking widget on your site.</div>
          <div style={copyRow}>
            <input readOnly style={codeBox} value={embedCode} onClick={e => e.target.select()} />
            <button onClick={() => copy(embedCode, 'embed')}
              style={{ ...btnGhost, padding:'8px 14px', fontSize:12, background: copied==='embed' ? '#059669' : '#fff', color: copied==='embed' ? '#fff' : '#0f172a', borderColor: copied==='embed' ? '#059669' : '#e2e8f0' }}>
              {copied === 'embed' ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        <div style={card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={secTitle}>Post-Booking Upsell</div>
              <div style={secSub}>Show product cards after a booking is confirmed in the widget.</div>
            </div>
            <button onClick={() => setUpsellEnabled(e => !e)}
              style={{ padding:'7px 16px', borderRadius:20, border:'none', fontWeight:800, fontSize:12, cursor:'pointer',
                background: upsellEnabled ? '#059669' : '#e2e8f0', color: upsellEnabled ? '#fff' : '#64748b' }}>
              {upsellEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </div>

        {upsellEnabled && (
          <div style={card}>
            <div style={secTitle}>Upsell Products</div>
            <div style={secSub}>Up to 6 products shown after booking. Click the image area to upload a photo.</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:4 }}>
              {products.map((p, i) => (
                <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start', padding:12, background:'#f8fafc', borderRadius:10, border:'1px solid #e2e8f0' }}>
                  <div onClick={() => document.getElementById('img-' + i)?.click()}
                    style={{ width:60, height:60, borderRadius:8, background:'#e2e8f0', overflow:'hidden', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:22 }}>
                    {p.imageData ? <img src={p.imageData} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <span style={{ fontSize:11, color:'#94a3b8', lineHeight:1.2, textAlign:'center' }}>Add<br/>image</span>}
                    <input id={'img-' + i} type="file" accept="image/*" style={{ display:'none' }}
                      onChange={e => handleImageUpload(i, e.target.files[0])} />
                  </div>
                  <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6 }}>
                    <input style={{ ...inp, fontSize:12 }} placeholder="Product name" value={p.name}
                      onChange={e => updateProduct(i, 'name', e.target.value)} />
                    <div style={{ display:'flex', gap:6 }}>
                      <input style={{ ...inp, fontSize:12, flex:'0 0 90px' }} placeholder="Price" value={p.price}
                        onChange={e => updateProduct(i, 'price', e.target.value)} />
                      <input style={{ ...inp, fontSize:12, flex:1 }} placeholder="Buy URL (optional)" value={p.buyUrl}
                        onChange={e => updateProduct(i, 'buyUrl', e.target.value)} />
                    </div>
                  </div>
                  <button onClick={() => setProducts(prev => prev.filter((_, idx) => idx !== i))}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', fontSize:18, padding:'0 2px', flexShrink:0 }}>×</button>
                </div>
              ))}
              {products.length < 6 && (
                <button onClick={() => setProducts(p => [...p, { name:'', price:'', imageData:'', buyUrl:'' }])}
                  style={{ ...btnGhost, fontSize:12, padding:'8px 14px', alignSelf:'flex-start' }}>+ Add Product</button>
              )}
            </div>
          </div>
        )}

        <button onClick={saveSettings} disabled={saving}
          style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}

// Auth wrapper — root export
export default function App() {
 const [token, setToken] = useState(() => {
   const t = localStorage.getItem('orbit_token') || null
   // Set header synchronously so MainApp's loadAll() has auth on first mount
   if (t) axios.defaults.headers.common['Authorization'] = 'Bearer ' + t
   return t
 })
 const [salon, setSalon] = useState(() => {
   try { return JSON.parse(localStorage.getItem('orbit_salon') || 'null') } catch { return null }
 })
 const [page, setPage] = useState('login') // 'login' | 'signup'

 useEffect(() => {
   if (token) {
     axios.defaults.headers.common['Authorization'] = 'Bearer ' + token
   } else {
     delete axios.defaults.headers.common['Authorization']
   }
 }, [token])

 // Restore session on mount — verify token is still valid
 useEffect(() => {
   if (!token) return
   axios.get(API + '/api/auth/me').then(r => {
     setSalon(r.data.salon)
     localStorage.setItem('orbit_salon', JSON.stringify(r.data.salon))
   }).catch(() => handleLogout())
 }, [])

 function handleLogin(accessToken, salonData) {
   setToken(accessToken)
   setSalon(salonData)
   localStorage.setItem('orbit_token', accessToken)
   localStorage.setItem('orbit_salon', JSON.stringify(salonData))
   axios.defaults.headers.common['Authorization'] = 'Bearer ' + accessToken
 }

 function handleLogout() {
   if (token) {
     axios.post(API + '/api/auth/logout').catch(() => {})
   }
   setToken(null)
   setSalon(null)
   localStorage.removeItem('orbit_token')
   localStorage.removeItem('orbit_salon')
   delete axios.defaults.headers.common['Authorization']
   setPage('login')
 }

 if (!token) {
   if (page === 'signup') {
     return <SignupPage onLogin={handleLogin} onBack={() => setPage('login')} />
   }
   return <LoginPage onLogin={(t, s, nav) => nav === 'signup' ? setPage('signup') : handleLogin(t, s)} />
 }

 return <MainApp salon={salon} onLogout={handleLogout} />
}