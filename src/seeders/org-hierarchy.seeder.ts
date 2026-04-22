import { Injectable } from '@nestjs/common';
import { Seeder } from 'nestjs-seeder';
import { DataSource } from 'typeorm';

/**
 * OrgHierarchySeeder — stub for BI Hub org structure seed.
 * TODO: seed BiHub divisions, centers, departments, bicc-departments
 * from Strapi source after ETL plan is finalized (roadmap Phase 6).
 */
@Injectable()
export class OrgHierarchySeeder implements Seeder {
  constructor(private connection: DataSource) {}

  seed(): Promise<any> {
    console.log('TODO: seed BI Hub divisions/centers/departments/bicc-departments');
    return Promise.resolve();
  }

  drop(): Promise<any> {
    console.log('TODO: drop BI Hub org hierarchy seed data');
    return Promise.resolve();
  }
}
