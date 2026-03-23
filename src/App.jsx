import { useEffect, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import axios from 'axios'

const API = 'http://localhost:3001'

// ── Constants ─────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { label: 'Nail Enhancements', color: '#fca5a5' },
  { label: 'Natural Nails',     color: '#93c5fd' },
  { label: 'Service Add On',    color: '#fde68a' },
  { label: 'Beauty',            color: '#d8b4fe' },
]
const CATEGORY_COLOR   = Object.fromEntries(CATEGORIES.map(c => [c.label, c.color]))
const PAYMENT_METHODS  = ['Cash', 'Chuyển Khoản', 'Terminal', 'Gift Card']
const DAYS             = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

const DEFAULT_HOURS = DAYS.map((d, i) => ({
  day:  d,
  open: i < 6,
  from: '10:00',
  to:   '19:00',
}))

// ── Shared styles ─────────────────────────────────────────────────────────────
const lbl        = { display:'block', fontSize:11, fontWeight:800, color:'#64748b', textTransform:'uppercase', letterSpacing:0.8, marginBottom:5, marginTop:14 }
const inp        = { width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13, boxSizing:'border-box', fontFamily:'inherit', outline:'none' }
const btnPrimary = { padding:'11px 20px', borderRadius:10, border:'none', background:'#0f172a', color:'#fff', fontWeight:800, cursor:'pointer', fontSize:13 }
const btnGhost   = { padding:'11px 20px', borderRadius:10, border:'1px solid #e2e8f0', background:'#fff', fontWeight:800, cursor:'pointer', fontSize:13, color:'#0f172a' }
const btnDanger  = { padding:'11px 20px', borderRadius:10, border:'none', background:'#ef4444', color:'#fff', fontWeight:800, cursor:'pointer', fontSize:13 }
const btnGreen   = { padding:'11px 20px', borderRadius:10, border:'none', background:'#059669', color:'#fff', fontWeight:800, cursor:'pointer', fontSize:13 }

// ── Modal wrapper ─────────────────────────────────────────────────────────────
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

