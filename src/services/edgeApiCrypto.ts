/**
 * 黄果短剧 - 官方边缘接口加密通信客户端 (dx150-edge-v1)
 *
 * 实现了 huangguoai.com 官方网站 `edge-api-crypto.js` 相同的
 * ECDH (P-256) + HKDF (SHA-256) + AES-GCM (256-bit) 边缘加密协议。
 *
 * 针对 `/api/playback/request` 播放流解析提供标准握手、会话保活复用
 * 与透明请求封包解密。
 */

export interface CdnAuthConfig {
  m3u8Enabled?: boolean;
  otherEnabled?: boolean;
  authKey?: string;
  authValue?: string;
  app?: string;
  imgEnabled?: boolean;
  imgAuthKey?: string;
  imgAuthValue?: string;
}

export interface PlaybackStreamResult {
  streamUrl: string;
  hevcUrl?: string;
  previewUrl?: string;
  cdn?: CdnAuthConfig;
  timestamp?: number;
  mode?: number;
  manifestMethod?: string;
}

interface EdgeSession {
  baseUrl: string;
  scope: string;
  info: string;
  kid: string;
  sid: string;
  clockOffset: number;
  expiresAt: number;
  sequence: number;
  requestKey: CryptoKey;
  responseKey: CryptoKey;
}

const PROTOCOL = 'dx150-edge-v1';
const MAX_SEQUENCE = 16384;
const sessions = new Map<string, EdgeSession>();
const pendingSessions = new Map<string, Promise<EdgeSession>>();

function encode64url(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode64(value: string, urlSafe = true): Uint8Array {
  const normalized = urlSafe ? value.replace(/-/g, '+').replace(/_/g, '/') : value;
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLen);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

function nonce(sequence: number): Uint8Array {
  const bytes = new Uint8Array(12);
  new DataView(bytes.buffer).setUint32(8, sequence, false);
  return bytes;
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

function normalizeEdgeBase(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  const isNative =
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());

  if (!isNative && trimmed.includes('huangguoai.com')) {
    return `${window.location.origin}/api-hg`;
  }
  return trimmed;
}

async function openSession(baseUrl: string, scope: 'playback' | 'user' | 'public' | 'dynamic'): Promise<EdgeSession> {
  const subtle = getSubtleCrypto();
  if (!subtle) {
    throw new Error('当前环境不支持 Web Cryptography API');
  }

  const normalizedBase = normalizeEdgeBase(baseUrl);
  const endpoint = `${normalizedBase}/api/${scope}/request`;

  const ecdh = { name: 'ECDH', namedCurve: 'P-256' } as const;
  const pair = await subtle.generateKey(ecdh, false, ['deriveBits']);
  const clientPub = await subtle.exportKey('raw', pair.publicKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  let hello: {
    v?: number;
    type?: string;
    kid?: string;
    sid?: string;
    site?: string;
    server_pub?: string;
    salt?: string;
    server_time?: number;
    expires_at?: number;
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        v: 1,
        type: 'hello',
        client_pub: encode64url(new Uint8Array(clientPub)),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`加密握手失败 (HTTP ${res.status})`);
    }

    hello = await res.json();
  } finally {
    clearTimeout(timer);
  }

  if (
    !hello ||
    hello.v !== 1 ||
    hello.type !== 'hello' ||
    typeof hello.kid !== 'string' ||
    typeof hello.sid !== 'string' ||
    typeof hello.site !== 'string' ||
    typeof hello.server_pub !== 'string' ||
    typeof hello.salt !== 'string' ||
    typeof hello.server_time !== 'number' ||
    typeof hello.expires_at !== 'number'
  ) {
    throw new Error('加密握手响应格式无效');
  }

  const serverPub = await subtle.importKey(
    'raw',
    decode64(hello.server_pub, true) as unknown as BufferSource,
    ecdh,
    false,
    []
  );
  const shared = await subtle.deriveBits({ name: 'ECDH', public: serverPub }, pair.privateKey, 256);
  const hkdf = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  const salt = decode64(hello.salt, true);
  const info = [PROTOCOL, scope, hello.site, hello.kid, hello.sid].join('\n');

  const encoder = new TextEncoder();
  async function deriveKey(direction: 'req' | 'res', usage: KeyUsage) {
    return subtle!.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: salt as unknown as BufferSource,
        info: encoder.encode(`${info}\n${direction}`) as unknown as BufferSource,
      },
      hkdf,
      { name: 'AES-GCM', length: 256 },
      false,
      [usage]
    );
  }

  const [requestKey, responseKey] = await Promise.all([
    deriveKey('req', 'encrypt'),
    deriveKey('res', 'decrypt'),
  ]);

  const localTime = Math.floor(Date.now() / 1000);
  const clockOffset = hello.server_time - localTime;
  const expiresAt = localTime + (hello.expires_at - hello.server_time);

  const session: EdgeSession = {
    baseUrl: normalizedBase,
    scope,
    info,
    kid: hello.kid,
    sid: hello.sid,
    clockOffset,
    expiresAt,
    sequence: 0,
    requestKey,
    responseKey,
  };

  return session;
}

function getSession(baseUrl: string, scope: 'playback' | 'user' | 'public' | 'dynamic'): Promise<EdgeSession> {
  const normalizedBase = normalizeEdgeBase(baseUrl);
  const key = `${scope}::${normalizedBase}`;
  const existing = sessions.get(key);
  const now = Math.floor(Date.now() / 1000);

  if (existing && existing.expiresAt > now + 8 && existing.sequence < MAX_SEQUENCE) {
    return Promise.resolve(existing);
  }

  const ongoing = pendingSessions.get(key);
  if (ongoing) return ongoing;

  const promise = openSession(normalizedBase, scope)
    .then((sess) => {
      sessions.set(key, sess);
      return sess;
    })
    .finally(() => {
      pendingSessions.delete(key);
    });

  pendingSessions.set(key, promise);
  return promise;
}

