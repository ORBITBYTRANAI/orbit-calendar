import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

const API = 'https://orbit-backend-production-e46d.up.railway.app'

const GOLD  = '#c9a96e'
const DARK  = '#1e1e2e'
const CARD  = '#ffffff'
const BG    = '#f8f7f5'
const TEXT  = '#1a1a2e'
const MUTED = '#64748b'

function fmt(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function dayName(d) {
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'short' })
}

export default function Analytics() {
  const [range, setRange]       = useState('last7')
  const [from, setFrom]         = useState('')
  const [to, setTo]             = useState('')
  const [bookings, setBookings] = useState([])
  const [technicians, setTechs] = useState([])
  const [services, setServices] = useState([])
  const [loading, setLoading]   = useState(true)
  const [aiRec, setAiRec]       = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  const getRangeDates = useCallback(() => {
    const now = new Date()
    if (range === 'last7') {
      const start = new Date(now); start.setDate(now.getDate() - 6); start.setHours(0,0,0,0)
      return { start, end: new Date(now.setHours(23,59,59,999)) }
    }
    if (range === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
      return { start, end }
    }
    if (range === 'custom' && from && to) {
      return { start: new Date(from + 'T00:00:00'), end: new Date(to + 'T23:59:59') }
    }
    return null
  }, [range, from, to])

  useEffect(() => {
    const dates = getRangeDates()
    if (!dates) return
    setLoading(true)
    Promise.all([
      axios.get(API + '/api/bookings'),
      axios.get(API + '/api/technicians'),
      axios.get(API + '/api/services'),
    ]).then(([bRes, tRes, sRes]) => {
      const all = bRes.data.filter(b => {
        const t = new Date(b.start_time)
        return t >= dates.start && t <= dates.end
      })
      setBookings(all)
      setTechs(tRes.data)
      setServices(sRes.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, from, to])

  // ── Derived stats ──────────────────────────────────────────────────────────

  const totalBookings = bookings.length
  const completed     = bookings.filter(b => b.status === 'confirmed' || b.status === 'completed').length
  const cancelled     = bookings.filter(b => b.status === 'cancelled').length

  // Bookings by day
  const byDay = {}
  bookings.forEach(b => {
    const d = new Date(b.start_time).toISOString().split('T')[0]
    byDay[d] = (byDay[d] || 0) + 1
  })
  const dayEntries = Object.entries(byDay).sort(([a],[b]) => a.localeCompare(b))
  const maxDay     = Math.max(...dayEntries.map(([,v]) => v), 1)
  const busiestDay = dayEntries.reduce((a, b) => b[1] > a[1] ? b : a, ['—', 0])

  // Technician performance
  const techMap = {}
  bookings.forEach(b => {
    const id   = b.technician_id
    const name = b.technicians?.name || 'Unassigned'
    if (!techMap[id]) techMap[id] = { name, count: 0 }
    techMap[id].count++
  })
  const techStats = Object.values(techMap).sort((a,b) => b.count - a.count)
  const maxTech   = Math.max(...techStats.map(t => t.count), 1)

  // Top services
  const svcMap = {}
  bookings.forEach(b => {
    const name = b.services?.name || 'Unknown'
    svcMap[name] = (svcMap[name] || 0) + 1
  })
  const topServices = Object.entries(svcMap).sort(([,a],[,b]) => b - a).slice(0, 5)

  // Source breakdown
  const srcMap = {}
  bookings.forEach(b => { srcMap[b.source || 'manual'] = (srcMap[b.source || 'manual'] || 0) + 1 })

  // ── AI Recommendations ─────────────────────────────────────────────────────

  async function fetchAiRec() {
    setAiLoading(true)
    setAiRec('')
    const summary = {
      period: range,
      totalBookings,
      completed,
      cancelled,
      busiestDay: busiestDay[0],
      busiestDayCount: busiestDay[1],
      topTechnician: techStats[0]?.name || 'N/A',
      topTechCount: techStats[0]?.count || 0,
      topServices: topServices.map(([name, count]) => ({ name, count })),
      bookingsByDay: dayEntries.map(([date, count]) => ({ date, count })),
      sources: srcMap,
    }
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `You are a nail salon business advisor. Based on this salon performance data, give 3-4 specific, actionable recommendations to help the owner grow bookings and improve performance. Focus ONLY on booking patterns, technician workload, service popularity, and customer acquisition channels. Do NOT mention, reference, or analyse revenue, income, pricing, or money in any way.

Salon data:
${JSON.stringify(summary, null, 2)}

Format your response as a numbered list. Each point should be 2-3 sentences. Be specific and practical.`
          }]
        })
      })
      const data = await res.json()
      setAiRec(data.content?.[0]?.text || 'Unable to generate recommendations.')
    } catch(_) {
      setAiRec('Unable to generate recommendations at this time.')
    }
    setAiLoading(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const rangeLabel = range === 'last7' ? 'Last 7 days' : range === 'month' ? 'This month' : (from && to ? fmt(from) + ' – ' + fmt(to) : 'Custom range')

  return (
    <div style={{ background: BG, minHeight: '100vh', padding: '24px', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>Analytics</h1>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{rangeLabel}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[['last7','Last 7 days'],['month','This month'],['custom','Custom']].map(([val,label]) => (
            <button key={val} onClick={() => setRange(val)} style={{
              padding: '8px 14px', borderRadius: 8, border: '1.5px solid',
              borderColor: range === val ? GOLD : '#e5e5e5',
              background: range === val ? GOLD : '#fff',
              color: range === val ? '#fff' : TEXT,
              fontWeight: 600, fontSize: 13, cursor: 'pointer'
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Custom date range */}
      {range === 'custom' && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 13, color: MUTED, fontWeight: 500 }}>From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              style={{ border: '1.5px solid #e5e5e5', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 13, color: MUTED, fontWeight: 500 }}>To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              style={{ border: '1.5px solid #e5e5e5', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none' }} />
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: MUTED }}>Loading...</div>
      ) : (
        <>
          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Total Bookings', value: totalBookings, icon: '📅' },
              { label: 'Completed',      value: completed,     icon: '✅' },
              { label: 'Cancelled',      value: cancelled,     icon: '❌' },
              { label: 'Busiest Day',    value: busiestDay[0] !== '—' ? dayName(busiestDay[0]) : '—', icon: '🔥', sub: busiestDay[1] > 0 ? busiestDay[1] + ' bookings' : '' },
            ].map(({ label, value, icon, sub }) => (
              <div key={label} style={{ background: CARD, borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: TEXT }}>{value}</div>
                {sub && <div style={{ fontSize: 12, color: GOLD, fontWeight: 600 }}>{sub}</div>}
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 24 }}>

            {/* Bookings by day chart */}
            <div style={{ background: CARD, borderRadius: 14, padding: 20, boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: TEXT, marginBottom: 16 }}>Bookings by Day</div>
              {dayEntries.length === 0 ? (
                <div style={{ color: MUTED, fontSize: 13 }}>No bookings in this period.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {dayEntries.map(([date, count]) => (
                    <div key={date} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 60, fontSize: 12, color: MUTED, flexShrink: 0 }}>{dayName(date)} {fmt(date)}</div>
                      <div style={{ flex: 1, background: '#f1f1f1', borderRadius: 6, overflow: 'hidden', height: 20 }}>
                        <div style={{ width: (count / maxDay * 100) + '%', background: GOLD, height: '100%', borderRadius: 6, transition: 'width .4s' }} />
                      </div>
                      <div style={{ width: 20, fontSize: 12, fontWeight: 700, color: TEXT, textAlign: 'right' }}>{count}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Technician performance */}
            <div style={{ background: CARD, borderRadius: 14, padding: 20, boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: TEXT, marginBottom: 16 }}>Technician Performance</div>
              {techStats.length === 0 ? (
                <div style={{ color: MUTED, fontSize: 13 }}>No data available.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {techStats.map((t, i) => (
                    <div key={t.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{i === 0 ? '🏆 ' : ''}{t.name}</span>
                        <span style={{ fontSize: 13, color: MUTED }}>{t.count} {t.count === 1 ? 'booking' : 'bookings'}</span>
                      </div>
                      <div style={{ background: '#f1f1f1', borderRadius: 6, overflow: 'hidden', height: 8 }}>
                        <div style={{ width: (t.count / maxTech * 100) + '%', background: i === 0 ? GOLD : '#d4b896', height: '100%', borderRadius: 6 }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top services */}
            <div style={{ background: CARD, borderRadius: 14, padding: 20, boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: TEXT, marginBottom: 16 }}>Top Services</div>
              {topServices.length === 0 ? (
                <div style={{ color: MUTED, fontSize: 13 }}>No data available.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {topServices.map(([name, count], i) => (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 22, height: 22, background: i === 0 ? GOLD : '#f1f1f1', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: i === 0 ? '#fff' : MUTED, flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: TEXT }}>{name}</div>
                      <div style={{ fontSize: 13, color: MUTED, fontWeight: 600 }}>{count}x</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Booking source */}
            <div style={{ background: CARD, borderRadius: 14, padding: 20, boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: TEXT, marginBottom: 16 }}>Booking Source</div>
              {Object.keys(srcMap).length === 0 ? (
                <div style={{ color: MUTED, fontSize: 13 }}>No data available.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Object.entries(srcMap).sort(([,a],[,b]) => b - a).map(([src, count]) => {
                    const icons = { manual: '🖥️', website_chat: '💬', ai_receptionist: '🤖', vapi: '📞' }
                    const labels = { manual: 'Walk-in / Staff', website_chat: 'Chat Widget', ai_receptionist: 'AI Receptionist', vapi: 'Voice' }
                    return (
                      <div key={src} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, color: TEXT }}>{icons[src] || '📌'} {labels[src] || src}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: GOLD }}>{count}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* AI Recommendations */}
          <div style={{ background: DARK, borderRadius: 14, padding: 24, boxShadow: '0 1px 6px rgba(0,0,0,.12)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: aiRec ? 16 : 0, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>🤖 AI Recommendations</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>Based on your booking data for this period</div>
              </div>
              <button onClick={fetchAiRec} disabled={aiLoading || totalBookings === 0} style={{
                background: GOLD, color: '#fff', border: 'none', borderRadius: 10,
                padding: '10px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                opacity: (aiLoading || totalBookings === 0) ? 0.5 : 1
              }}>
                {aiLoading ? 'Analysing...' : aiRec ? 'Refresh' : 'Get Recommendations'}
              </button>
            </div>
            {aiRec && (
              <div style={{ color: 'rgba(255,255,255,.85)', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {aiRec}
              </div>
            )}
            {!aiRec && !aiLoading && totalBookings === 0 && (
              <div style={{ color: 'rgba(255,255,255,.4)', fontSize: 13, marginTop: 8 }}>No booking data in this period to analyse.</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
