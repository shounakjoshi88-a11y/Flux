const COMPRESSION_FORMAT: CompressionFormat = 'gzip';
const MIN_COMPRESS_SIZE = 512;

export const supportsNativeCompression =
  typeof CompressionStream !== 'undefined' &&
  typeof DecompressionStream !== 'undefined';

export async function compressText(input: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(input);
  const stream = new Blob([rawBytes]).stream().pipeThrough(
    new CompressionStream(COMPRESSION_FORMAT),
  );
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

export async function decompressText(compressed: Uint8Array): Promise<string> {
  const stream = new Blob([compressed as BlobPart]).stream().pipeThrough(
    new DecompressionStream(COMPRESSION_FORMAT),
  );
  return new Response(stream).text();
}

export async function packForStorage(
  content: string,
): Promise<{ data: string | Uint8Array; compressed: boolean }> {
  const byteLength = new TextEncoder().encode(content).byteLength;
  if (byteLength < MIN_COMPRESS_SIZE || !supportsNativeCompression) {
    return { data: content, compressed: false };
  }
  const compressed = await compressText(content);
  if (compressed.byteLength >= byteLength) {
    return { data: content, compressed: false };
  }
  return { data: compressed, compressed: true };
}

export async function unpackFromStorage(
  packed: { data: string | Uint8Array; compressed: boolean },
): Promise<string> {
  if (!packed.compressed || typeof packed.data === 'string') {
    return packed.data as string;
  }
  return decompressText(packed.data as Uint8Array);
}