// ── Checkout Modal ────────────────────────────────────────────────────────────
function CheckoutModal({ booking, services, onClose, onComplete }) {
  const selectedSvcs = booking.service_ids?.length
    ? booking.service_ids.map(id => services.find(s => s.id === id)).filter(Boolean)
    : (booking.service_id ? [services.find(s => s.id === booking.service_id)].filter(Boolean) : [])
  const svc          = selectedSvcs[0] || services.find(s => s.id === booking.service_id)
  const defaultTotal = parseFloat(selectedSvcs.reduce((sum, s) => sum + parseFloat(s?.price || 0), 0).toFixed(2)) || parseFloat(svc?.price || 0)

  const [total,   setTotal]   = useState(defaultTotal)
  const [splits,  setSplits]  = useState([{ method: 'Cash', amount: defaultTotal }])
  const [notes,   setNotes]   = useState('')
  const [loading, setLoading] = useState(false)
  const [done,    setDone]    = useState(false)

  const splitTotal = splits.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  const remaining  = parseFloat((total - splitTotal).toFixed(2))
  const balanced   = Math.abs(remaining) < 0.01

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

    function emailReceipt() {
      const email = booking.customers?.email
      if (!email) { alert('No email address on file for this client.'); return }
      const subject = encodeURIComponent(`Your receipt from Orbit — ${receiptId}`)
      const body = encodeURIComponent(
        `Hi ${booking.customers?.full_name || 'there'},\n\nThank you for your visit!\n\nService: ${svc?.name || '—'}\nTechnician: ${booking.technicians?.name || '—'}\nDate: ${new Date(booking.start_time).toLocaleString('en-GB')}\nTotal: £${total.toFixed(2)}\n\nReceipt ID: ${receiptId}\n\nThank you!`
      )
      window.open(`mailto:${email}?subject=${subject}&body=${body}`)
    }

    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999, padding:16 }}>
        <div style={{ background:'#fff', borderRadius:18, padding:28, width:440, boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
          <div style={{ textAlign:'center', marginBottom:20 }}>
            <div style={{ fontSize:40, marginBottom:8 }}>✅</div>
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
            <button onClick={printReceipt} style={{ ...btnPrimary, flex:1 }}>🖨 Print Receipt</button>
            <button onClick={emailReceipt} style={{ ...btnGhost, flex:1 }}>✉ Email</button>
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
          <div key={i} style={{ display:'flex', gap:8, marginBottom:8, alignItems:'center' }}>
            <select style={{ ...inp, flex:'0 0 160px', width:'auto' }} value={split.method} onChange={e => updateSplit(i, 'method', e.target.value)}>
              {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
            </select>
            <input style={{ ...inp, flex:1, width:'auto' }} type="number" min="0" step="0.01"
              value={split.amount} onChange={e => updateSplit(i, 'amount', e.target.value)} placeholder="Amount" />
            {splits.length > 1 && (
              <button onClick={() => removeSplit(i)} style={{ background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:22, lineHeight:1, padding:'0 4px' }}>×</button>
            )}
          </div>
        ))}
        <div style={{ padding:'8px 12px', borderRadius:8, marginBottom:16, marginTop:4,
          background: balanced ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${balanced ? '#bbf7d0' : '#fecaca'}`,
          fontSize:13, fontWeight:700, color: balanced ? '#059669' : '#ef4444' }}>
          {balanced
            ? `✓ Fully paid — £${total.toFixed(2)}`
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

// ── Opening Hours Modal ───────────────────────────────────────────────────────
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

// ── Inbox View ────────────────────────────────────────────────────────────────
function InboxView() {
  const [conversations, setConversations] = useState([])
  const [activeConv,    setActiveConv]    = useState(null)
  const [messages,      setMessages]      = useState([])
  const [reply,         setReply]         = useState('')
  const [loading,       setLoading]       = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => { loadConversations() }, [])
  useEffect(() => { if (activeConv) loadMessages(activeConv.id) }, [activeConv])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages])

  async function loadConversations() {
    try { const { data } = await axios.get(API + '/api/conversations'); setConversations(data || []) } catch {}
  }
  async function loadMessages(convId) {
    try { const { data } = await axios.get(API + '/api/conversations/' + convId + '/messages'); setMessages(data || []) } catch {}
  }
  async function sendReply() {
    if (!reply.trim() || !activeConv) return
    setLoading(true)
    const optimistic = { id:'tmp-'+Date.now(), body:reply, sender_type:'staff', created_at:new Date().toISOString() }
    setMessages(prev => [...prev, optimistic])
    setReply('')
    try { await axios.post(API + '/api/conversations/' + activeConv.id + '/messages', { body: reply, sender_type:'staff' }) } catch {}
    setLoading(false)
    loadConversations()
  }
  async function seedTest() {
    try {
      const { data: conv } = await axios.post(API + '/api/conversations', {
        channel:'zalo', customer_name:'Ngoc Anh', customer_phone:'07700900123',
        external_id:'test-'+Date.now(), last_message:'Xin chào, tôi muốn đặt lịch làm móng!'
      })
      await axios.post(API + '/api/conversations/' + conv.id + '/messages', {
        body:'Xin chào, tôi muốn đặt lịch làm móng!', sender_type:'customer'
      })
      loadConversations()
      setActiveConv(conv)
    } catch {}
  }
  const CHANNEL_COLORS = { zalo:'#0068ff', messenger:'#00b2ff', instagram:'#e1306c' }

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>
      <div style={{ width:300, borderRight:'1px solid #e2e8f0', display:'flex', flexDirection:'column', background:'#fff' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:900, fontSize:16 }}>Inbox</div>
          <button onClick={seedTest} style={{ fontSize:11, padding:'5px 10px', borderRadius:8, border:'1px solid #e2e8f0', background:'#f8fafc', cursor:'pointer', fontWeight:700, color:'#64748b' }}>+ Test</button>
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          {conversations.length === 0 && (
            <div style={{ padding:24, textAlign:'center', color:'#94a3b8', fontSize:13 }}>No messages yet.</div>
          )}
          {conversations.map(c => (
            <div key={c.id} onClick={() => setActiveConv(c)} style={{ padding:'14px 20px', cursor:'pointer', borderBottom:'1px solid #f1f5f9', background: activeConv?.id===c.id ? '#f0f7ff' : '#fff' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                <div style={{ fontWeight:800, fontSize:14 }}>{c.customer_name || 'Unknown'}</div>
                <div style={{ fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:10, background: CHANNEL_COLORS[c.channel]||'#64748b', color:'#fff' }}>{c.channel}</div>
              </div>
              <div style={{ fontSize:12, color:'#64748b', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.last_message||'—'}</div>
              <div style={{ fontSize:11, color:'#94a3b8', marginTop:4 }}>
                {c.last_message_at ? new Date(c.last_message_at).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : ''}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ flex:1, display:'flex', flexDirection:'column', background:'#f8fafc' }}>
        {!activeConv ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12, color:'#94a3b8' }}>
            <div style={{ fontSize:36 }}>💬</div>
            <div style={{ fontSize:14, fontWeight:700 }}>Select a conversation</div>
          </div>
        ) : (
          <>
            <div style={{ padding:'14px 20px', background:'#fff', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ fontWeight:900, fontSize:15 }}>{activeConv.customer_name}</div>
              {activeConv.customer_phone && <div style={{ fontSize:12, color:'#64748b' }}>{activeConv.customer_phone}</div>}
              <div style={{ fontSize:11, fontWeight:800, padding:'2px 10px', borderRadius:10, background: CHANNEL_COLORS[activeConv.channel]||'#64748b', color:'#fff', marginLeft:'auto' }}>{activeConv.channel}</div>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:10 }}>
              {messages.map(m => (
                <div key={m.id} style={{ display:'flex', justifyContent: m.sender_type==='staff' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth:'70%', padding:'10px 14px', borderRadius:14,
                    background: m.sender_type==='staff' ? '#0f172a' : '#fff',
                    color: m.sender_type==='staff' ? '#fff' : '#0f172a',
                    fontSize:13, boxShadow:'0 1px 4px rgba(0,0,0,0.07)',
                    borderBottomRightRadius: m.sender_type==='staff' ? 4 : 14,
                    borderBottomLeftRadius:  m.sender_type==='staff' ? 14 : 4 }}>
                    {m.body}
                    <div style={{ fontSize:10, opacity:0.5, marginTop:4, textAlign: m.sender_type==='staff' ? 'right' : 'left' }}>
                      {new Date(m.created_at).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div style={{ padding:16, background:'#fff', borderTop:'1px solid #e2e8f0', display:'flex', gap:10 }}>
              <input style={{ flex:1, padding:'11px 14px', borderRadius:12, border:'1px solid #e2e8f0', fontSize:13, outline:'none', fontFamily:'inherit' }}
                placeholder="Type a reply…" value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={e => e.key==='Enter' && sendReply()} />
              <button onClick={sendReply} disabled={loading}
                style={{ padding:'11px 20px', borderRadius:12, border:'none', background:'#0f172a', color:'#fff', fontWeight:800, cursor:'pointer', fontSize:13 }}>Send</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const calRef = useRef(null)

  const [bookings,        setBookings]        = useState([])
  const [technicians,     setTechnicians]     = useState([])
  const [services,        setServices]        = useState([])
  const [view,            setView]            = useState('calendar')
  const [showBooking,     setShowBooking]     = useState(false)
  const [editingId,       setEditingId]       = useState(null)
  const [showTechMgr,     setShowTechMgr]     = useState(false)
  const [showSvcMgr,      setShowSvcMgr]      = useState(false)
  const [showCapMgr,      setShowCapMgr]      = useState(false)
  const [showHours,       setShowHours]       = useState(false)
  const [capTech,         setCapTech]         = useState(null)
  const [capSelected,     setCapSelected]     = useState(new Set())
  const [techCaps,        setTechCaps]        = useState({})
  const [newTechName,     setNewTechName]     = useState('')
  const [newSvc,          setNewSvc]          = useState({ name:'', duration_minutes:60, price:'', category:'Nail Enhancements' })
  const [showCheckout,    setShowCheckout]    = useState(false)
  const [checkoutBooking, setCheckoutBooking] = useState(null)
  const [openingHours,    setOpeningHours]    = useState(DEFAULT_HOURS)
  const [svcSearch,       setSvcSearch]       = useState('')

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
  }

  // ── Calendar resources & events ─────────────────────────────────────────────
  const resources = technicians.map(t => ({ id: t.id, title: t.name }))

  const closedDayNames = openingHours.filter(h => !h.open).map(h => {
    const idx = DAYS.indexOf(h.day)
    return (idx + 1) % 7
  })

  const events = bookings.map(b => {
    const isCompleted  = b.status === 'completed'
    const isVisualiser = b.source === 'visualiser'
    let color
    if (isCompleted)       color = '#94a3b8'
    else if (isVisualiser) color = '#1e3a8a'
    else                   color = b.services?.color || CATEGORY_COLOR[b.services?.category] || '#94a3b8'

    let title = (b.customers?.full_name || 'Guest') + ' · ' + (b.services?.name || '')
    if (isVisualiser && b.ai_prediction) title = (b.customers?.full_name || 'Guest') + ' · ' + b.ai_prediction

    return {
      id:              b.id,
      resourceId:      b.technician_id,
      title,
      start:           b.start_time,
      end:             b.end_time,
      backgroundColor: color,
      borderColor:     color,
      textColor:       (isCompleted || isVisualiser) ? '#fff' : '#1e293b',
      editable:        !isCompleted,
      extendedProps:   b,
    }
  })

  // ── Opening hours → slot range ───────────────────────────────────────────────
  const openDays     = openingHours.filter(h => h.open)
  const earliestOpen = openDays.length ? openDays.reduce((a, b) => a.from < b.from ? a : b).from : '09:00'
  const latestClose  = openDays.length ? openDays.reduce((a, b) => a.to > b.to ? a : b).to   : '20:00'
  const slotMin      = earliestOpen + ':00'
  const slotMax      = latestClose  + ':00'

  // ── Date / slot click handlers ───────────────────────────────────────────────
  function handleDateClick(info) {
    const api = calRef.current?.getApi()
    if (api?.view.type === 'dayGridMonth') api.changeView('resourceTimeGridDay', info.dateStr)
  }

  function openCreate(info) {
    const api = calRef.current?.getApi()
    if (api?.view.type === 'dayGridMonth') return
    setEditingId(null)
    setSvcSearch('')
    setForm({ ...emptyForm, technician_id: info.resource?.id || '', start_time: info.startStr?.slice(0,16) || '' })
    setShowBooking(true)
  }

  function openEdit(info) {
    const b = info.event.extendedProps
    if (b.status === 'completed') {
      setCheckoutBooking(b)
      setShowCheckout(true)
      return
    }
    setEditingId(info.event.id)
    setSvcSearch('')
    const rawIds     = b.service_ids?.length ? b.service_ids : (b.service_id ? [b.service_id] : [])
    const existingIds = rawIds.filter(id => id && typeof id === 'string' && id.length > 0)
    setForm({
      full_name:     b.customers?.full_name || '',
      phone:         b.customers?.phone || '',
      email:         b.customers?.email || '',
      technician_id: b.technician_id,
      service_ids:   existingIds,
      start_time:    b.start_time ? new Date(b.start_time).toLocaleString('sv-SE', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }).slice(0,16).replace(' ', 'T') : '',
      notes:         b.notes || '',
    })
    setShowBooking(true)
  }

  // ── Save booking ─────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.full_name.trim())    { alert('Please enter the client name.'); return }
    if (!form.phone.trim())        { alert('Please enter a phone number.');  return }
    if (!form.technician_id)       { alert('Please select a technician.');   return }
    if (!form.service_ids?.length) { alert('Please select at least one service.'); return }
    if (!form.start_time)          { alert('Please set a start time.');      return }

    const selectedSvcs = (form.service_ids || []).map(id => services.find(s => s.id === id)).filter(Boolean)
    if (!selectedSvcs.length)      { alert('Please select at least one service.'); return }

    const primarySvc = selectedSvcs[0]
    const color      = primarySvc ? (primarySvc.color || CATEGORY_COLOR[primarySvc.category] || '#94a3b8') : '#94a3b8'
    const totalMins  = Math.max(15, selectedSvcs.reduce((sum, s) => sum + (s.duration_minutes || 60), 0))
    const [datePart, timePart] = form.start_time.split('T')
    const [year, month, day]   = datePart.split('-').map(Number)
    const [hours, minutes]     = timePart.split(':').map(Number)
    const start                = new Date(year, month - 1, day, hours, minutes)
    const end        = new Date(start.getTime() + totalMins * 60000)
    const svcTitle   = selectedSvcs.map(s => s.name).join(' + ')

    try {
      if (editingId) {
        // Optimistic update
        setBookings(prev => prev.map(b => b.id !== editingId ? b : {
          ...b,
          technician_id: form.technician_id,
          service_id:    primarySvc?.id,
          service_ids:   form.service_ids,
          start_time:    start.toISOString(),
          end_time:      end.toISOString(),
          notes:         form.notes,
          customers:     { ...b.customers, full_name: form.full_name, phone: form.phone, email: form.email },
          services:      primarySvc ? { ...primarySvc, color, name: svcTitle } : b.services,
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
          service_id:    primarySvc?.id,
          service_ids:   form.service_ids,
          start_time:    start.toISOString(),
          end_time:      end.toISOString(),
          notes:         form.notes,
        })
      } else {
        setShowBooking(false)
        const custRes = await axios.post(API + '/api/customers', {
          full_name: form.full_name, phone: form.phone, email: form.email || null
        })
        const bookRes = await axios.post(API + '/api/bookings', {
          customer_id:   custRes.data.id,
          technician_id: form.technician_id,
          service_id:    primarySvc?.id,
          service_ids:   form.service_ids,
          start_time:    start.toISOString(),
          end_time:      end.toISOString(),
          notes:         form.notes,
          source:        'manual',
        })
        setBookings(prev => [...prev, {
          ...bookRes.data,
          customers: { full_name: form.full_name, phone: form.phone, email: form.email },
          services:  primarySvc ? { ...primarySvc, color, name: svcTitle } : null,
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

  async function handleDrop(info) {
    const id = info.event.id, start = info.event.startStr, end = info.event.endStr
    const techId = info.event.getResources()[0]?.id
    setBookings(prev => prev.map(b => b.id !== id ? b : { ...b, start_time: start, end_time: end, technician_id: techId }))
    await axios.put(API + '/api/bookings/' + id, { start_time: start, end_time: end, technician_id: techId })
  }

  async function handleResize(info) {
    const id = info.event.id, end = info.event.endStr
    setBookings(prev => prev.map(b => b.id !== id ? b : { ...b, end_time: end }))
    await axios.put(API + '/api/bookings/' + id, { end_time: end })
  }

  // ── Technician CRUD ──────────────────────────────────────────────────────────
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

  // ── Service CRUD ─────────────────────────────────────────────────────────────
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

  // ── Capabilities ─────────────────────────────────────────────────────────────
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

  // ── Filtered services for booking modal ──────────────────────────────────────
  function filteredServices(techId) {
    const base = techId ? servicesForTech(techId) : services
    if (!svcSearch.trim()) return base
    return base.filter(s => s.name.toLowerCase().includes(svcSearch.toLowerCase()))
  }

  function saveHours(newHours) { setOpeningHours(newHours); setShowHours(false) }

  const grouped = CATEGORIES.map(cat => ({ ...cat, items: services.filter(s => s.category === cat.label) })).filter(g => g.items.length > 0)

  return (
    <div style={{ display:'flex', height:'100vh', fontFamily:'ui-sans-serif, system-ui, sans-serif', background:'#f8fafc', overflow:'hidden' }}>

      {/* ── Sidebar ── */}
      <div style={{ width:230, background:'#0f172a', color:'#fff', display:'flex', flexDirection:'column', flexShrink:0 }}>
        <div style={{ padding:'24px 20px 16px' }}>
          <div style={{ fontSize:22, fontWeight:900 }}>Orbit</div>
          <div style={{ fontSize:11, color:'#475569', marginTop:2, fontWeight:600 }}>Salon OS</div>
        </div>

        {/* Nav */}
        <div style={{ padding:'0 10px', marginBottom:8 }}>
          {[
            { id:'calendar', icon:'📅', label:'Calendar' },
            { id:'inbox',    icon:'💬', label:'Inbox' },
          ].map(n => (
            <button key={n.id} onClick={() => setView(n.id)}
              style={{ width:'100%', textAlign:'left', padding:'9px 12px', borderRadius:10, border:'none',
                background: view===n.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: view===n.id ? '#fff' : '#64748b', fontWeight:700, fontSize:13,
                cursor:'pointer', display:'flex', alignItems:'center', gap:9, marginBottom:2 }}>
              <span>{n.icon}</span>{n.label}
            </button>
          ))}
          <button onClick={() => setShowHours(true)}
            style={{ width:'100%', textAlign:'left', padding:'9px 12px', borderRadius:10, border:'none',
              background:'transparent', color:'#64748b', fontWeight:700, fontSize:13,
              cursor:'pointer', display:'flex', alignItems:'center', gap:9, marginBottom:2 }}>
            <span>🕐</span>Opening Hours
          </button>
        </div>

        <div style={{ height:1, background:'rgba(255,255,255,0.06)', margin:'4px 16px 12px' }} />

        <div style={{ padding:'0 20px', flex:1, overflowY:'auto' }}>
          {/* Technicians */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={{ fontSize:10, color:'#475569', fontWeight:800, textTransform:'uppercase', letterSpacing:1 }}>Technicians</div>
            <button onClick={() => setShowTechMgr(true)} style={{ fontSize:18, lineHeight:1, background:'none', border:'none', color:'#64748b', cursor:'pointer' }}>+</button>
          </div>
          {technicians.map(t => (
            <div key={t.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0' }}>
              <button onClick={() => openCapMgr(t)} style={{ background:'none', border:'none', color:'#cbd5e1', fontWeight:700, fontSize:13, cursor:'pointer', padding:0 }}>{t.name}</button>
              <button onClick={() => removeTechnician(t.id)} style={{ background:'none', border:'none', color:'#475569', cursor:'pointer', fontSize:12 }}>✕</button>
            </div>
          ))}

          <div style={{ height:1, background:'rgba(255,255,255,0.06)', margin:'14px 0' }} />

          {/* Services */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={{ fontSize:10, color:'#475569', fontWeight:800, textTransform:'uppercase', letterSpacing:1 }}>Services</div>
            <button onClick={() => setShowSvcMgr(true)} style={{ fontSize:18, lineHeight:1, background:'none', border:'none', color:'#64748b', cursor:'pointer' }}>+</button>
          </div>
          {grouped.map(g => (
            <div key={g.label} style={{ marginBottom:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                <div style={{ width:8, height:8, borderRadius:2, background:g.color, flexShrink:0 }} />
                <span style={{ fontSize:10, color:'#64748b', fontWeight:800, textTransform:'uppercase', letterSpacing:0.5 }}>{g.label}</span>
              </div>
              {g.items.map(s => (
                <div key={s.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'3px 0 3px 14px' }}>
                  <span style={{ fontSize:12, color:'#cbd5e1', fontWeight:600 }}>{s.name}</span>
                  <button onClick={() => removeService(s.id)} style={{ background:'none', border:'none', color:'#475569', cursor:'pointer', fontSize:11 }}>✕</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
        {view === 'calendar' && (
          <div style={{ flex:1, overflow:'auto', padding:24 }}>
            <style>{`
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
              .fc .fc-col-header-cell { font-weight: 800; font-size: 13px; padding: 8px 0; }
              .fc .fc-timegrid-slot-label { font-size: 11px; color: #94a3b8; }
              .fc .fc-daygrid-day-number { font-weight: 700; }
              ${closedDayNames.map(d => `.fc .fc-day[data-dow="${d}"] { background: #f1f5f9 !important; opacity: 0.6; }`).join('\n')}
            `}</style>
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
              allDaySlot={false}
              height="auto"
              headerToolbar={{ left:'prev,next today', center:'title', right:'resourceTimeGridDay,dayGridMonth' }}
            />
          </div>
        )}
        {view === 'inbox' && <InboxView />}
      </div>

      {/* ── Modals ── */}

      {showHours && (
        <OpeningHoursModal hours={openingHours} onSave={saveHours} onClose={() => setShowHours(false)} />
      )}

      {showCheckout && checkoutBooking && (
        <CheckoutModal
          booking={checkoutBooking}
          services={services}
          onClose={() => { setShowCheckout(false); setCheckoutBooking(null) }}
          onComplete={(id, closeModal = true) => {
            setBookings(prev => prev.map(b => b.id !== id ? b : { ...b, status:'completed' }))
            if (closeModal) { setShowCheckout(false); setCheckoutBooking(null) }
          }}
        />
      )}

      {showBooking && (
        <Modal title={editingId ? 'Edit Booking' : 'New Booking'} onClose={() => setShowBooking(false)}>
          <label style={lbl}>Client Name *</label>
          <input style={inp} value={form.full_name} onChange={e => setForm({...form, full_name:e.target.value})} placeholder="e.g. Ngoc Anh" />

          <label style={lbl}>Phone *</label>
          <input style={inp} type="tel" value={form.phone} onChange={e => setForm({...form, phone:e.target.value})} placeholder="e.g. 0912 345 678" />

          <label style={lbl}>Email (optional)</label>
          <input style={inp} type="email" value={form.email} onChange={e => setForm({...form, email:e.target.value})} placeholder="e.g. ngoc@email.com" />

          <label style={lbl}>Technician *</label>
          <select style={inp} value={form.technician_id} onChange={e => setForm({...form, technician_id:e.target.value, service_ids:[]})}>
            <option value=''>Select technician…</option>
            {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>

          <label style={lbl}>Service *</label>
          <input
            style={{ ...inp, marginBottom:6, background:'#f8fafc' }}
            value={svcSearch}
            onChange={e => setSvcSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
            placeholder="🔍  Search services…"
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
                    {selected && <span style={{ color:'#fff', fontSize:11, fontWeight:900 }}>✓</span>}
                  </div>
                  <span style={{ flex:1, fontWeight: selected ? 700 : 500, color: selected ? '#1d4ed8' : '#0f172a' }}>{s.name}</span>
                  <span style={{ fontSize:12, color: selected ? '#3b82f6' : '#94a3b8', fontWeight:600 }}>£{s.price} · {s.duration_minutes}m</span>
                </div>
              )
            })}
          </div>

          {form.service_ids?.length > 0 && (() => {
            const sel  = form.service_ids.map(id => services.find(s => s.id === id)).filter(Boolean)
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

          <div style={{ display:'flex', gap:10, marginTop:20, flexWrap:'nowrap' }}>
            <button onClick={handleSave} style={{...btnPrimary, flex:1}}>Save Booking</button>
            {editingId && (
              <button onClick={() => {
                const b = bookings.find(b => b.id === editingId)
                setShowBooking(false)
                setCheckoutBooking(b)
                setShowCheckout(true)
              }} style={{...btnGreen, flex:1}}>Checkout</button>
            )}
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
    </div>
  )
}