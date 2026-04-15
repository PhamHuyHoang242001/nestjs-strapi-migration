import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Standalone registry of generative AI tools and services
@Entity('ai_generatives')
export class AiGenerative extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  public name: string;

  @Column({ type: 'text', nullable: true })
  public short_desc: string;

  // Strapi media field: logo stored as flat metadata columns
  @Column({ nullable: true })
  public logo_url: string;

  @Column({ nullable: true })
  public logo_name: string;

  @Column({ nullable: true })
  public logo_mime: string;

  @Column({ nullable: true, type: 'int' })
  public logo_size: number;

  @Column({ nullable: true })
  public ref_url: string;
}
