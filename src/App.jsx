import React, { useEffect, useState, useRef } from 'react'
import ChampionCard from './components/ChampionCard'
import LiveSessionModal from './components/LiveSessionModal'
import Toast from './components/Toast'
import { fetchChampionList } from './lib/championData'
import {
  createLiveSession,
  fetchSessions,
  loadLiveSessionBySlug,
  updateLiveSession,
} from './lib/liveSession'
import { supabase } from './supabaseClient'

function getUrlSessionSlug() {
  const search = new URLSearchParams(window.location.search)
  return search.get('session') || null
}

export default function App() {
  const [champions, setChampions] = useState([])
  const [checked, setChecked] = useState(new Set())
  const [sessions, setSessions] = useState([])
  const [hideChecked, setHideChecked] = useState(false)
  const [isLive, setIsLive] = useState(() => getUrlSessionSlug() !== null)
  const [hydrated, setHydrated] = useState(false)
  const [liveSessionSlug, setLiveSessionSlug] = useState(getUrlSessionSlug)
  const [sessionName, setSessionName] = useState('')
  const [liveModalOpen, setLiveModalOpen] = useState(false)
  const [pendingLiveState, setPendingLiveState] = useState(false)
  const [toast, setToast] = useState('')
  const [liveStatus, setLiveStatus] = useState('offline')
  const [searchTerm, setSearchTerm] = useState('')
  const availableCount = champions.filter(c => !checked.has(c.id)).length
  const liveChannelRef = useRef(null)
  const sessionQuerySlugRef = useRef(getUrlSessionSlug())
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

    // mark hydration complete so autosave doesn't clobber loaded state
    setHydrated(true)
  }, [])
  // autosave current non-live state to localStorage
  useEffect(() => {
    if (isLive || !hydrated) return
    const payload = { checked: Array.from(checked), updated_at: new Date().toISOString() }
    try {
      localStorage.setItem('champ-pool.current', JSON.stringify(payload))
    } catch (e) { console.error(e) }
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
    if (isLive && liveSessionSlug) {
      updateLiveSession(liveSessionSlug, next)
    }
  }

  async function saveSession() {
    const name = `Session ${new Date().toLocaleString()}`
    const payload = { checked: Array.from(checked) }
    const { data, error } = await supabase.from('sessions').insert([{ name, payload }])
    if (error) {
      console.error('saveSession failed', error)
      alert('Save failed: ' + error.message)
    } else {
      fetchSessionsList()
    }
  }

  async function createSessionRoom() {
    try {
      const slug = await createLiveSession({ checked, sessionName })
      return slug
    } catch (error) {
      console.error('Failed to create live session', error)
      alert('Failed to create live session: ' + error.message)
      return null
    }
  }

  async function subscribeToLiveSession(slug) {
    if (!slug) return
    if (liveChannelRef.current) {
      try { await liveChannelRef.current.unsubscribe() } catch (e) { }
      liveChannelRef.current = null
    }
    const channel = supabase.channel(`realtime-sessions-${slug}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `slug=eq.${slug}` }, (payload) => {
        const record = payload?.new || payload?.record || payload
        try {
          const arr = record?.payload?.checked || []
          applyCheckedState(arr)
          setLiveStatus('connected')
        } catch (e) { console.error('failed to apply realtime update', e) }
      })

    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        setLiveStatus('connected')
      }
    })

    liveChannelRef.current = channel

    const { data, error } = await supabase.from('sessions').select('payload').eq('slug', slug).single()
    if (!error && data?.payload?.checked) {
      applyCheckedState(data.payload.checked)
      setLiveStatus('connected')
    } else if (error) {
      console.error('subscribeToLiveSession: initial fetch error', error)
    }

    return channel
  }

  async function handleShare() {
    if (!isLive) return
    const targetSessionSlug = liveSessionSlug ?? await createSessionRoom()
    if (!targetSessionSlug) return
    setLiveSessionSlug(targetSessionSlug)
    const sessionPart = `?session=${targetSessionSlug}`
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

  async function loadJoinedSession(sessionSlug) {
    const data = await loadLiveSessionBySlug(sessionSlug)
    if (!data) return false

    setLiveSessionSlug(sessionSlug)
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
    if (pendingLiveState && !sessionName.trim()) return
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

  const normalizedSearch = searchTerm.trim().toLowerCase()
  const filteredChampions = champions.filter((champ) => {
    const matchesSearch = !normalizedSearch ||
      champ.name.toLowerCase().includes(normalizedSearch) ||
      (champ.title && champ.title.toLowerCase().includes(normalizedSearch)) ||
      String(champ.id).includes(normalizedSearch)

    return matchesSearch && (!hideChecked || !checked.has(champ.id))
  })

  const sessionLabel = sessionName || (isLive ? 'Live session' : 'Local draft')
  const showSessionLabel = Boolean(sessionName)

  // when toggling live mode, create/join session and subscribe
  useEffect(() => {
    let mounted = true
    if (isLive) {
      setLiveStatus('connecting')
      ;(async () => {
        const urlSessionSlug = sessionQuerySlugRef.current
        if (urlSessionSlug) {
          const loaded = await loadJoinedSession(urlSessionSlug)
          if (!mounted) return
          if (loaded) {
            setLiveStatus('connected')
            return
          }
          // If the URL session slug exists but failed to load, do NOT auto-create a new session.
          // This avoids creating duplicates when the intent was to join a specific room.
          setLiveStatus('offline')
          setIsLive(false)
          return
        }

        if (!liveSessionSlug) {
          const slug = await createSessionRoom()
          if (!mounted) return
          if (slug) {
            setLiveSessionSlug(slug)
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
      setLiveSessionSlug(null)
      sessionQuerySlugRef.current = null
    }
    return () => { mounted = false }
  }, [isLive, liveSessionSlug])

  useEffect(() => {
    if (!liveSessionSlug) return
    let mounted = true
    ;(async () => {
      await subscribeToLiveSession(liveSessionSlug)
    })()
    return () => {
      mounted = false
      if (liveChannelRef.current) {
        try { liveChannelRef.current.unsubscribe() } catch (e) {}
        liveChannelRef.current = null
      }
    }
  }, [liveSessionSlug])

  return (
    <div className="app">
      <header>
        <div className="title-block">
          <h1>Champ Pool <span className="available">({availableCount} available of {champions.length})</span></h1>
          {showSessionLabel && <div className="session-pill">Session: {sessionLabel}</div>}
        </div>
        <div className="controls">
          <div className="control-row">
            <input
              className="search-input"
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search champions"
              aria-label="Search champions"
            />

            <div className="toggle-row">
              <div className="toggle-group">
                <label className="switch">
                  <input type="checkbox" checked={hideChecked} onChange={e => setHideChecked(e.target.checked)} />
                  <span className="slider" />
                </label>
                <span className="toggle-label">Hide checked</span>
              </div>

              <div className="toggle-group">
                <label className="switch">
                  <input type="checkbox" checked={isLive} onChange={e => openLiveToggleModal(e.target.checked)} />
                  <span className="slider" />
                </label>
                <span className="toggle-label">Live Session</span>
                <span className={`status-dot ${getLiveStatusLabel()}`} aria-label={`Live session status: ${getLiveStatusLabel()}`} />
              </div>

              <button onClick={handleShare} disabled={!isLive} className="invite-button">Invite</button>
            </div>
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
        {filteredChampions.map(c => (
          <ChampionCard key={c.id} champ={c} checked={checked.has(c.id)} onToggle={toggle} />
        ))}
        {!filteredChampions.length && (
          <div className="empty-state">No champions match your search.</div>
        )}
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
