/* global chrome, crypto */
import { hasPermission, httpsSite, inject, registerSite, revokeSite } from './site.js'

const host = 'com.workbase.vault'
const draftKey = tabId => `draft:${tabId}`
const inactive = { ok: false, message: '请打开受支持的 HTTPS 网站登录页。' }
const popupUrl = chrome.runtime.getURL('popup.html')
const actionTitle = 'WorkBase 密码库'

async function askWorkBase(request) {
  const result = await chrome.runtime.sendNativeMessage(host, request).catch(() => null)
  if (!result || result.code === 'VAULT_OFFLINE') {
    return { ok: false, message: '请打开 WorkBase，并在密码库中开启浏览器连接。' }
  }
  return result
}

async function clearDraft(tabId, origin) {
  const key = draftKey(tabId)
  await chrome.storage.session.remove(key)
  await chrome.alarms.clear(key)
  await setDraftIndicator(tabId, false)
  if (origin) await chrome.tabs.sendMessage(tabId, { type: 'draftCleared', origin }, { frameId: 0 }).catch(() => undefined)
}

async function setDraftIndicator(tabId, pending) {
  await Promise.allSettled([
    chrome.action.setBadgeText({ tabId, text: pending ? '存' : '' }),
    chrome.action.setTitle({ tabId, title: pending ? `${actionTitle} · 有登录信息待保存` : actionTitle })
  ])
}

async function readDraft(tabId) {
  const key = draftKey(tabId)
  const draft = (await chrome.storage.session.get(key))[key]
  if (!draft) return null
  if (draft.expires <= Date.now() || !(await hasPermission(httpsSite(draft.origin)))) {
    await clearDraft(tabId, draft.origin)
    return null
  }
  return draft
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name.startsWith('draft:')) void readDraft(Number(alarm.name.slice(6))).catch(() => undefined)
})
chrome.tabs.onRemoved.addListener(tabId => { void clearDraft(tabId).catch(() => undefined) })
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'complete') {
    void readDraft(tabId).then(draft => {
      if (draft) return setDraftIndicator(tabId, true)
    }).catch(() => undefined)
  }
})

chrome.permissions.onAdded.addListener(({ origins = [] }) => {
  for (const pattern of origins) {
    const site = httpsSite(pattern)
    if (!site || site.pattern !== pattern || pattern.includes('://*')) continue
    void registerSite(site).then(async () => {
      const tabs = await chrome.tabs.query({ url: pattern, active: true })
      await Promise.allSettled(tabs.filter(tab => tab.id !== undefined).map(tab => inject(tab.id)))
    }).catch(() => undefined)
  }
})

async function capture(message, origin, tabId) {
  const { username, password } = message
  if (typeof username !== 'string' || username.length < 1 || username.length > 512 ||
    typeof password !== 'string' || password.length < 1 || password.length > 4096) return inactive
  const check = await askWorkBase({ type: 'check', origin, username, password })
  if (!check.ok && check.code !== 'VAULT_LOCKED') return check
  if (check.ok && !check.changed) return { ok: true }
  const draft = { id: crypto.randomUUID(), origin, username, password, expires: Date.now() + 120000 }
  const key = draftKey(tabId)
  await chrome.storage.session.set({ [key]: draft })
  await chrome.alarms.create(key, { when: draft.expires })
  await Promise.allSettled([
    setDraftIndicator(tabId, true),
    chrome.tabs.sendMessage(tabId, { type: 'draftReady', origin }, { frameId: 0 })
  ])
  return { ok: true }
}

async function fromPage(message, sender) {
  const tabId = sender.tab?.id
  const site = httpsSite(sender.url)
  if (sender.frameId !== 0 || tabId === undefined || !site || sender.origin !== site.origin || !(await hasPermission(site))) return inactive
  if (message.type === 'capture') return capture(message, site.origin, tabId)
  if (message.type === 'draftStatus') return { ok: true, pending: (await readDraft(tabId))?.origin === site.origin }
  if (message.type === 'autoFill') return askWorkBase({ type: 'fill', origin: site.origin })
  return inactive
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return { tabId: tab?.id, site: httpsSite(tab?.url) }
}

async function fromPopup(message) {
  const { tabId, site } = await activeTab()
  if (tabId === undefined || tabId !== message.tabId) return inactive
  if (message.type === 'view') {
    const allowed = await hasPermission(site)
    if (allowed) {
      await registerSite(site)
      await inject(tabId).catch(() => undefined)
    }
    const draft = await readDraft(tabId)
    const status = await askWorkBase({ type: 'status' })
    const matches = allowed && status.unlocked ? await askWorkBase({ type: 'list', origin: site.origin }) : null
    return { ok: true, site, allowed, status, matches,
      draft: draft && { id: draft.id, origin: draft.origin, username: draft.username } }
  }
  if (message.type === 'save' || message.type === 'discard') {
    const draft = await readDraft(tabId)
    if (!draft || draft.id !== message.id) return { ok: false, message: '待保存账号已过期或已更新，请重新打开扩展。' }
    if (message.type === 'save') {
      const result = await askWorkBase({ type: 'save', origin: draft.origin, username: draft.username, password: draft.password })
      if (!result.ok) return result
    }
    if ((await readDraft(tabId))?.id === draft.id) await clearDraft(tabId, draft.origin)
    return { ok: true }
  }
  if (!site || site.origin !== message.origin || !(await hasPermission(site))) return inactive
  if (message.type === 'enable') {
    await registerSite(site)
    await inject(tabId)
  }
  else if (message.type === 'revoke') {
    await revokeSite(site)
    await readDraft(tabId)
  } else if (message.type === 'fill') {
    const target = await inject(tabId)
    const request = { type: 'findForm', origin: site.origin }
    if (!(await chrome.tabs.sendMessage(tabId, request, target))) {
      return { ok: false, message: '当前页面没有可填充的登录表单。' }
    }
    const result = await askWorkBase({ type: 'fill', origin: site.origin, id: message.id })
    if (!result.ok) return result
    if (!result.credential) return { ok: false, message: '这个账号已不存在，请刷新列表。' }
    const filled = await chrome.tabs.sendMessage(tabId, { ...request, type: 'fill', credential: result.credential }, target)
    if (!filled) return { ok: false, message: '登录表单已变化，请重新打开扩展。' }
  } else return inactive
  return { ok: true }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || sender.id !== chrome.runtime.id) return false
  const action = sender.url === popupUrl ? fromPopup(message) : fromPage(message, sender)
  void action.then(sendResponse, () => sendResponse({ ok: false, message: '页面或浏览器连接已变化，请重试。' }))
  return true
})
