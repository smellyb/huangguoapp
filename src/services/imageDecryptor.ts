/**
 * 黄果短剧 - 官方图片解密服务 (AES-128-CBC NoPadding)
 * 
 * 官方图床 (pic.qnlycc.cn 等) 下发的图片资源经过 AES-128-CBC 加密存储。
 * 本模块基于 WebCrypto API 原生 AES-CBC 解密机制与 PKCS#7 补齐裁切算法，
 * 并支持透明嗅探（针对直接明文 CDN 响应无需解密）、内存级 Blob URL 缓存与请求排重。
 */

const KEY_STR = 'f5d965df75336270';
const IV_STR = '97b60394abc2fbe1';

const PKCS7_BLOCK = new Uint8Array(16).fill(16);
const utf8 = (text: string) => new TextEncoder().encode(text);

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
};
const DEFAULT_MIME = 'image/jpeg';

function getMimeFromUrl(url: string): string {
  const clean = String(url || '').split('?')[0].split('#')[0];
  const ext = clean.split('.').pop()?.toLowerCase() || '';
  return MIME_MAP[ext] || DEFAULT_MIME;
}

function sniffPlainImageMime(h: Uint8Array): string {
  if (h.length < 12) return '';
  const ascii = (from: number, to: number) => {
    let s = '';
    for (let i = from; i < to; i++) s += String.fromCharCode(h[i]);
    return s;
  };

  // JPEG
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return 'image/jpeg';
  // WebP
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  // PNG
  if (h[0] === 0x89 && ascii(1, 8) === 'PNG\r\n\x1a\n') return 'image/png';
  // GIF
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'image/gif';

  return '';
}

function getSubtleCrypto(): SubtleCrypto | null {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    return window.crypto.subtle;
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    return globalThis.crypto.subtle;
  }
  return null;
}

let cachedSubtleKey: CryptoKey | null = null;
async function getSubtleKey(subtle: SubtleCrypto): Promise<CryptoKey> {
  if (!cachedSubtleKey) {
    cachedSubtleKey = await subtle.importKey(
      'raw',
      utf8(KEY_STR),
      { name: 'AES-CBC' },
      false,
      ['encrypt', 'decrypt']
    );
  }
  return cachedSubtleKey;
}

/**
 * WebCrypto AES-CBC 原生解密算法 (模拟 NoPadding)
 */
async function decryptSubtle(cipherBytes: Uint8Array, subtle: SubtleCrypto): Promise<Uint8Array> {
  const len = cipherBytes.length;
  if (len < 16) throw new Error('Ciphertext too short');
  const alignedLen = (len + 15) & ~15;
  const key = await getSubtleKey(subtle);

  const full = new Uint8Array(alignedLen + 16);
  full.set(cipherBytes);

  const lastBlock = new Uint8Array(full.slice(alignedLen - 16, alignedLen));
  const padBlock = new Uint8Array(
    await subtle.encrypt({ name: 'AES-CBC', iv: lastBlock }, key, PKCS7_BLOCK)
  );
  full.set(padBlock.subarray(0, 16), alignedLen);

  const plain = new Uint8Array(
    await subtle.decrypt({ name: 'AES-CBC', iv: utf8(IV_STR) }, key, full)
  );

  return plain.length === len ? plain : plain.subarray(0, len);
}

// 内存缓存：原始图片 URL -> 解密后的 Blob Object URL
const decryptedUrlCache = new Map<string, string>();
const pendingDecryptions = new Map<string, Promise<string>>();

/**
 * 获取已解密的图片 Object URL (如果已经缓存)
 */
export function getCachedDecryptedUrl(rawUrl: string): string | undefined {
  if (!rawUrl) return undefined;
  return decryptedUrlCache.get(rawUrl);
}

/**
 * 下载并解密图片，返回可以在 <img> 标签中直接显示的 blob: URL
 */
export async function decryptCoverImage(url: string, timeoutMs = 12000): Promise<string> {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  // 如果已经是 data: 或 blob: 或以 svg 结尾的明文资源，直接返回
  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.endsWith('.svg') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('./')
  ) {
    return trimmed;
  }

  // 检查内存缓存
  const cached = decryptedUrlCache.get(trimmed);
  if (cached) return cached;

  // 检查是否有正在进行的下载解密任务 (排重)
  const existingPromise = pendingDecryptions.get(trimmed);
  if (existingPromise) return existingPromise;

  const subtle = getSubtleCrypto();
  if (!subtle) {
    console.warn('[imageDecryptor] SubtleCrypto not available in current environment');
    return trimmed;
  }

  const task = (async (): Promise<string> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const isNative =
        typeof window !== 'undefined' &&
        Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());

      const fetchUrl = !isNative && trimmed.includes('pic.qnlycc.cn')
        ? trimmed.replace(/^https?:\/\/pic\.qnlycc\.cn/, `${window.location.origin}/pic-hg`)
        : trimmed;

      const res = await fetch(fetchUrl, {
        method: 'GET',
        mode: 'cors',
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      let buffer: ArrayBuffer;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/html') && fetchUrl !== trimmed) {
        const directRes = await fetch(trimmed, {
          method: 'GET',
          mode: 'cors',
          signal: controller.signal,
        });
        if (!directRes.ok) throw new Error(`HTTP ${directRes.status}`);
        buffer = await directRes.arrayBuffer();
      } else {
        buffer = await res.arrayBuffer();
      }

      const bytes = new Uint8Array(buffer);
      if (bytes.length === 0 || bytes[0] === 0x3c) {
        throw new Error('Invalid image binary received');
      }

      // 嗅探是否已经是明文图片
      const plainMime = sniffPlainImageMime(bytes);
      let blob: Blob;

      if (plainMime) {
        blob = new Blob([bytes as unknown as BlobPart], { type: plainMime });
      } else {
        // 执行 AES-CBC 解密
        const plainBytes = await decryptSubtle(bytes, subtle);
        const mime = getMimeFromUrl(trimmed);
        blob = new Blob([plainBytes as unknown as BlobPart], { type: mime });
      }

      const objectUrl = URL.createObjectURL(blob);
      decryptedUrlCache.set(trimmed, objectUrl);
      return objectUrl;
    } finally {
      clearTimeout(timer);
    }
  })();

  pendingDecryptions.set(trimmed, task);

  try {
    return await task;
  } finally {
    pendingDecryptions.delete(trimmed);
  }
}
