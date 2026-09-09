/** Decoded JWT structure (mirrors Strapi `parseJWTToken`). */
export interface ParsedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
}

/** Base64-decode a JWT into header/payload/signature without verifying the signature. */
export function parseJwt(token: string): ParsedJwt | null {
  if (!token) return null;
  try {
    const [header, payload, signature] = token.split('.');
    return {
      header: JSON.parse(Buffer.from(header, 'base64').toString('utf8')) as Record<string, unknown>,
      payload: JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as Record<string, unknown>,
      signature,
    };
  } catch {
    return null;
  }
}
