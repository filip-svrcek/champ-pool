import React, { useEffect, useState, useRef } from 'react'
import ChampionCard from './components/ChampionCard'
import LiveSessionModal from './components/LiveSessionModal'
import Toast from './components/Toast'
import { fetchChampionList } from './lib/championData'
import {
  createLiveSession,
  fetchSessions,
  loadLiveSessionById,
  updateLiveSession,
} from './lib/liveSession'
import { supabase } from './supabaseClient'

export default function App() {
  const [champions, setChampions] = useState([])
  const [checked, setChecked] = useState(new Set())
  const [sessions, setSessions] = useState([])
  const [hideChecked, setHideChecked] = useState(false)
  const [isLive, setIsLive] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [liveSessionId, setLiveSessionId] = useState(null)
  const [sessionName, setSessionName] = useState('')
  const [liveModalOpen, setLiveModalOpen] = useState(false)
  const [pendingLiveState, setPendingLiveState] = useState(false)
  const [toast, setToast] = useState('')
  const [liveStatus, setLiveStatus] = useState('offline')
  const availableCount = champions.filter(c => !checked.has(c.id)).length
  const liveChannelRef = useRef(null)
  const sessionQueryIdRef = useRef(null)
  const toastTimeoutRef = useRef(null)

  useEffect(() => {
    let mounted = true
    async function fetchChamps() {
      try {
        const list = await fetchChampionList()
        if (mounted) setChampions(list)
      } catch (e) {
        console.error('Failed to fetch champions', e)
      }
    }
    fetchChamps()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    fetchSessions()
    try {
      const cur = JSON.parse(localStorage.getItem('champ-pool.current') || 'null')
      if (cur && cur.checked && !isLive) setChecked(new Set(cur.checked))
    } catch (e) {
      console.error('localStorage read failed', e)
    }

    const search = new URLSearchParams(window.location.search)
    const sessionQueryId = search.get('session')
    if (sessionQueryId) {
      sessionQueryIdRef.current = sessionQueryId
      const id = Number(sessionQueryId)
      if (!Number.isNaN(id)) {
        setLiveSessionId(id)
        setIsLive(true)
      }
    }

    // mark hydration complete so autosave doesn't clobber loaded state
    setHydrated(true)
  }, [])
  // autosave current non-live state to localStorage
  useEffect(() => {
    if (isLive || !hydrated) return
    const payload = { checked: Array.from(checked), updated_at: new Date().toISOString() }
    try { localStorage.setItem('champ-pool.current', JSON.stringify(payload)) } catch (e) { console.error(e) }
  }, [checked, isLive, hydrated])

  

  function applyCheckedState(nextList) {
    const normalized = Array.isArray(nextList) ? nextList : []
    setChecked(new Set(normalized))
  }

  function toggle(id) {
    const next = new Set(checked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setChecked(next)
    // if live, push update
    if (isLive && liveSessionId) updateLiveSession(liveSessionId, next)
  }

  async function saveSession() {
    const name = `Session ${new Date().toLocaleString()}`
    const payload = { checked: Array.from(checked) }
    const { data, error } = await supabase.from('sessions').insert([{ name, payload }])
    if (error) {
      alert('Save failed: ' + error.message)
    } else {
      fetchSessionsList()
    }
  }

  async function createSessionRoom() {
    try {
      return await createLiveSession({ checked, sessionName })
    } catch (error) {
      alert('Failed to create live session: ' + error.message)
      return null
    }
  }

  async function subscribeToLiveSession(id) {
    if (!id) return
    if (liveChannelRef.current) {
      try { await liveChannelRef.current.unsubscribe() } catch (e) { }
      liveChannelRef.current = null
    }
    const channel = supabase.channel(`realtime-sessions-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `id=eq.${id}` }, (payload) => {
        const record = payload?.new || payload?.record || payload
        console.log('Realtime payload received', { payload, record })
        try {
          const arr = record?.payload?.checked || []
          applyCheckedState(arr)
          setLiveStatus('connected')
        } catch (e) { console.error('failed to apply realtime update', e) }
      })

    channel.subscribe((status, err) => {
      console.log('Realtime subscription status', { id, status, err })
      if (status === 'SUBSCRIBED') {
        setLiveStatus('connected')
      }
    })

    liveChannelRef.current = channel

    const { data, error } = await supabase.from('sessions').select('payload').eq('id', id).single()
    if (!error && data?.payload?.checked) {
      applyCheckedState(data.payload.checked)
      setLiveStatus('connected')
    }

    return channel
  }

  async function handleShare() {
    if (!isLive) return
    const targetSessionId = liveSessionId ?? await createSessionRoom()
    if (!targetSessionId) return
    setLiveSessionId(targetSessionId)
    const sessionPart = `?session=${targetSessionId}`
    const url = `${window.location.origin}${window.location.pathname}${sessionPart}`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Champ Pool Live Session', url })
        showToast('Invite ready')
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url)
        showToast('Invite link copied')
      } else {
        prompt('Copy this invite link', url)
        showToast('Invite link ready')
      }
    } catch (e) {
      try {
        await navigator.clipboard.writeText(url)
        showToast('Invite link copied')
      } catch {
        showToast('Unable to copy invite')
      }
    }
  }

  async function loadJoinedSession(sessionId) {
    const data = await loadLiveSessionById(sessionId)
    if (!data) return false

    setLiveSessionId(Number(sessionId))
    setSessionName(data.name || '')
    if (data.payload?.checked) applyCheckedState(data.payload.checked)
    return true
  }

  async function fetchSessionsList() {
    const nextSessions = await fetchSessions()
    setSessions(nextSessions)
  }

  function loadSession(s) {
    try {
      const arr = s.payload?.checked || []
      setChecked(new Set(arr))
    } catch (e) {
      console.error(e)
    }
  }

  function openLiveToggleModal(nextValue) {
    if (nextValue === isLive) return
    setPendingLiveState(nextValue)
    setLiveModalOpen(true)
  }

  function confirmLiveToggle() {
    setIsLive(pendingLiveState)
    setLiveModalOpen(false)
  }

  function cancelLiveToggle() {
    setLiveModalOpen(false)
    setPendingLiveState(false)
  }

  function showToast(message) {
    setToast(message)
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = window.setTimeout(() => setToast(''), 2200)
  }

  function getLiveStatusLabel() {
    if (!isLive) return 'offline'
    return liveStatus === 'connecting' ? 'syncing' : 'connected'
  }

  // when toggling live mode, create/join session and subscribe
  useEffect(() => {
    let mounted = true
    if (isLive) {
      setLiveStatus('connecting')
      ;(async () => {
        const urlSessionId = sessionQueryIdRef.current ? Number(sessionQueryIdRef.current) : null
        if (urlSessionId && !Number.isNaN(urlSessionId)) {
          const loaded = await loadJoinedSession(urlSessionId)
          if (!mounted) return
          if (loaded) {
            setLiveStatus('connected')
            return
          }
        }

        if (!liveSessionId) {
          const id = await createSessionRoom()
          if (!mounted) return
          if (id) {
            setLiveSessionId(id)
            setLiveStatus('connected')
          }
        }
      })()
    } else {
      setLiveStatus('offline')
      if (liveChannelRef.current) {
        try { liveChannelRef.current.unsubscribe() } catch (e) {}
        liveChannelRef.current = null
      }
      setLiveSessionId(null)
      sessionQueryIdRef.current = null
    }
    return () => { mounted = false }
  }, [isLive, liveSessionId])

  useEffect(() => {
    if (!liveSessionId) return
    let mounted = true
    ;(async () => {
      await subscribeToLiveSession(liveSessionId)
      const { data, error } = await supabase.from('sessions').select('payload').eq('id', liveSessionId).single()
      if (!error && data?.payload?.checked) {
        applyCheckedState(data.payload.checked)
      }
      await updateLiveSession(liveSessionId, checked)
    })()
    return () => {
      mounted = false
      if (liveChannelRef.current) {
        try { liveChannelRef.current.unsubscribe() } catch (e) {}
        liveChannelRef.current = null
      }
    }
  }, [liveSessionId])

  return (
    <div className="app">
      <header>
        <h1>Champ Pool <span className="available">({availableCount} available of {champions.length})</span></h1>
        <div className="controls">
          <div style={{marginLeft:8,display:'inline-flex',alignItems:'center',gap:12}}>
            <div style={{display:'inline-flex',alignItems:'center',gap:8}}>
              <label className="switch">
                <input type="checkbox" checked={hideChecked} onChange={e => setHideChecked(e.target.checked)} />
                <span className="slider" />
              </label>
              <span style={{fontSize:13,color:'#94a3b8'}}>Hide checked</span>
            </div>

            <div style={{display:'inline-flex',alignItems:'center',gap:8}}>
              <label className="switch">
                <input type="checkbox" checked={isLive} onChange={e => openLiveToggleModal(e.target.checked)} />
                <span className="slider" />
              </label>
              <span style={{fontSize:13,color:'#94a3b8'}}>Live Session</span>
              <span className={`status-dot ${getLiveStatusLabel()}`} aria-label={`Live session status: ${getLiveStatusLabel()}`} />
            </div>

            <button onClick={handleShare} disabled={!isLive} style={{marginLeft:8,opacity: isLive?1:0.5}}>Invite</button>
          </div>
        </div>
      </header>

      <Toast message={toast} />

      {liveModalOpen && (
        <LiveSessionModal
          pendingLiveState={pendingLiveState}
          sessionName={sessionName}
          setSessionName={setSessionName}
          onCancel={cancelLiveToggle}
          onConfirm={confirmLiveToggle}
        />
      )}

      <section className="grid">
        {champions.filter(c => !hideChecked || !checked.has(c.id)).map(c => (
          <ChampionCard key={c.id} champ={c} checked={checked.has(c.id)} onToggle={toggle} />
        ))}
      </section>

      <aside className="sessions">
        <h3>Saved Sessions (Supabase)</h3>
        <ul>
          {sessions.map(s => (
            <li key={s.id}>
              <button onClick={() => loadSession(s)}>{s.name || s.id}</button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}
