import { supabase } from '../supabaseClient'

export async function createLiveSession({ checked, sessionName }) {
  const payload = { checked: Array.from(checked) }
  const name = sessionName.trim() || `Live ${new Date().toLocaleString()}`

  const { data, error } = await supabase
    .from('sessions')
    .insert([{ name, payload }])
    .select('slug, view_slug')
    .single()

  if (error) {
    console.error('createLiveSession error', error)
    throw error
  }

  return data ? { slug: data.slug, viewSlug: data.view_slug } : null
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

// Looks up a session by either its editor slug or its view-only slug.
// The view-only lookup deliberately omits the `slug` column from the
// response so an observer's client never receives the editor slug.
export async function loadLiveSessionBySlug(value) {
  if (!value) return null

  const { data: editorRow, error: editorError } = await supabase
    .from('sessions')
    .select('id, slug, view_slug, name, payload')
    .eq('slug', value)
    .maybeSingle()

  if (editorError) {
    console.error('Failed to load live session', editorError)
    return null
  }
  if (editorRow) {
    return { ...editorRow, role: 'editor' }
  }

  const { data: viewerRow, error: viewerError } = await supabase
    .from('sessions')
    .select('id, view_slug, name, payload')
    .eq('view_slug', value)
    .maybeSingle()

  if (viewerError) {
    console.error('Failed to load live session', viewerError)
    return null
  }
  if (!viewerRow) return null

  return { ...viewerRow, role: 'observer' }
}
