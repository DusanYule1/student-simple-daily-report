import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';

const KEY_LENGTH = 64;
const N = 16_384;
const R = 8;
const P = 1;

const deriveKey = (
  password: string,
  salt: Buffer,
  length: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> => new Promise((resolve, reject) => {
  scryptCallback(password, salt, length, options, (error, key) => {
    if (error) {
      reject(error);
      return;
    }
    resolve(key);
  });
});

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: 32 * 1024 * 1024,
  });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
};

export const verifyPassword = async (
  password: string,
  encoded: string,
): Promise<boolean> => {
  const [algorithm, n, r, p, saltValue, hashValue] = encoded.split('$');
  if (algorithm !== 'scrypt' || !n || !r || !p || !saltValue || !hashValue) {
    return false;
  }

  const expected = Buffer.from(hashValue, 'base64url');
  const actual = await deriveKey(
    password,
    Buffer.from(saltValue, 'base64url'),
    expected.length,
    {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 32 * 1024 * 1024,
    },
  );
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};
