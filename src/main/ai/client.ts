import type { AIConfig, AIConfigInput, ChatMessage, ChatRequest } from '@shared/types'
import { getDatabase } from '../db'
import { getAllSettings, setSetting } from '../db/repo/settings'
import { clearSecret, hasSecret, readSecret, saveSecret } from '../security/secrets'
import { AppError, fail } from '../ipc/errors'

const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1'
const DEFAULT_MODEL = 'deepseek-chat'
const DEFAULT_TEMPERATURE = 0.7
const DEFAULT_MAX_TOKENS = 4096

export function readAiConfig(): AIConfig {
  const settings = getAllSettings()
  const temperature = Number(settings['ai.temperature'])
  const maxTokens = Number(settings['ai.maxTokens'])
  const hasKey = hasSecret('ai.apiKey')
  return {
    baseUrl: settings['ai.baseUrl'] || DEFAULT_BASE_URL,
    model: settings['ai.model'] || DEFAULT_MODEL,
    temperature: Number.isFinite(temperature) ? temperature : DEFAULT_TEMPERATURE,
    maxTokens: Number.isInteger(maxTokens) && maxTokens > 0 ? maxTokens : DEFAULT_MAX_TOKENS,
    hasKey,
    configured: hasKey || Boolean(settings['ai.baseUrl']?.trim() && settings['ai.model']?.trim())
  }
}

export function saveAiConfig(input: AIConfigInput): AIConfig {
  endpoint(input.baseUrl)
  getDatabase().transaction(() => {
    setSetting('ai.baseUrl', input.baseUrl.trim())
    setSetting('ai.model', input.model.trim())
    setSetting('ai.temperature', String(input.temperature))
    setSetting('ai.maxTokens', String(input.maxTokens))
    const key = input.apiKey?.trim()
    if (key) saveSecret('ai.apiKey', key)
    else if (key === '') clearSecret('ai.apiKey')
  })()
  return readAiConfig()
}

function endpoint(baseUrl: string): string {
  let url: URL
  try { url = new URL(baseUrl.trim()) }
  catch { fail('AI_INVALID_URL', '请输入有效的 HTTP / HTTPS AI 接口地址。') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    fail('AI_INVALID_URL', 'AI 接口地址须使用 HTTP / HTTPS，并且不能包含用户名、密码或片段。')
  }
  const path = url.pathname.replace(/\/+$/, '')
  url.pathname = path.endsWith('/chat/completions') ? path : `${path}/chat/completions`
  return url.href
}

function snippet(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 240 ? `${clean.slice(0, 240)}…` : clean
}

async function call<T>(
  messages: ChatMessage[],
  options: { stream: boolean; temperature?: number; signal?: AbortSignal },
  consume: (response: Response, signal: AbortSignal) => Promise<T>
): Promise<T> {
  const config = readAiConfig()
  if (!config.configured) fail('AI_NOT_CONFIGURED', '请先在设置中保存 AI 接口地址和模型。')
  const key = readSecret('ai.apiKey')
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (key) headers.set('Authorization', `Bearer ${key}`)
  const controller = new AbortController()
  let timedOut = false
  const abort = (): void => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) controller.abort()
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, 120000)
  let response: Response | undefined
  try {
    controller.signal.throwIfAborted()
    response = await fetch(endpoint(config.baseUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model, messages, temperature: options.temperature ?? config.temperature,
        max_tokens: config.maxTokens, stream: options.stream
      }),
      signal: controller.signal
    })
    if (!response.ok) {
      const body = await response.text()
      fail('AI_REQUEST_FAILED', `AI 服务返回 ${response.status}：${snippet(body) || '无响应内容'}`)
    }
    const result = await consume(response, controller.signal)
    controller.signal.throwIfAborted()
    return result
  } catch (error) {
    if (controller.signal.aborted) fail('AI_ABORTED', timedOut ? 'AI 请求超时，已停止生成，请稍后重试。' : '已停止生成。')
    if (error instanceof AppError) throw error
    return fail('AI_NETWORK', `无法读取 AI 回复：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
    if (response?.body && !response.body.locked) await response.body.cancel().catch(() => undefined)
  }
}

export async function chatComplete(messages: ChatMessage[], temperature?: number): Promise<string> {
  return call(messages, { stream: false, temperature }, async response => {
    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] }
    const content = payload.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) fail('AI_EMPTY', 'AI 没有返回内容，请稍后重试。')
    return content.trim()
  })
}

export async function chatStream(request: ChatRequest, onDelta: (text: string) => void, signal?: AbortSignal): Promise<string> {
  return call(request.messages, { stream: true, temperature: request.temperature, signal }, async (response, activeSignal) => {
    if (!response.body) fail('AI_EMPTY', 'AI 没有返回可读取的数据流。')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let full = ''
    const consumeLine = (raw: string): boolean => {
      const line = raw.trim()
      if (!line.startsWith('data:')) return false
      const data = line.slice(5).trim()
      if (data === '[DONE]') return true
      if (!data) return false
      let parsed: { choices?: { delta?: { content?: string } }[] }
      try { parsed = JSON.parse(data) as typeof parsed }
      catch { return false }
      const delta = parsed.choices?.[0]?.delta?.content
      if (typeof delta === 'string' && delta) { full += delta; onDelta(delta) }
      return false
    }
    try {
      let completed = false
      while (!completed) {
        activeSignal.throwIfAborted()
        const { done, value } = await reader.read()
        activeSignal.throwIfAborted()
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) { if (consumeLine(line)) { completed = true; break } }
        if (done) { if (!completed) consumeLine(buffer); break }
      }
    } finally {
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
    if (!full.trim()) fail('AI_EMPTY', 'AI 没有返回内容，请稍后重试。')
    return full
  })
}

export async function testConnection(): Promise<string> {
  const reply = await chatComplete([
    { role: 'system', content: '你是连通性检测助手，只回复四个字。' },
    { role: 'user', content: '请回复：连接正常' }
  ], 0)
  return reply.slice(0, 40)
}

/** 从模型输出中提取 JSON 对象，容忍 ```json 围栏与前后说明文字。 */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) fail('AI_BAD_JSON', 'AI 返回的内容不是有效结构，请重试或换一个模型。')
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    fail('AI_BAD_JSON', 'AI 返回的 JSON 无法解析，请重试。')
  }
}
