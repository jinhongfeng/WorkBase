/* global chrome, document, URL, HTMLFormElement, HTMLInputElement, CSSStyleSheet, MutationObserver, Event, clearTimeout, setTimeout */

if (!globalThis.workbaseVaultActive) {
  globalThis.workbaseVaultActive = true
  startVault()
}

function startVault() {
  const attempted = new WeakSet()
  let timer
  let notice

  function visible(input) {
    return !input.matches(':disabled') && !input.readOnly && input.getClientRects().length > 0 &&
      input.checkVisibility({ visibilityProperty: true, opacityProperty: true })
  }

  function methodFor(form, submitter) {
    return submitter?.getAttribute('formmethod') ?? form.getAttribute('method')
  }

  function sameOriginTarget(form, submitter) {
    const target = submitter?.getAttribute('formtarget') ?? form.getAttribute('target') ?? document.querySelector('base[target]')?.getAttribute('target')
    const action = submitter?.getAttribute('formaction') ?? form.getAttribute('action')
    if (target && target.toLowerCase() !== '_self') return false
    try {
      const destination = new URL(action || document.URL, document.baseURI)
      return destination.origin === document.location.origin && !destination.username && !destination.password
    } catch { return false }
  }

  function formControls(form) {
    return Array.from(Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, 'elements').get.call(form))
  }

  function loginFields(form) {
    if (!(form instanceof HTMLFormElement)) return null
    const controls = formControls(form)
    const inputs = controls.filter(input => input instanceof HTMLInputElement && visible(input))
    const passwords = inputs.filter(input => input.type === 'password')
    if (passwords.length !== 1 || passwords[0].autocomplete.split(/\s+/).includes('new-password')) return null
    const usernames = inputs.filter(input => ['text', 'email', 'tel'].includes(input.type) && !input.autocomplete.split(/\s+/).includes('one-time-code'))
    const marked = usernames.filter(input => input.autocomplete.split(/\s+/).includes('username'))
    const candidates = marked.length ? marked : usernames
    return candidates.length === 1 ? { form, username: candidates[0], password: passwords[0] } : null
  }

  function fillableFields(form) {
    const fields = loginFields(form)
    if (!fields) return null
    const permitsFill = submitter => {
      if (!sameOriginTarget(form, submitter)) return false
      const method = methodFor(form, submitter)
      if (method?.toLowerCase() === 'post') return true
      // Unnamed controls are omitted from native submission. The page's own login handler can still read them.
      return method === null && !form.hasAttribute('action') && !submitter?.hasAttribute('formaction') &&
        !fields.username.name && !fields.password.name && fields.password.autocomplete.split(/\s+/).includes('current-password')
    }
    const submitters = formControls(form).filter(control => control.type === 'submit' && !control.matches(':disabled'))
    return permitsFill() && submitters.every(permitsFill) ? fields : null
  }

  function findForm() {
    const matches = Array.from(document.forms, fillableFields).filter(Boolean)
    return matches.length === 1 ? matches[0] : null
  }

  function fill(fields, credential) {
    if (!fields || !credential) return false
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(fields.username, credential.username)
    fields.username.dispatchEvent(new Event('input', { bubbles: true }))
    fields.username.dispatchEvent(new Event('change', { bubbles: true }))
    const updated = fillableFields(fields.form)
    if (!updated || updated.username !== fields.username || updated.password !== fields.password || !fields.password.isConnected) return false
    setter.call(fields.password, credential.password)
    fields.password.dispatchEvent(new Event('input', { bubbles: true }))
    fields.password.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }

  async function tryAutoFill() {
    if (document.visibilityState !== 'visible') return
    const fields = findForm()
    if (!fields || fields.username.value || fields.password.value || attempted.has(fields.form)) return
    attempted.add(fields.form)
    const result = await chrome.runtime.sendMessage({ type: 'autoFill' }).catch(() => null)
    const current = findForm()
    if (result?.credential && document.visibilityState === 'visible' && current?.form === fields.form && !current.username.value && !current.password.value) {
      fill(current, result.credential)
    }
  }

  function schedule() {
    clearTimeout(timer)
    timer = setTimeout(() => { void tryAutoFill() }, 120)
  }

  function showDraftNotice() {
    if (notice?.isConnected) return
    const host = document.createElement('div')
    const shadow = host.attachShadow({ mode: 'closed' })
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(`:host { all: initial; position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; pointer-events: none; }
      div { box-sizing: border-box; max-width: min(320px, calc(100vw - 40px)); padding: 12px 16px; border: 1px solid #35705d;
        border-radius: 10px; background: #14392e; color: #fff; font: 14px/1.5 system-ui, sans-serif; }`)
    shadow.adoptedStyleSheets = [sheet]
    const text = document.createElement('div')
    text.setAttribute('role', 'status')
    text.textContent = '有登录信息待保存。点击浏览器工具栏的 WorkBase 扩展确认。'
    shadow.append(text)
    document.documentElement.append(host)
    notice = host
    setTimeout(() => host.remove(), 8000)
  }

  document.addEventListener('submit', event => {
    if (!event.isTrusted) return
    const fields = loginFields(event.target)
    if (!fields?.username.value || !fields.password.value || !sameOriginTarget(fields.form, event.submitter)) return
    const message = { type: 'capture', username: fields.username.value, password: fields.password.value }
    const send = () => { void chrome.runtime.sendMessage(message).catch(() => undefined) }
    if (methodFor(fields.form, event.submitter)?.toLowerCase() === 'post') send()
    else setTimeout(() => { if (event.defaultPrevented) send() }, 0)
  }, true)

  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id || message.origin !== document.location.origin) return
    if (message.type === 'findForm') reply(Boolean(findForm()))
    if (message.type === 'fill') reply(fill(findForm(), message.credential))
    if (message.type === 'draftReady') showDraftNotice()
    if (message.type === 'draftCleared') notice?.remove()
  })

  new MutationObserver(schedule).observe(document, { childList: true, subtree: true })
  document.addEventListener('visibilitychange', schedule)
  document.addEventListener('focusin', schedule)
  void chrome.runtime.sendMessage({ type: 'draftStatus' }).then(result => {
    if (result?.pending) showDraftNotice()
  }).catch(() => undefined)
  schedule()
}
