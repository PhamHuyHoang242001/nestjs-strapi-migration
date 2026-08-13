import { Controller, Get, INestApplication, Query, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Transform } from 'class-transformer';
import { IsArray, IsOptional, IsString } from 'class-validator';
import * as request from 'supertest';

// Regression guard for the Express 5 query-parser default. Express 5 defaults to the 'simple'
// parser (Node querystring), which does NOT understand bracket-array notation: `codes[]=a&codes[]=b`
// becomes a literal key `codes[]` instead of an array under `codes`. Combined with the global
// ValidationPipe `whitelist: true`, the unknown key is stripped and the array param silently drops —
// which broke every list endpoint filtering by an array query param (the axios frontend serializes
// arrays as `key[]=...`). main.ts restores `app.set('query parser', 'extended')`; this test locks it.

// Mirrors the array-query transform pattern used across the list DTOs (e.g. ListVersionsDto).
class ProbeDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) return undefined;
    const arr = Array.isArray(value) ? value : String(value).split(',');
    return arr.map((c: string) => String(c).trim()).filter((c) => c.length > 0);
  })
  readonly codes?: string[];
}

@Controller()
class ProbeController {
  @Get('probe')
  probe(@Query() q: ProbeDto) {
    return { codes: q.codes ?? null };
  }
}

describe('Express query parser — bracket-array parsing (main.ts config)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [ProbeController] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    // Reproduce the two production settings that interact to cause the bug: the extended query
    // parser and the whitelisting ValidationPipe. Removing the parser line makes these tests fail.
    (app as NestExpressApplication).set('query parser', 'extended');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('bracket form codes[]=a&codes[]=b → array (the frontend/axios serialization)', async () => {
    const res = await request(app.getHttpServer()).get('/probe?codes[]=skill_48&codes[]=skill_50').expect(200);
    expect(res.body.codes).toEqual(['skill_48', 'skill_50']);
  });

  it('repeated form codes=a&codes=b → array', async () => {
    const res = await request(app.getHttpServer()).get('/probe?codes=skill_48&codes=skill_50').expect(200);
    expect(res.body.codes).toEqual(['skill_48', 'skill_50']);
  });

  it('comma form codes=a,b → array', async () => {
    const res = await request(app.getHttpServer()).get('/probe?codes=skill_48,skill_50').expect(200);
    expect(res.body.codes).toEqual(['skill_48', 'skill_50']);
  });

  it('single bracket codes[]=a → single-element array', async () => {
    const res = await request(app.getHttpServer()).get('/probe?codes[]=skill_48').expect(200);
    expect(res.body.codes).toEqual(['skill_48']);
  });
});
