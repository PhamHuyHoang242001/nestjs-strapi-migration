import * as crypto from 'crypto';
import * as cryptoJs from 'crypto-js';

/**
 *
 * @param {*} payload
 * @param {*} key
 */

export const encryptCryptoDecipher = (payload: string | object, key: string) => {
  try {
    if (typeof payload == 'object') {
      payload = JSON.stringify(payload);
    }
    const data = payload.toString();
    const keyBytes = crypto.createHash('sha256').update(Buffer.from(key)).digest();
    const derivedBytes = crypto.pbkdf2Sync(keyBytes, Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]), 1000, 48, 'sha1');
    const aesKey = derivedBytes.slice(0, 32);
    const aesIv: any = derivedBytes.slice(32, 48);
    const iv = Buffer.from(aesIv, 'hex');

    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(aesKey), iv);
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
  } catch (error) {
    return '';
  }
};

export const decryptCryptoDecipher = (payload: string | object, key: string) => {
  try {
    if (typeof payload == 'object') {
      payload = JSON.stringify(payload);
    }
    const data = payload.toString();

    let keyBytes = crypto.createHash('sha256').update(Buffer.from(key)).digest();
    let derivedBytes = crypto.pbkdf2Sync(keyBytes, Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]), 1000, 48, 'sha1');
    let aesKey = derivedBytes.slice(0, 32);
    let aesIv: any = derivedBytes.slice(32, 48);
    let iv = Buffer.from(aesIv, 'hex');

    let inputEncrypt: any = Buffer.from(data, 'base64');
    let encryptedText = Buffer.from(inputEncrypt, 'hex');
    let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(aesKey), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    return '';
  }
};

export const randomBytesCrypto = (length: number) => {
  return crypto.randomBytes(length);
};
export const encryptMD5 = (input) => {
  return cryptoJs.MD5(input).toString();
};
export const sha256Password = (input: string) => {
  return crypto.createHash('sha256').update(Buffer.from(input)).digest('hex');
};
