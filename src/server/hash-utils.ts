import logger from '$/utils/logger';
import bcrypt from 'bcrypt';
import { generate } from 'generate-password';

export const hashPassword = (
  plainText: string,
  saltRounds = 10
): Promise<string> => {
  return new Promise((resolve, reject) => {
    bcrypt.genSalt(saltRounds, function (err: Error, salt: string) {
      if (err) {
        logger.warn(err);
        reject(err);
      }

      bcrypt.hash(plainText, salt, function (err: Error, hash: string) {
        if (err) {
          logger.warn(err);
          reject(err);
        } else {
          resolve(hash);
        }
      });
    });
  });
};

type GeneratePasswordResponse = {
  passwordHash: string;
  plain: string;
};

export const generatePasswordHash =
  async (): Promise<GeneratePasswordResponse> => {
    const plain = generate({ length: 10, numbers: true, symbols: true });
    const passwordHash = await hashPassword(plain);

    return { passwordHash, plain };
  };
