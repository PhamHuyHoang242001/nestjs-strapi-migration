import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, OneToMany } from 'typeorm';
import { MaToolWorkspace } from './ma-tool-workspace.entity';

// S3 bucket configuration for MA Tool file storage
@Entity('ma_tool_s3')
export class MaToolS3 extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public bucket_name: string;

  @Column({ nullable: true })
  public aws_region: string;

  @Column({ nullable: true })
  public endpoint_url: string;

  @Column({ nullable: true })
  public s3_status: string;

  @Column({ nullable: true })
  public is_deleted: boolean;

  // Reverse: workspaces using this S3 bucket
  @OneToMany(() => MaToolWorkspace, (w) => w.s3)
  public workspaces: MaToolWorkspace[];
}
