import React, { useEffect, useState, useRef } from 'react'
import { supabase } from './supabaseClient'

function ChampionCard({ champ, checked, onToggle }) {
  return (
    <label className={`card ${checked ? 'checked' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(champ.id)}
      />
      <img src={champ.img} alt={champ.name} />
      <div className="name">{champ.name}</div>
    </label>
  )
}

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
  const availableCount = champions.filter(c => !checked.has(c.id)).length
  const liveChannelRef = useRef(null)
  const sessionQueryIdRef = useRef(null)

  useEffect(() => {
    let mounted = true
    async function fetchChamps() {
      try {
        const verRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json')
        const versions = await verRes.json()
        const version = versions[0]
        const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`)
        const data = await res.json()
        const list = Object.values(data.data).map(c => ({
          id: c.id,
          key: c.id,
          name: c.name,
          img: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${c.image.full}`
        }))
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
      fetchSessions()
    }
  }

  // create a live session row
  async function createLiveSession() {
    const payload = { checked: Array.from(checked) }
    const name = sessionName.trim() || `Live ${new Date().toLocaleString()}`
    // include owner if authenticated (otherwise null) to match RLS policies
    const owner = null
    // // reserved for future auth-backed ownership
    // try {
    //   const userRes = await supabase.auth.getUser()
    //   owner = userRes?.data?.user?.id ?? null
    // } catch (e) {
    //   // ignore -- unauthenticated
    // }
    const { data, error } = await supabase.from('sessions').insert([{ name, payload, owner }]).select().single()
    if (error) {
      console.error('createLiveSession error', error)
      alert('Failed to create live session: ' + error.message)
      return null
    }
    return data?.id ?? null
  }

  async function updateLiveSession(id, checkedSet) {
    if (!id) return
    const payload = { checked: Array.from(checkedSet) }
    const { error } = await supabase.from('sessions').update({ payload }).eq('id', id)
    if (error) console.error('updateLiveSession error', error)
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
        try {
          const arr = record?.payload?.checked || []
          setChecked(new Set(arr))
        } catch (e) { console.error('failed to apply realtime update', e) }
      })
    await channel.subscribe()
    liveChannelRef.current = channel
    return channel
  }

  async function handleShare() {
    if (!isLive) return
    const targetSessionId = liveSessionId ?? await createLiveSession()
    if (!targetSessionId) return
    setLiveSessionId(targetSessionId)
    const sessionPart = `?session=${targetSessionId}`
    const url = `${window.location.origin}${window.location.pathname}${sessionPart}`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Champ Pool Live Session', url })
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url)
        alert('Share URL copied to clipboard')
      } else {
        prompt('Copy this share URL', url)
      }
    } catch (e) {
      try { await navigator.clipboard.writeText(url); alert('Share URL copied to clipboard') } catch { alert('Unable to share') }
    }
  }

  async function loadLiveSessionById(sessionId) {
    const id = Number(sessionId)
    if (!sessionId || Number.isNaN(id)) return false

    const { data, error } = await supabase
      .from('sessions')
      .select('id, name, payload')
      .eq('id', id)
      .single()

    if (error || !data) {
      console.error('Failed to load live session', error)
      return false
    }

    setLiveSessionId(id)
    setSessionName(data.name || '')
    if (data.payload?.checked) setChecked(new Set(data.payload.checked))
    return true
  }

  async function fetchSessions() {
    const { data, error } = await supabase.from('sessions').select('*').order('created_at', { ascending: false })
    if (error) console.error(error)
    else setSessions(data || [])
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

  // when toggling live mode, create/join session and subscribe
  useEffect(() => {
    let mounted = true
    if (isLive) {
      ;(async () => {
        const urlSessionId = sessionQueryIdRef.current ? Number(sessionQueryIdRef.current) : null
        if (urlSessionId && !Number.isNaN(urlSessionId)) {
          const loaded = await loadLiveSessionById(urlSessionId)
          if (!mounted) return
          if (loaded) return
        }

        if (!liveSessionId) {
          const id = await createLiveSession()
          if (!mounted) return
          if (id) setLiveSessionId(id)
        }
      })()
    } else {
      if (liveChannelRef.current) {
        try { liveChannelRef.current.unsubscribe() } catch (e) {}
        liveChannelRef.current = null
      }
      setLiveSessionId(null)
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
        setChecked(new Set(data.payload.checked))
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
            </div>

            <button onClick={handleShare} disabled={!isLive} style={{marginLeft:8,opacity: isLive?1:0.5}}>Share</button>
          </div>
        </div>
      </header>

      {liveModalOpen && (
        <div className="modal-backdrop" onClick={cancelLiveToggle}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{pendingLiveState ? 'Start live session?' : 'Stop live session?'}</h3>
            <p>
              {pendingLiveState
                ? 'Turning on live mode creates a shareable session that updates in real time for anyone using the same link.'
                : 'Turning off live mode stops syncing this session to the shared room. Your checked list will stay local on this device.'}
            </p>

            {pendingLiveState && (
              <label className="modal-field">
                <span>Session name</span>
                <input
                  type="text"
                  value={sessionName}
                  onChange={e => setSessionName(e.target.value)}
                  placeholder="Friends draft night"
                />
              </label>
            )}

            <div className="modal-actions">
              <button className="secondary" onClick={cancelLiveToggle}>Cancel</button>
              <button className="primary" onClick={confirmLiveToggle}>
                {pendingLiveState ? 'Start live session' : 'Stop live session'}
              </button>
            </div>
          </div>
        </div>
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
