import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { DataHubDepartment } from './data-hub-department.entity';

// Member of a department (Đơn vị phát hành): may create/update data services of it when holding the
// matching role code. Removal is a soft delete; re-adding the same user revives that row, so one
// (department_id, user_id) row exists at most and adding members can use ON CONFLICT on the pair.
@Entity('data_hub_department_members')
@Unique('uq_data_hub_department_members_pair', ['department_id', 'user_id'])
export class DataHubDepartmentMember extends BaseSoftDeleteEntity {
  @Column({ type: 'int' })
  public department_id: number;

  @ManyToOne(() => DataHubDepartment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'department_id' })
  public department: DataHubDepartment;

  @Column({ type: 'int' })
  public user_id: number;

  @Column({ type: 'int', nullable: true })
  public created_by: number | null;

  @Column({ type: 'int', nullable: true })
  public updated_by: number | null;

  @Column({ type: 'int', nullable: true })
  public deleted_by: number | null;
}
