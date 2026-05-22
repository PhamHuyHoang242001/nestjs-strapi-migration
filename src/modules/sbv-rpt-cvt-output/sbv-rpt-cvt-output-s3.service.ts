import { Injectable } from '@nestjs/common';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { AWS_REGION, AWS_ENDPOINT } from '@configuration/env.config';
import { Readable } from 'stream';

@Injectable()
export class SbvRptCvtOutputS3Service {
  private readonly s3Client: S3Client;

  constructor() {
    const options: Record<string, unknown> = { region: AWS_REGION };
    if (AWS_ENDPOINT) {
      options.endpoint = AWS_ENDPOINT;
      options.forcePathStyle = true;
    }
    this.s3Client = new S3Client(options);
  }

  async readFile(bucket: string, key: string) {
    const result = await this.s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return {
      Body: result.Body as Readable,
      ContentType: result.ContentType,
      ContentLength: result.ContentLength,
    };
  }
}
