const MEDIA_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|svg|mp4|webm|mov|avi|mp3|wav|ogg|flac|m4a|pdf)(\?[^\s]*)?$/i;
const DATA_URI = /^data:(image|video|audio|application\/octet-stream)/i;
const MEDIA_KINDS = new Set([
  20,        // Image
  10063,     // Blossom
  10000178,  // HLSVideo
]);
const ENCRYPTED_KINDS = new Set([4, 44, 1059, 30078]);
const CONTENT_SIZE_THRESHOLD = 10_000; // 10KB

export function sanitizeContent(kind: number, content: string): string {
  // Encrypted kinds — strip ciphertext, keep metadata
  if (ENCRYPTED_KINDS.has(kind)) {
    return `[encrypted content — kind ${kind}]`;
  }

  // Known media kinds — always strip
  if (MEDIA_KINDS.has(kind)) {
    return `[media content removed — kind ${kind}]`;
  }

  // Empty or short content — keep as-is
  if (!content || content.length < 200) {
    return content;
  }

  // data: URI (base64 encoded media)
  if (DATA_URI.test(content)) {
    return `[base64 media removed — ${content.length} chars]`;
  }

  // Content that is just a media URL
  const trimmed = content.trim();
  if (MEDIA_EXTENSIONS.test(trimmed) && !trimmed.includes("\n")) {
    return `[media URL: ${trimmed}]`;
  }

  // Very large content that isn't JSON — likely binary/encoded
  if (content.length > CONTENT_SIZE_THRESHOLD) {
    try {
      JSON.parse(content);
      return content; // valid JSON — keep it (metadata, settings, etc.)
    } catch {
      return `[large content removed — ${content.length} chars]`;
    }
  }

  return content;
}
