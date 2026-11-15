/* global chrome, URL, crypto, TextEncoder */

export function httpsSite(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    return { origin: url.origin, pattern: `https://${url.hostname}/*` }
  } catch { return null }
}

async function scriptId(site) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(site.pattern))
  return 'site-' + Array.from(new Uint8Array(hash).subarray(0, 16), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function hasPermission(site) {
  if (!site) return false
  const permissions = await chrome.permissions.getAll()
  return permissions.origins?.includes(site.pattern) ?? false
}

export async function registerSite(site) {
  const id = await scriptId(site)
  const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [id] })
  if (scripts.length) return
  try {
    await chrome.scripting.registerContentScripts([{ id, matches: [site.pattern], js: ['content.js'], runAt: 'document_idle' }])
  } catch (error) {
    if (!(await chrome.scripting.getRegisteredContentScripts({ ids: [id] })).length) throw error
  }
}

export async function revokeSite(site) {
  const id = await scriptId(site)
  await chrome.permissions.remove({ origins: [site.pattern] })
  const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [id] })
  if (scripts.length) await chrome.scripting.unregisterContentScripts({ ids: [id] })
}

export async function inject(tabId) {
  const [frame] = await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
  return { documentId: frame.documentId }
}
