import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUpload } from './useUpload';

describe('useUpload', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('stops the upload when the dialog closes', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        signal = init.signal ?? undefined;
        return new Promise((_resolve, reject) =>
          signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
        );
      }),
    );
    const { result, unmount } = renderHook(() => useUpload());
    const upload = result.current('/upload/1', new File(['x'], 'backup.sbk'));
    unmount();
    await expect(upload).rejects.toThrow('aborted');
    expect(signal?.aborted).toBe(true);
  });

  it('fails with the server message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('too large', { status: 413 })),
    );
    const { result } = renderHook(() => useUpload());
    await expect(result.current('/upload/1', new File(['x'], 'a.tgz'))).rejects.toThrow('too large');
  });
});
