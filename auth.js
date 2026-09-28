const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const digest = s => crypto.createHash('sha256').update(s).digest('hex');
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, {N:32768,r:8,p:1,maxmem:64*1024*1024});
  return `${salt}:${key.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const [salt, hex] = stored.split(':');
  const key = await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  const expected = Buffer.from(hex,'hex');
  return key.length === expected.length && crypto.timingSafeEqual(key,expected);
}
function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const csrf = crypto.randomBytes(24).toString('hex');
  db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(token),userId,csrf,Date.now()+7*86400000);
  return {token,csrf};
}
function getSession(db, req) {
  const token = (req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith('cm_session='))?.slice(11);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return db.prepare('SELECT sessions.*, users.email, users.name, users.profile FROM sessions JOIN users ON user_id=users.id WHERE token_hash=? AND expires>?').get(digest(token),Date.now()) || null;
}
function cookie(token, production, clear=false) {
  return `cm_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${clear?0:604800}${production?'; Secure':''}`;
}
module.exports={hashPassword,verifyPassword,createSession,getSession,cookie,digest};
