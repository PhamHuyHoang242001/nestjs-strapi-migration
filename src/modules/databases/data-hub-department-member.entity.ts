import { Column, Entity } from 'typeorm';
import { BaseColumn } from '@configuration/base-entity';

// Member of a department (Đơn vị phát hành): may create/update data services of it when holding the
// matching role code. Plain user id, hard-deleted on removal.
@Entity('data_hub_department_members')
export class DataHubDepartmentMember extends BaseColumn {
  @Column({ type: 'int' })
  public department_id: number;

  @Column({ type: 'int' })
  public user_id: number;

  @Column({ type: 'int', nullable: true })
  public created_by: number | null;
}
