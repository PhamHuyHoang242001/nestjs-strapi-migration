import { BaseSoftDeleteEntity } from '../../configuration/base-entity';
import { Column, Entity } from 'typeorm';

@Entity('media')
export class Media extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  public filename: string;

  @Column({ nullable: true })
  public original_name: string;

  @Column({ nullable: true })
  public mime_type: string;

  @Column({ nullable: true })
  public size: number;

  @Column({ nullable: true })
  public path: string;

  @Column({ nullable: true })
  public uploader_id?: number;

  @Column({ nullable: true })
  public uploader_type?: string;

  @Column({ nullable: true })
  public upload_type?: string;

  // Strapi file ID (provider_uid) returned by the Strapi v5 upload API response.
  // Stored to enable lifecycle callbacks (delete from Strapi when NestJS soft-deletes this row).
  @Column({ nullable: true })
  public provider_uid?: string;
}
