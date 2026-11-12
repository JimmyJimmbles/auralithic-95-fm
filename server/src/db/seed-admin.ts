import { stdin as input, stdout as output } from 'node:process';
import { hashPassword } from '../auth/password.js';
import { closeDb, db } from './client.js';
import { adminCredentials } from './schema.js';

const readPassword = (): Promise<string> => new Promise((resolve, reject) => {
  if (!input.isTTY || !input.setRawMode) {
    reject(new Error('Run this in a terminal. Do not pass the password as an argument.'));
    return;
  }
  output.write('Admin password: ');
  input.setRawMode(true);
  input.resume();
  let password = '';
  const onData = (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    if (text === '\u0003') {
      input.setRawMode(false);
      input.pause();
      output.write('\n');
      reject(new Error('Cancelled'));
      return;
    }
    if (text === '\r' || text === '\n') {
      input.off('data', onData);
      input.setRawMode(false);
      input.pause();
      output.write('\n');
      resolve(password);
      return;
    }
    if (text === '\u007f' || text === '\b') {
      password = password.slice(0, -1);
      return;
    }
    password += text;
  };
  input.on('data', onData);
});

const main = async () => {
  const password = await readPassword();
  if (password.length < 12) throw new Error('Use at least 12 characters.');
  const passwordHash = await hashPassword(password);
  await db.insert(adminCredentials).values({ id: 'owner', passwordHash }).onConflictDoUpdate({
    target: adminCredentials.id,
    set: { passwordHash, updatedAt: new Date() },
  });
  output.write('Admin password saved.\n');
};

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Could not save the admin password');
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
