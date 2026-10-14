/**
 * D38 Milestone 2: read one upload chunk at a time without loading the whole
 * file into memory (design-media.md section 8, critique L13).
 *
 * Native: expo-file-system's File.open() gives a FileHandle; each chunk sets
 * handle.offset and calls readBytes(length), then closes the handle. Never
 * File.slice() or File.bytes(): in SDK 55 both read the whole file first,
 * which would crash a low-end phone on an 80 MB video. A content:// file is
 * copied into the app cache once, because a handle needs a real file path.
 *
 * Web: the picker's File (asset.file) or the recorded Blob is sliced with
 * Blob.slice(). Never fetch(blob:): the web app's connect-src is 'self', and
 * fetching would load the whole video into memory.
 */
import { File, Paths } from 'expo-file-system';

export type MediaSource =
  | { platform: 'native'; uri: string }
  | { platform: 'web'; blob: Blob };

export interface ChunkReader {
  /** Total bytes in the file. */
  size: number;
  /** Bytes for chunk `index` of `chunkBytes` each (the last may be shorter). */
  read(index: number, chunkBytes: number): Promise<Uint8Array | Blob>;
  /** Remove any temporary copy. */
  close(): void;
}

function chunkRange(index: number, chunkBytes: number, size: number): { start: number; length: number } {
  const start = index * chunkBytes;
  if (!Number.isInteger(index) || index < 0 || start >= size) {
    throw new Error(`Chunk ${index} is outside the file.`);
  }
  return { start, length: Math.min(chunkBytes, size - start) };
}

function openNativeReader(uri: string): ChunkReader {
  let file = new File(uri);
  let temporary: File | null = null;
  if (uri.startsWith('content://')) {
    temporary = new File(Paths.cache, `job-media-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    file.copy(temporary);
    file = temporary;
  }
  const size = file.size;
  return {
    size,
    async read(index, chunkBytes) {
      const { start, length } = chunkRange(index, chunkBytes, size);
      const handle = file.open();
      try {
        handle.offset = start;
        return handle.readBytes(length);
      } finally {
        handle.close();
      }
    },
    close() {
      if (temporary) {
        try { temporary.delete(); } catch { /* the cache is cleared by the OS anyway */ }
        temporary = null;
      }
    },
  };
}

function openWebReader(blob: Blob): ChunkReader {
  return {
    size: blob.size,
    async read(index, chunkBytes) {
      const { start, length } = chunkRange(index, chunkBytes, blob.size);
      return blob.slice(start, start + length);
    },
    close() { /* nothing to remove */ },
  };
}

export function openChunkReader(source: MediaSource): ChunkReader {
  return source.platform === 'web' ? openWebReader(source.blob) : openNativeReader(source.uri);
}

/** Number of chunks for a file of `size` bytes. */
export function chunkCount(size: number, chunkBytes: number): number {
  return size <= 0 ? 0 : Math.ceil(size / chunkBytes);
}
