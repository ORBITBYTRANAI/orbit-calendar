import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('[Orbit ErrorBoundary]', error, info)
  }
  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f8f8fc', fontFamily:'ui-sans-serif, system-ui, sans-serif', padding:24 }}>
        <div style={{ textAlign:'center', maxWidth:480 }}>
          <div style={{ fontSize:48, marginBottom:16 }}>⚠️</div>
          <div style={{ fontSize:22, fontWeight:800, color:'#0f172a', marginBottom:8 }}>Something went wrong</div>
          <div style={{ fontSize:14, color:'#64748b', marginBottom:28, lineHeight:1.6 }}>
            An unexpected error occurred. Please refresh the page — your data is safe.
          </div>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }}
            style={{ padding:'12px 28px', borderRadius:10, border:'none', background:'#0f172a', color:'#fff', fontWeight:800, cursor:'pointer', fontSize:14 }}
          >
            Refresh Page
          </button>
          {this.state.error && (
            <details style={{ marginTop:24, textAlign:'left', fontSize:11, color:'#94a3b8', background:'#f1f5f9', borderRadius:8, padding:12 }}>
              <summary style={{ cursor:'pointer', fontWeight:700 }}>Error details</summary>
              <pre style={{ marginTop:8, whiteSpace:'pre-wrap', wordBreak:'break-all' }}>{this.state.error.toString()}</pre>
            </details>
          )}
        </div>
      </div>
    )
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
