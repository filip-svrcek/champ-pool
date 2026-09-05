import React, { useEffect, useState, useRef } from 'react'
import ChampionCard from './components/ChampionCard'
import FilterModal from './components/FilterModal'
import LiveSessionModal from './components/LiveSessionModal'
import Toast from './components/Toast'
import { fetchChampionList } from './lib/championData'
import {
  checkedMapToPayload,
  createLiveSession,
  loadLiveSessionBySlug,
  payloadToCheckedMap,
  updateLiveSession,
} from './lib/liveSession'
import { supabase } from './supabaseClient'

function getUrlSessionSlug() {
  const search = new URLSearchParams(window.location.search)
  return search.get('session') || null
}

export default function App() {
  const [champions, setChampions] = useState([])
  const [checked, setChecked] = useState(new Map())
  const [visibleStatuses, setVisibleStatuses] = useState({ available: true, picked: true, banned: true })
  const [filterModalOpen, setFilterModalOpen] = useState(false)
  const [isLive, setIsLive] = useState(() => getUrlSessionSlug() !== null)
  const [hydrated, setHydrated] = useState(false)
  const [liveSessionSlug, setLiveSessionSlug] = useState(getUrlSessionSlug)
  const [sessionRole, setSessionRole] = useState('editor')
  const [viewSlugForSharing, setViewSlugForSharing] = useState(null)
  const [sessionName, setSessionName] = useState('')
  const [liveModalOpen, setLiveModalOpen] = useState(false)
  const [pendingLiveState, setPendingLiveState] = useState(false)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
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
    try {
      const cur = JSON.parse(localStorage.getItem('champ-pool.current') || 'null')
      if (cur && !isLive) setChecked(payloadToCheckedMap(cur))
    } catch (e) {
      console.error('localStorage read failed', e)
    }

    // mark hydration complete so autosave doesn't clobber loaded state
    setHydrated(true)
  }, [])
  // autosave current non-live state to localStorage
  useEffect(() => {
    if (isLive || !hydrated) return
    const payload = { ...checkedMapToPayload(checked), updated_at: new Date().toISOString() }
    try {
      localStorage.setItem('champ-pool.current', JSON.stringify(payload))
    } catch (e) { console.error(e) }
  }, [checked, isLive, hydrated])



  function applyCheckedState(payload) {
    setChecked(payloadToCheckedMap(payload))
  }

  function setChampionType(id, type) {
    if (isLive && sessionRole === 'observer') return
    const next = new Map(checked)
    if (checked.get(id) === type) {
      // clicking the already-active option clears it back to available
      next.delete(id)
    } else {
      next.set(id, type)
    }
    setChecked(next)
    if (isLive && liveSessionSlug) {
      updateLiveSession(liveSessionSlug, next)
    }
  }

  async function createSessionRoom() {
    try {
      const created = await createLiveSession({ checked, sessionName })
      return created
    } catch (error) {
      console.error('Failed to create live session', error)
      alert('Failed to create live session: ' + error.message)
      return null
    }
  }

  async function subscribeToLiveSession(slug, role) {
    if (!slug) return
    if (liveChannelRef.current) {
      try { await liveChannelRef.current.unsubscribe() } catch (e) { }
      liveChannelRef.current = null
    }
    const column = role === 'observer' ? 'view_slug' : 'slug'
    const channel = supabase.channel(`realtime-sessions-${slug}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `${column}=eq.${slug}` }, (payload) => {
        const record = payload?.new || payload?.record || payload
        try {
          applyCheckedState(record?.payload)
          setLiveStatus('connected')
        } catch (e) { console.error('failed to apply realtime update', e) }
      })

    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        setLiveStatus('connected')
      }
    })

    liveChannelRef.current = channel

    const { data, error } = await supabase.from('sessions').select('payload').eq(column, slug).single()
    if (!error && data?.payload) {
      applyCheckedState(data.payload)
      setLiveStatus('connected')
    } else if (error) {
      console.error('subscribeToLiveSession: initial fetch error', error)
    }

    return channel
  }

  async function handleShare(linkType) {
    if (!isLive) return
    let editSlug = liveSessionSlug
    let viewSlug = viewSlugForSharing
    if (!editSlug) {
      const created = await createSessionRoom()
      if (!created) return
      editSlug = created.slug
      viewSlug = created.viewSlug
      setLiveSessionSlug(editSlug)
      setViewSlugForSharing(viewSlug)
      setSessionRole('editor')
    }

    const targetSlug = linkType === 'view' ? viewSlug : editSlug
    if (!targetSlug) return
    const label = linkType === 'view' ? 'View-only link' : 'Invite link'
    const sessionPart = `?session=${targetSlug}`
    const url = `${window.location.origin}${window.location.pathname}${sessionPart}`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Champ Pool Live Session', url })
        showToast(`${label} ready`)
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url)
        showToast(`${label} copied, send it to your friends!`)
      } else {
        prompt(`Copy this ${label.toLowerCase()}`, url)
        showToast(`${label} ready`)
      }
    } catch (e) {
      try {
        await navigator.clipboard.writeText(url)
        showToast(`${label} copied, send it to your friends!`)
      } catch {
        showToast(`Unable to copy ${label.toLowerCase()}, please copy it manually: ` + url)
      }
    }
  }

  async function loadJoinedSession(sessionSlug) {
    const data = await loadLiveSessionBySlug(sessionSlug)
    if (!data) return false

    setLiveSessionSlug(sessionSlug)
    setSessionRole(data.role)
    setViewSlugForSharing(data.role === 'editor' ? data.view_slug : null)
    setSessionName(data.name || '')
    if (data.payload) applyCheckedState(data.payload)
    return true
  }

  function clearAllChecked() {
    if (isLive && sessionRole === 'observer') return
    setChecked(new Map())
    if (isLive && liveSessionSlug) {
      updateLiveSession(liveSessionSlug, new Map())
    }
    showToast('Cleared all champions')
  }

  function handleClearAllClick() {
    if (isLive) {
      setClearConfirmOpen(true)
    } else {
      clearAllChecked()
    }
  }

  function confirmClearAll() {
    clearAllChecked()
    setClearConfirmOpen(false)
  }

  function cancelClearAll() {
    setClearConfirmOpen(false)
  }

  function openLiveToggleModal(nextValue) {
    if (nextValue === isLive) return
    if (nextValue) setSessionName('')
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

  function toggleVisibleStatus(key) {
    setVisibleStatuses(prev => ({ ...prev, [key]: !prev[key] }))
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
  const hiddenStatusCount = Object.values(visibleStatuses).filter(v => !v).length
  const isFilterActive = hiddenStatusCount > 0
  const filteredChampions = champions.filter((champ) => {
    const matchesSearch = !normalizedSearch ||
      champ.name.toLowerCase().includes(normalizedSearch) ||
      (champ.title && champ.title.toLowerCase().includes(normalizedSearch)) ||
      String(champ.id).includes(normalizedSearch)

    const category = checked.get(champ.id) || 'available'
    return matchesSearch && visibleStatuses[category]
  })

  const sessionLabel = sessionName || 'Live session'
  const showSessionLabel = isLive && Boolean(sessionName)

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
          showToast("Session not found — it may have been deleted")
          setLiveStatus('offline')
          setIsLive(false)
          return
        }

        if (!liveSessionSlug) {
          const created = await createSessionRoom()
          if (!mounted) return
          if (created) {
            setLiveSessionSlug(created.slug)
            setViewSlugForSharing(created.viewSlug)
            setSessionRole('editor')
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
      setSessionRole('editor')
      setViewSlugForSharing(null)
      sessionQuerySlugRef.current = null
    }
    return () => { mounted = false }
  }, [isLive, liveSessionSlug])

  useEffect(() => {
    if (!liveSessionSlug) return
    let mounted = true
    ;(async () => {
      await subscribeToLiveSession(liveSessionSlug, sessionRole)
    })()
    return () => {
      mounted = false
      if (liveChannelRef.current) {
        try { liveChannelRef.current.unsubscribe() } catch (e) {}
        liveChannelRef.current = null
      }
    }
  }, [liveSessionSlug, sessionRole])

  // keep the ?session= URL param in sync with the current live session,
  // so refreshing or copying the address bar resumes the right session
  useEffect(() => {
    const url = new URL(window.location.href)
    if (liveSessionSlug) {
      url.searchParams.set('session', liveSessionSlug)
    } else {
      url.searchParams.delete('session')
    }
    if (url.href !== window.location.href) {
      window.history.replaceState(null, '', url)
    }
  }, [liveSessionSlug])

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-top">
          <h1>Champ Pool <span className="available">({availableCount} available of {champions.length})</span></h1>
        </div>

        <div className="control-bar">
          <div className="control-cluster view-cluster">
            <input
              className="search-input"
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search champions"
              aria-label="Search champions"
            />

            <button
              onClick={() => setFilterModalOpen(true)}
              className="filter-button"
              aria-haspopup="dialog"
            >
              <svg
                className="filter-icon"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill={isFilterActive ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              Filter
            </button>

            <button onClick={handleClearAllClick} disabled={checked.size === 0 || (isLive && sessionRole === 'observer')} className="clear-button">Clear all</button>
          </div>

          <div className="control-cluster live-cluster">
            <div className="control-group">
              <label className="switch">
                <input type="checkbox" checked={isLive} onChange={e => openLiveToggleModal(e.target.checked)} />
                <span className="slider" />
              </label>
              <span className="toggle-label">Live Session</span>
              <span className={`status-dot ${getLiveStatusLabel()}`} aria-label={`Live session status: ${getLiveStatusLabel()}`} />
              {showSessionLabel && <span className="session-pill">{sessionLabel}</span>}
              {isLive && sessionRole === 'observer' && <span className="role-badge observer">Observer</span>}
            </div>

            {isLive && sessionRole === 'editor' && (
              <>
                <button onClick={() => handleShare('edit')} className="invite-button">Invite</button>
                <button onClick={() => handleShare('view')} className="invite-button">Invite (view only)</button>
              </>
            )}
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

      {filterModalOpen && (
        <FilterModal
          visibleStatuses={visibleStatuses}
          onToggleStatus={toggleVisibleStatus}
          onClose={() => setFilterModalOpen(false)}
        />
      )}

      {clearConfirmOpen && (
        <div className="modal-backdrop" onClick={cancelClearAll}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Clear all champions?</h3>
            <p>This clears the shared board for everyone in this live session right now, and can't be undone.</p>
            <div className="modal-actions">
              <button className="secondary" onClick={cancelClearAll}>Cancel</button>
              <button className="primary" onClick={confirmClearAll}>Clear all</button>
            </div>
          </div>
        </div>
      )}

      <section className="grid">
        {filteredChampions.map(c => (
          <ChampionCard
            key={c.id}
            champ={c}
            status={checked.get(c.id)}
            onSetType={setChampionType}
            disabled={isLive && sessionRole === 'observer'}
          />
        ))}
        {!filteredChampions.length && (
          <div className="empty-state">No champions match your search.</div>
        )}
      </section>
    </div>
  )
}
