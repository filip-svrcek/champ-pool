import { supabase } from '../supabaseClient'

export async function createLiveSession({ checked, sessionName }) {
  const payload = { checked: Array.from(checked) }
  const name = sessionName.trim() || `Live ${new Date().toLocaleString()}`
  const owner = null

  const { data, error } = await supabase
    .from('sessions')
    .insert([{ name, payload, owner }])
    .select()
    .single()

  if (error) {
    console.error('createLiveSession error', error)
    throw error
  }

  return data?.id ?? null
}

export async function updateLiveSession(id, checkedSet) {
  if (!id) return

  const payload = { checked: Array.from(checkedSet) }
  const { error } = await supabase
    .from('sessions')
    .update({ payload })
    .eq('id', id)

  if (error) {
    console.error('updateLiveSession error', error)
  }
}

export async function loadLiveSessionById(sessionId) {
  const id = Number(sessionId)
  if (!sessionId || Number.isNaN(id)) return null

  const { data, error } = await supabase
    .from('sessions')
    .select('id, name, payload')
    .eq('id', id)
    .single()

  if (error || !data) {
    console.error('Failed to load live session', error)
    return null
  }

  return data
}

export async function fetchSessions() {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error(error)
    return []
  }

  return data || []
}
