import { extname } from 'node:path'
import { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, probeMediaFile, resolveAssetPath, type MediaKind } from './assets'
import { MEDIA_HASH_UNKNOWN, listMediaPendingHashes, setMediaFingerprint } from './db/repo/media'
import { logMain } from './log'

const BATCH_SIZE = 20
let backfill: Promise<void> | undefined

function kindOf(fileName: string): MediaKind | null {
  const extension = extname(fileName).toLowerCase()
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (VIDEO_EXTENSIONS.has(extension)) return 'video'
  return null
}

/**
 * 为升级前入库的素材补算去重指纹。
 * 算不出来（文件缺失、格式不支持）的记录写入不可用标记，避免每次启动反复重试。
 */
export function backfillMediaFingerprints(): Promise<void> {
  return backfill ??= fillMissingFingerprints().catch(error => {
    backfill = undefined
    throw error
  })
}

async function fillMissingFingerprints(): Promise<void> {
  let handled = 0
  for (;;) {
    const batch = listMediaPendingHashes(BATCH_SIZE)
    if (!batch.length) break
    for (const task of batch) {
      const kind = kindOf(task.fileName)
      const file = kind ? resolveAssetPath('media', `/${task.fileName}`) : null
      if (!kind || !file) {
        setMediaFingerprint(task.id, MEDIA_HASH_UNKNOWN, '')
        continue
      }
      try {
        const probe = await probeMediaFile(file, kind)
        setMediaFingerprint(task.id, probe.contentHash, probe.visualHash)
      } catch {
        setMediaFingerprint(task.id, MEDIA_HASH_UNKNOWN, '')
      }
    }
    handled += batch.length
    // 让出事件循环，启动阶段不长时间占满主进程。
    await new Promise(resolve => setImmediate(resolve))
  }
  if (handled) logMain(`Media fingerprint backfill finished for ${handled} items`)
}
