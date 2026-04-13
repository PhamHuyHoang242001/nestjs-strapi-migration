import { BaseSoftDeleteEntity } from '../../configuration/base-entity';
import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';

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
}
