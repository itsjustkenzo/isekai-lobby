import { connectDatabase, closeDatabase } from './db.js';
import { hashPassword } from './auth.js';

const testUsers = [{ username: 'kenzo', password: '123' }];

try {
  const { users } = await connectDatabase();
  for (const { username, password } of testUsers) {
    await users.updateOne(
      { username },
      { $set: { passwordHash: await hashPassword(password) }, $setOnInsert: { username, createdAt: new Date() } },
      { upsert: true },
    );
    console.log('Seeded user ' + username);
  }
} finally {
  await closeDatabase();
}
