/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import * as mime from 'mime-types';
import { BadRequestException } from '@nestjs/common';

export enum UploadFileTypes {
  IMAGE = 'image',
  VIDEO = 'video',
}

export const SupportedImageMIMETypes = [
  'image/apng',
  'image/png',
  'image/jpeg',
  'image/avif',
  'image/gif',
  'image/svg+xml',
  'image/webp',
  'image/bmp',
];

export const getContentType = (fileName: string, fileType: UploadFileTypes = UploadFileTypes.IMAGE): string => {
  const contentType = mime.contentType(fileName);
  if (!contentType) {
    throw new BadRequestException('File name is not valid');
  }
  if (fileType === UploadFileTypes.IMAGE && !SupportedImageMIMETypes.includes(contentType)) {
    throw new BadRequestException('File name is not an image file');
  }
  return contentType;
};
