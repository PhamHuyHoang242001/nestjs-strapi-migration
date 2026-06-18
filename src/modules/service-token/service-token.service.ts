import { ADMIN_JWT_SECRET } from '@configuration/env.config';
import { JWT_TOKEN_TYPE } from '@modules/databases/jwt-token.entity';
import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtTokenRepository } from './repository/jwt-token.repository';
import { RenderServiceTokenDto } from './dto/render-service-token.dto';

/** Decoded JWT structure (mirrors the Strapi `parseJWTToken` shape). */
export interface ParsedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
}

@Injectable()
export class ServiceTokenService {
  constructor(private readonly jwtTokenRepository: JwtTokenRepository) {}

  /**
   * Mint a service token and persist it to `jwt_tokens`.
   * Faithful to Strapi: signs `{ id, type, sub }` and stores `name = id`.
   */
  async generateServiceToken({ type, id }: RenderServiceTokenDto, adminId?: number) {
    const serviceToken = jwt.sign({ id, type, sub: id }, ADMIN_JWT_SECRET);
    await this.jwtTokenRepository.save({
      type: JWT_TOKEN_TYPE.SERVICE_TOKEN,
      token: serviceToken,
      is_delete: false,
      name: id,
      created_by: adminId,
    });
    return { serviceToken, type: JWT_TOKEN_TYPE.SERVICE_TOKEN };
  }

  /**
   * Validate a service token: decode (no signature verify, matching Strapi) and confirm
   * an active row exists in `jwt_tokens`. Returns the parsed JWT or null.
   */
  async verifyServiceToken(token: string): Promise<ParsedJwt | null> {
    const decoded = this.parseJwt(token);
    if (!decoded) return null;
    const exists = await this.jwtTokenRepository.findActiveServiceToken(token);
    if (!exists) return null;
    return decoded;
  }

  /** Base64-decode a JWT into header/payload/signature without verifying the signature. */
  private parseJwt(token: string): ParsedJwt | null {
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
}
