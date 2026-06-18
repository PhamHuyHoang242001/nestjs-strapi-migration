import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Token kinds stored in the shared `jwt_tokens` table (string values match the DB enum). */
export enum JWT_TOKEN_TYPE {
  ACCESS_TOKEN = 'access-token',
  REFRESH_TOKEN = 'refresh-token',
  SERVICE_TOKEN = 'service-token',
}

/**
 * Maps the pre-existing `jwt_tokens` table (shared Strapi/NestJS DB).
 * Used for service-token mint + validation; revocation is a soft flag (`is_delete`).
 * FK columns (`user_id`, `created_by`, `updated_by`) are kept as scalars only — the
 * relations are not needed for token mint/validate, so they are intentionally omitted.
 */
@Entity('jwt_tokens')
export class JwtToken {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'text', nullable: true })
  public token?: string;

  @Column({ type: 'timestamp', nullable: true })
  public expired_at?: Date;

  @Column({ type: 'enum', enum: JWT_TOKEN_TYPE, nullable: true })
  public type?: JWT_TOKEN_TYPE;

  @Column({ nullable: true })
  public user_id?: number;

  @Column({ type: 'boolean', nullable: true, default: false })
  public is_delete?: boolean;

  @Column({ type: 'text', nullable: true })
  public name?: string;

  @Column({ nullable: true })
  public created_by?: number;

  @Column({ nullable: true })
  public updated_by?: number;
}
