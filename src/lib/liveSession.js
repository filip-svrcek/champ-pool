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

  return data?.slug ?? null
}

export async function updateLiveSession(slug, checkedSet) {
  if (!slug) return
  const payload = { checked: Array.from(checkedSet) }
  const { error } = await supabase
    .from('sessions')
    .update({ payload })
    .eq('slug', slug)

  if (error) {
    console.error('updateLiveSession error', error)
  }
}

export async function loadLiveSessionBySlug(slug) {
  if (!slug) return null
  const { data, error } = await supabase
    .from('sessions')
    .select('id, slug, name, payload')
    .eq('slug', slug)
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
    console.error('fetchSessions error', error)
    return []
  }

  return data || []
}
