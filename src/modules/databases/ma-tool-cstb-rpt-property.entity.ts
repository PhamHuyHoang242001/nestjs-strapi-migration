import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { MaToolDataServiceCenter } from './ma-tool-data-service-center.entity';
import { MaToolRptHistory } from './ma-tool-rpt-history.entity';

// CSTB report property — metadata describing a regulatory report template
@Entity('ma_tool_cstb_rpt_properties')
export class MaToolCstbRptProperty extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public rpt_owner: string;

  @Column({ nullable: true })
  public rpt_code: string;

  @Column({ nullable: true })
  public manual_ind: string;

  @Column({ nullable: true })
  public excel_data_region: string;

  @Column({ nullable: true })
  public rpt_status: boolean;

  @Column({ nullable: true })
  public template_file_name: string;

  @Column({ nullable: true })
  public description: string;

  @Column({ nullable: true })
  public branch_rpt_ind: string;

  @Column({ nullable: true })
  public frq_code: string;

  @Column({ nullable: true })
  public report_type: string;

  @Column({ nullable: true, type: 'int' })
  public sheets_number: number;

  @Column({ nullable: true })
  public check_smy_ind: string;

  @Column({ nullable: true })
  public is_root: boolean;

  // FK to ma_tool_data_service_centers (nullable)
  @Column({ nullable: true, type: 'int' })
  public data_service_center_id: number;

  @ManyToOne(() => MaToolDataServiceCenter)
  @JoinColumn({ name: 'data_service_center_id' })
  public data_service_center: MaToolDataServiceCenter;

  // Reverse: report processing histories
  @OneToMany(() => MaToolRptHistory, (h) => h.report)
  public rpt_histories: MaToolRptHistory[];
}