export async function callEncryptedApi<T = unknown>(
  baseUrl: string,
  scope: 'playback' | 'user' | 'public' | 'dynamic',
  request: {
    method: string;
    path: string;
    body?: string;
    contentType?: string;
  }
): Promise<T> {
  const subtle = getSubtleCrypto();
  if (!subtle) {
    throw new Error('当前环境缺少 Web Cryptography 支持');
  }

  const session = await getSession(baseUrl, scope);
  const sequence = ++session.sequence;
  if (sequence > MAX_SEQUENCE) {
    const key = `${scope}::${session.baseUrl}`;
    sessions.delete(key);
    return callEncryptedApi(baseUrl, scope, request);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const timestamp = Math.floor(Date.now() / 1000) + session.clockOffset;
  const iv = nonce(sequence);

  const params: AesGcmParams = {
    name: 'AES-GCM',
    iv: iv as unknown as BufferSource,
    additionalData: encoder.encode([session.info, 'req', sequence, timestamp].join('\n')) as unknown as BufferSource,
  };

  const innerReq = {
    method: request.method,
    path: request.path,
    body: request.body || '',
    content_type: request.contentType || 'application/json',
  };

  const packet = { request: innerReq };
  const encrypted = await subtle.encrypt(
    params,
    session.requestKey,
    encoder.encode(JSON.stringify(packet)) as unknown as BufferSource
  );

  const endpoint = `${session.baseUrl}/api/${scope}/request`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      v: 1,
      type: 'call',
      kid: session.kid,
      sid: session.sid,
      seq: sequence,
      ts: timestamp,
      ciphertext: encode64url(new Uint8Array(encrypted)),
    }),
  });

  if (!res.ok) {
    const failure = await res.json().catch(() => null);
    if (failure?.error === 'session_expired') {
      const key = `${scope}::${session.baseUrl}`;
      if (sessions.get(key) === session) sessions.delete(key);
    }
    throw new Error(`加密接口请求失败 (HTTP ${res.status})`);
  }

  const result = await res.json();
  if (
    !result ||
    result.v !== 1 ||
    result.type !== 'result' ||
    result.sid !== session.sid ||
    result.kid !== session.kid ||
    result.seq !== sequence ||
    result.ts !== timestamp
  ) {
    throw new Error('加密接口响应不匹配');
  }

  const resParams: AesGcmParams = {
    name: 'AES-GCM',
    iv: iv as unknown as BufferSource,
    additionalData: encoder.encode([session.info, 'res', sequence, timestamp].join('\n')) as unknown as BufferSource,
  };

  const plaintext = await subtle.decrypt(
    resParams,
    session.responseKey,
    decode64(result.ciphertext, true) as unknown as BufferSource
  );

  const inner = JSON.parse(decoder.decode(plaintext)) as {
    status: number;
    headers?: Record<string, string[]>;
    body?: string;
  };

  if (!inner || typeof inner.status !== 'number' || inner.status < 200 || inner.status > 599) {
    throw new Error('加密解密响应状态无效');
  }

  if (inner.status >= 400) {
    let errorMsg = `加密接口返回错误 HTTP ${inner.status}`;
    if (inner.body) {
      try {
        const bodyObj = JSON.parse(atob(inner.body));
        if (bodyObj?.msg || bodyObj?.error) {
          errorMsg = bodyObj.msg || bodyObj.error;
        }
      } catch {
        // use default error message
      }
    }
    throw new Error(errorMsg);
  }

  if (!inner.body) {
    return {} as T;
  }

  const decodedBody = atob(inner.body);
  return JSON.parse(decodedBody) as T;
}

/**
 * 通过 dx150-edge-v1 边缘加密通道请求黄果官方短剧播放流
 */
export async function resolveEncryptedPlayback(
  baseUrl: string,
  dramaId: string,
  episodeNumber: number
): Promise<PlaybackStreamResult | null> {
  try {
    const path = `/api/videos/${encodeURIComponent(dramaId)}/episodes/${episodeNumber}/playback`;
    const payload = await callEncryptedApi<{
      status: number;
      msg?: string;
      data?: {
        mode?: number;
        timestamp?: number;
        manifest_method?: string;
        streams?: {
          main?: string;
          hevc?: string;
          preview?: string;
        };
        cdn?: CdnAuthConfig;
      };
    }>(baseUrl, 'playback', {
      method: 'POST',
      path,
      body: '',
      contentType: 'application/json',
    });

    if (payload?.status === 1 && payload.data?.streams) {
      const streamUrl = payload.data.streams.main || payload.data.streams.preview || payload.data.streams.hevc;
      if (streamUrl) {
        return {
          streamUrl,
          hevcUrl: payload.data.streams.hevc,
          previewUrl: payload.data.streams.preview,
          cdn: payload.data.cdn,
          timestamp: payload.data.timestamp,
          mode: payload.data.mode,
          manifestMethod: payload.data.manifest_method,
        };
      }
    }
  } catch (err) {
    console.warn(`[edgeApiCrypto] Failed to resolve encrypted playback for drama ${dramaId} ep ${episodeNumber}:`, err);
  }

  return null;
}
