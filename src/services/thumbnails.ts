import type { FileEntry } from '../types'
import { readBlob } from './workspace'
import { idbGet, idbSet } from './storage'
import { normalizePathKey } from './path-utils'

const LARGE_IMAGE_BYTES = 768 * 1024
const THUMBNAIL_SIZE = 360

export function shouldPreferThumbnail(file: FileEntry) {
  return (
    file.kind === 'image' &&
    normalizePathKey(file.path).startsWith('images/') &&
    file.size >= LARGE_IMAGE_BYTES
  )
}

export async function getImagePreviewUrl(file: FileEntry) {
  if (shouldPreferThumbnail(file)) {
    const thumbnail = await getOrCreateThumbnail(file)
    return {
      url: URL.createObjectURL(thumbnail),
      isThumbnail: true,
    }
  }

  const blob = await readBlob(file)
  return {
    url: URL.createObjectURL(blob),
    isThumbnail: false,
  }
}

async function getOrCreateThumbnail(file: FileEntry) {
  const cacheKey = `${file.path}:${file.size}:${file.lastModified ?? 0}`
  const cached = await idbGet<Blob>('thumbnails', cacheKey)
  if (cached) return cached

  const blob = await readBlob(file)
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(
    THUMBNAIL_SIZE / bitmap.width,
    THUMBNAIL_SIZE / bitmap.height,
    1,
  )
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    return blob
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const thumbnail = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result)
        else reject(new Error('缩略图生成失败。'))
      },
      'image/webp',
      0.82,
    )
  })
  await idbSet('thumbnails', cacheKey, thumbnail)
  return thumbnail
}
