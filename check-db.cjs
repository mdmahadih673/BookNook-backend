require('dotenv').config();
const { MongoClient } = require('mongodb');

(async () => {
  const c = new MongoClient(process.env.MONGODB_URL);
  await c.connect();
  const db = c.db('BookNook');

  console.log('users:', await db.collection('user').countDocuments());
  console.log('sessions:', await db.collection('session').countDocuments());
  console.log('jwks keys:', await db.collection('jwks').countDocuments());
  console.log('jwks:', JSON.stringify(await db.collection('jwks').find({}).toArray(), null, 2));

  const sessions = await db.collection('session').find({}).toArray();
  console.log('session tokens:', sessions.map(s => ({ token: s.token, userId: s.userId, expiresAt: s.expiresAt })));

  await c.close();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
