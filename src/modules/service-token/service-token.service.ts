import { standardizePagination } from '@common/utils';
import { NOT_FOUND } from '@constant/error-messages';
import { ADMIN_JWT_SECRET } from '@configuration/env.config';
import { JWT_TOKEN_TYPE } from '@modules/databases/jwt-token.entity';
import { Injectable, NotFoundException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtTokenRepository } from './repository/jwt-token.repository';
import { ListServiceTokenDto } from './dto/list-service-token.dto';
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
   * List active service tokens (paginated, keyword search by name). Excludes `token` values.
   * Mirrors the data-self-serve request list: page/limit defaults + 100 cap, returns { data, meta }.
   */
  async search(query: ListServiceTokenDto) {
    const page = Number(query.page || 1);
    const limit = Math.min(Number(query.limit || 10), 100);
    const qb = this.jwtTokenRepository
      .buildServiceTokenListQuery(query)
      .skip((page - 1) * limit)
      .take(limit);
    const [rows, total] = await qb.getManyAndCount();
    return { data: rows, meta: standardizePagination(total, rows.length, limit, page) };
  }

  /** Get one active service token by id (includes `token`). 404 if missing/deleted/wrong type. */
  async details(id: number) {
    const row = await this.jwtTokenRepository.findActiveServiceTokenById(id);
    if (!row) throw new NotFoundException(NOT_FOUND);
    return row;
  }

  /** Update only the `name` of an active service token. 404 if missing/deleted. */
  async updateName(id: number, name: string, adminId?: number) {
    const row = await this.jwtTokenRepository.findActiveServiceTokenById(id);
    if (!row) throw new NotFoundException(NOT_FOUND);
    // Type-scope the write too (defense-in-depth, consistent with softDelete) so the
    // update can never touch an access/refresh row in the shared jwt_tokens table.
    await this.jwtTokenRepository.updateOne(
      { id, type: JWT_TOKEN_TYPE.SERVICE_TOKEN, is_delete: false },
      { name, updated_by: adminId },
    );
    return { id, name };
  }

  /** Soft-delete a service token (is_delete=true). Verify path filters is_delete → token revoked. */
  async softDelete(id: number, adminId?: number) {
    const row = await this.jwtTokenRepository.findActiveServiceTokenById(id);
    if (!row) throw new NotFoundException(NOT_FOUND);
    await this.jwtTokenRepository.updateOne(
      { id, type: JWT_TOKEN_TYPE.SERVICE_TOKEN },
      { is_delete: true, updated_by: adminId },
    );
    return { id };
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
