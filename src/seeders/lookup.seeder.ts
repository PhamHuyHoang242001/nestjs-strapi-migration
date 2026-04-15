import { Injectable } from '@nestjs/common';
import { Seeder } from 'nestjs-seeder';
import { DataSource } from 'typeorm';

/**
 * LookupSeeder — stub for lookup / taxonomy seed.
 * TODO: seed tags, labels, categories for BI Hub, BI Diagnostic, BI Payment, Winnovate
 * from Strapi source after ETL plan is finalized (roadmap Phase 6).
 */
@Injectable()
export class LookupSeeder implements Seeder {
  constructor(private connection: DataSource) {}

  async seed(): Promise<any> {
    console.log('TODO: seed tags/labels/categories for all domains');
  }

  async drop(): Promise<any> {
    console.log('TODO: drop lookup seed data');
  }
}
