import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseColumn } from '@configuration/base-entity';
import { DataHubDepartment } from './data-hub-department.entity';

// Member of a department (Đơn vị phát hành): may create/update data services of it when holding the
// matching role code. Plain user id, hard-deleted on removal.
// The (department_id, user_id) unique is required: adding members uses ON CONFLICT on that pair.
@Entity('data_hub_department_members')
@Unique('uq_data_hub_department_members_pair', ['department_id', 'user_id'])
export class DataHubDepartmentMember extends BaseColumn {
  @Column({ type: 'int' })
  public department_id: number;

  @ManyToOne(() => DataHubDepartment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'department_id' })
  public department: DataHubDepartment;

  @Column({ type: 'int' })
  public user_id: number;

  @Column({ type: 'int', nullable: true })
  public created_by: number | null;
}
