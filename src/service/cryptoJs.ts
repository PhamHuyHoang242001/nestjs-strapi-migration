import * as crypto from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cryptoJs = require('crypto-js') as { MD5: (input: string) => { toString: () => string } };

/**
 *
 * @param payload - string or object to encrypt
 * @param key - encryption key
 */

export const encryptCryptoDecipher = (payload: string | object, key: string): string => {
  try {
    if (typeof payload == 'object') {
      payload = JSON.stringify(payload);
    }
    const data = payload.toString();
    const keyBytes = crypto.createHash('sha256').update(Buffer.from(key)).digest();
    const derivedBytes = crypto.pbkdf2Sync(keyBytes, Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]), 1000, 48, 'sha1');
    const aesKey = derivedBytes.slice(0, 32);
    const aesIv = derivedBytes.slice(32, 48);
    const iv = Buffer.from(aesIv);

    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(aesKey), iv);
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
  } catch {
    return '';
  }
};

export const decryptCryptoDecipher = (payload: string | object, key: string): string => {
  try {
    if (typeof payload == 'object') {
      payload = JSON.stringify(payload);
    }
    const data = payload.toString();

    const keyBytes = crypto.createHash('sha256').update(Buffer.from(key)).digest();
    const derivedBytes = crypto.pbkdf2Sync(keyBytes, Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]), 1000, 48, 'sha1');
    const aesKey = derivedBytes.slice(0, 32);
    const aesIv = derivedBytes.slice(32, 48);
    const iv = Buffer.from(aesIv);

    const inputEncrypt = Buffer.from(data, 'base64');
    const encryptedText = Buffer.from(inputEncrypt);
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(aesKey), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch {
    return '';
  }
};

export const randomBytesCrypto = (length: number): Buffer => {
  return crypto.randomBytes(length);
};

export const encryptMD5 = (input: string): string => {
  return cryptoJs.MD5(input).toString();
};

export const sha256Password = (input: string): string => {
  return crypto.createHash('sha256').update(Buffer.from(input)).digest('hex');
};
