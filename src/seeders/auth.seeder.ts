import { Injectable } from '@nestjs/common';
import { Seeder } from 'nestjs-seeder';
import { DataSource } from 'typeorm';

@Injectable()
export class AuthSeeder implements Seeder {
  constructor(private connection: DataSource) {}

  private dataRef: number[] = [];
  seed(): Promise<any> {
    const dataConfig = [{ user_id: 1 }];
    for (const item of dataConfig) {
      this.dataRef.push(item.user_id);
    }
    return Promise.resolve();
  }

  drop(): Promise<any> {
    console.log('drop');
    return Promise.resolve();
  }
}
