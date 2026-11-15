/* global chrome, document */
import { httpsSite } from './site.js'

const notice = document.querySelector('#notice')
const content = document.querySelector('#content')
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
const tabId = tab?.id
const send = (type, data) => chrome.runtime.sendMessage({ type, tabId, ...data })

function section(title, detail) {
  const panel = document.createElement('section')
  const heading = document.createElement('h2')
  heading.textContent = title
  panel.append(heading)
  if (detail) {
    const text = document.createElement('p')
    text.textContent = detail
    panel.append(text)
  }
  content.append(panel)
  return panel
}

function button(panel, label, action, style = '') {
  const control = document.createElement('button')
  control.textContent = label
  if (style) control.className = style
  control.addEventListener('click', async () => {
    control.disabled = true
    try { await action() }
    catch { notice.textContent = '操作未完成，请重新打开扩展再试。' }
    finally { control.disabled = false }
  })
  panel.append(control)
  return control
}

async function perform(type, data, success) {
  const result = await send(type, data)
  if (!result.ok) { notice.textContent = result.message; return }
  await render(success)
}

async function render(message = '') {
  const view = await send('view')
  content.replaceChildren()
  if (!view?.ok) { notice.textContent = view?.message ?? '无法读取当前页面。'; return }
  const { allowed, draft, matches, site, status } = view
  notice.textContent = message || (!status.ok ? status.message : !status.initialized ? '请先在 WorkBase 创建本地密码库。' :
    !status.unlocked ? '请先在 WorkBase 解锁密码库。' : '已连接到本地密码库。')

  if (draft) {
    const panel = section('待保存的登录', draft.origin)
    const identity = document.createElement('bdi')
    identity.textContent = draft.username
    panel.append(identity)
    if (status.unlocked) button(panel, '保存到 WorkBase', () => perform('save', { id: draft.id }, '已保存到密码库。'), 'primary')
    button(panel, '丢弃', () => perform('discard', { id: draft.id }, '已丢弃这次登录。'))
  }

  if (!site) {
    section('网站填充', '打开 HTTPS 网站的登录页面后，再点这个扩展。')
    return
  }
  if (!allowed) {
    const panel = section(site.origin, '此网站尚未授权。允许后，WorkBase 扩展可识别这个网站的登录表单。')
    button(panel, '允许此网站', async () => {
      const requested = httpsSite(site.origin)
      if (!(await chrome.permissions.request({ origins: [requested.pattern] }))) return
      await perform('enable', { origin: site.origin }, '已允许此网站。')
    }, 'primary')
    return
  }

  const empty = status.ok && !draft && !matches?.accounts?.length ? '此网站已授权。请在网页登录后，再点击本扩展确认保存。' : ''
  const panel = section(site.origin, matches && !matches.ok ? matches.message : empty)
  for (const account of matches?.accounts ?? []) {
    button(panel, `填充 ${account.username}`, () => perform('fill', { id: account.id, origin: site.origin }, '已填充，可以检查后登录。'), 'primary')
  }
  button(panel, '撤销此网站权限', () => perform('revoke', { origin: site.origin }, '已撤销网站权限。'))
}

await render().catch(() => { notice.textContent = '无法读取当前页面，请重新打开扩展。' })
