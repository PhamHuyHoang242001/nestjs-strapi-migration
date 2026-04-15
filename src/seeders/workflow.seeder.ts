import { Injectable } from '@nestjs/common';
import { Seeder } from 'nestjs-seeder';
import { DataSource } from 'typeorm';

/**
 * WorkflowSeeder — stub for BI Payment workflow seed.
 * TODO: seed BI Payment work-steps from Strapi source after ETL plan is finalized (roadmap Phase 6).
 */
@Injectable()
export class WorkflowSeeder implements Seeder {
  constructor(private connection: DataSource) {}

  async seed(): Promise<any> {
    console.log('TODO: seed BI Payment work-steps');
  }

  async drop(): Promise<any> {
    console.log('TODO: drop BI Payment workflow seed data');
  }
}
