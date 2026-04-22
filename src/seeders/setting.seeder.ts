import { COUNTRY_API_PUBLIC_LIST_COUNTRY } from '@configuration/env.config';
import { Settings, SettingType } from '@modules/databases/setting.entity';
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { Seeder } from 'nestjs-seeder';
import { DataSource } from 'typeorm';
import flags from '../../flags.json';

/** Shape of each entry in flags.json */
interface FlagEntry {
  code: string;
  image: string;
}

/** Shape of each country object returned by the country API */
interface CountryApiItem {
  id: number;
  name: string;
  iso2: string;
  emoji: string;
  phone_code: string;
}

@Injectable()
export class SettingSeeder implements Seeder {
  constructor(private connection: DataSource) {}

  private dataRef: number[] = [];
  async seed(): Promise<any> {
    console.log('table', this.connection.getMetadata(Settings).tableName);
    const arrDataInit = [];
    const res = await axios.get<CountryApiItem[]>(COUNTRY_API_PUBLIC_LIST_COUNTRY);
    const map = new Map<string, string>();
    (flags as FlagEntry[]).forEach((ele: FlagEntry) => map.set(ele.code.toLowerCase(), ele.image));
    const values = res.data?.map((country: CountryApiItem) => {
      const id: number = country.id;
      const name: string = country.name;
      const iso2: string = country.iso2;
      const emoji: string = country.emoji;
      const phone_code: string = country.phone_code;
      const flag: string | undefined = map.get(country.iso2.toLowerCase());
      return { id, name, iso2, emoji, phone_code, flag };
    });
    const dataConfig = [
      {
        id: 1,
        key: SettingType.LIST_COUNTRIES,
        value: values,
      },
      {
        id: 2,
        key: SettingType.FIRMWARE_VERSION,
        value: [
          {
            key: 'v1.1',
            value: 'v1.1',
          },
          {
            key: 'v1.2',
            value: 'v1.2',
          },
          {
            key: 'v1.3',
            value: 'v1.3',
          },
          {
            key: 'v1.4',
            value: 'v1.4',
          },
          {
            key: 'v1.5',
            value: 'v1.5',
          },
          {
            key: 'v1.6',
            value: 'v1.6',
          },
          {
            key: 'v1.7',
            value: 'v1.7',
          },
          {
            key: 'v1.8',
            value: 'v1.8',
          },
          {
            key: 'v1.9',
            value: 'v1.9',
          },
        ],
      },
    ];
    for (const item of dataConfig) {
      this.dataRef.push(item.id);
    }

    const pipeline = `SELECT * FROM ${this.connection.getMetadata(Settings).tableName} WHERE "id" = ANY($1) ;`;
    const rs = await this.connection.query<{ id: number }[]>(pipeline, [this.dataRef]);

    for (const item of dataConfig) {
      if (!rs.find((u: { id: number }) => u.id == item.id)) arrDataInit.push(item);
    }

    if (!arrDataInit.length) return !0;
    await this.connection.createQueryBuilder().insert().into(Settings).values(arrDataInit).execute();
  }

  async drop(): Promise<any> {
    await this.connection
      .createQueryBuilder()
      .delete()
      .from(Settings)
      .where('"id" IN (:...ids)', { ids: this.dataRef })
      .execute();
  }
}
