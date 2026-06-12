// Typed wrapper around getUserMedia so views can show specific,
// recoverable UI for each failure mode instead of a generic toast.

export type MediaFailureReason =
  | 'denied'        // user (or OS policy) blocked the permission
  | 'unavailable'   // no matching device on this hardware
  | 'busy'          // device exists but another app/tab holds it
  | 'timeout'       // permission dialog hung past the deadline
  | 'insecure'      // page is not a secure context
  | 'unsupported'   // browser lacks mediaDevices entirely
  | 'unknown';

export type MediaKind = 'microphone' | 'camera';

// Flat shape (not a discriminated union): this codebase compiles without
// strictNullChecks, where truthiness checks like `!result.ok` don't narrow.
export interface MediaStreamResult {
  ok: boolean;
  /** Set when ok is true. */
  stream: MediaStream | null;
  /** Set when ok is false. */
  reason: MediaFailureReason | null;
}

const PERMISSION_TIMEOUT_MS = 15000;

const reasonFromError = (error: unknown): MediaFailureReason => {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'denied';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
      case 'OverconstrainedError':
        return 'unavailable';
      case 'NotReadableError':
      case 'TrackStartError':
      case 'AbortError':
        return 'busy';
      case 'SecurityError':
        return 'insecure';
      default:
        return 'unknown';
    }
  }
  return 'unknown';
};

export const stopStream = (stream: MediaStream | null | undefined) => {
  stream?.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      // a track that refuses to stop should not break teardown
    }
  });
};

/**
 * Requests a media stream with a timeout guard (iOS can leave the
 * permission dialog hanging). Never throws — always returns a result object.
 */
export const requestMediaStream = async (
  constraints: MediaStreamConstraints,
  options: { timeoutMs?: number } = {},
): Promise<MediaStreamResult> => {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return { ok: false, stream: null, reason: 'unsupported' };
  }
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return { ok: false, stream: null, reason: 'insecure' };
  }

  const timeoutMs = options.timeoutMs ?? PERMISSION_TIMEOUT_MS;
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeout = new Promise<MediaStreamResult>((resolve) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      resolve({ ok: false, stream: null, reason: 'timeout' });
    }, timeoutMs);
  });

  const request = navigator.mediaDevices
    .getUserMedia(constraints)
    .then<MediaStreamResult>((stream) => {
      if (timedOut) {
        // The UI already moved on — release the late-arriving stream.
        stopStream(stream);
        return { ok: false, stream: null, reason: 'timeout' };
      }
      return { ok: true, stream, reason: null };
    })
    .catch<MediaStreamResult>((error: unknown) => ({ ok: false, stream: null, reason: reasonFromError(error) }));

  const result = await Promise.race([request, timeout]);
  if (timeoutId) clearTimeout(timeoutId);
  return result;
};

export interface MediaFailureCopy {
  title: string;
  hint: string;
}

export const describeMediaFailure = (reason: MediaFailureReason, kind: MediaKind): MediaFailureCopy => {
  const device = kind === 'microphone' ? 'microphone' : 'camera';
  switch (reason) {
    case 'denied':
      return {
        title: `${kind === 'microphone' ? 'Microphone' : 'Camera'} access is blocked`,
        hint: `Allow ${device} access for Lior in your device settings, then try again.`,
      };
    case 'unavailable':
      return {
        title: `No ${device} found`,
        hint: `We couldn't find a ${device} on this device. Plug one in or try another device.`,
      };
    case 'busy':
      return {
        title: `${kind === 'microphone' ? 'Microphone' : 'Camera'} is in use`,
        hint: `Another app may be using your ${device}. Close it and try again.`,
      };
    case 'timeout':
      return {
        title: 'Permission request timed out',
        hint: 'We never heard back from the permission prompt. Try again.',
      };
    case 'insecure':
      return {
        title: 'Connection is not secure',
        hint: `The ${device} only works over a secure (https) connection.`,
      };
    case 'unsupported':
      return {
        title: `${kind === 'microphone' ? 'Recording' : 'Camera'} isn't supported here`,
        hint: `This browser doesn't support ${device} access. Try the Lior app instead.`,
      };
    case 'unknown':
    default:
      return {
        title: `Couldn't start the ${device}`,
        hint: 'Something unexpected went wrong. Try again in a moment.',
      };
  }
};
