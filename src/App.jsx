import React, { useEffect, useState } from 'react'
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
  const [sessionName, setSessionName] = useState('')
  const [hideChecked, setHideChecked] = useState(false)
  const availableCount = champions.filter(c => !checked.has(c.id)).length

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
  }, [])

  function toggle(id) {
    const next = new Set(checked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setChecked(next)
  }

  async function saveSession() {
    const name = sessionName || `Session ${new Date().toLocaleString()}`
    const payload = { checked: Array.from(checked) }
    const { data, error } = await supabase.from('sessions').insert([{ name, payload }])
    if (error) {
      alert('Save failed: ' + error.message)
    } else {
      setSessionName('')
      fetchSessions()
    }
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

  return (
    <div className="app">
      <header>
        <h1>Champ Pool <span className="available">({availableCount} available of {champions.length})</span></h1>
        <div className="controls">
          <input placeholder="Session name (optional)" value={sessionName} onChange={e => setSessionName(e.target.value)} />
          <button onClick={saveSession}>Save session</button>
          <button onClick={() => setChecked(new Set())}>Clear all</button>
          <label style={{marginLeft:8,display:'inline-flex',alignItems:'center',gap:8}}>
            <input type="checkbox" checked={hideChecked} onChange={e => setHideChecked(e.target.checked)} />
            Hide checked
          </label>
        </div>
      </header>

      <section className="grid">
        {champions.filter(c => !hideChecked || !checked.has(c.id)).map(c => (
          <ChampionCard key={c.id} champ={c} checked={checked.has(c.id)} onToggle={toggle} />
        ))}
      </section>

      <aside className="sessions">
        <h3>Saved Sessions</h3>
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
