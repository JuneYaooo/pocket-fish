import { DatabaseSync } from 'node:sqlite'
import { randomBytes, randomUUID, createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { membershipPlans, validateRecord, localDate } from '../src/domain.ts'

export class ApiError extends Error {
  constructor(status, message, code='INVALID_REQUEST') { super(message); this.status=status; this.code=code }
}
export function createStore(filename) {
  const db=new DatabaseSync(filename)
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, tier TEXT NOT NULL DEFAULT 'basic', created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS catches(user_id TEXT NOT NULL REFERENCES users(id), id TEXT NOT NULL, data TEXT NOT NULL, photo BLOB, photo_id TEXT UNIQUE, PRIMARY KEY(user_id,id));
    CREATE TABLE IF NOT EXISTS config(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS wechat_identities(app_id TEXT NOT NULL, open_id TEXT NOT NULL, user_id TEXT NOT NULL UNIQUE REFERENCES users(id), PRIMARY KEY(app_id,open_id));
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS preferences(user_id TEXT PRIMARY KEY REFERENCES users(id), favorite TEXT NOT NULL DEFAULT '');`)
  db.prepare('INSERT OR IGNORE INTO config VALUES (?,?)').run('photo-secret',randomBytes(32).toString('hex'))
  const secret=db.prepare('SELECT value FROM config WHERE key=?').get('photo-secret').value
  const hash=token=>createHash('sha256').update(token).digest('hex')
  const signature=(id,expires)=>createHmac('sha256',secret).update(`${id}:${expires}`).digest('hex')
  const account=user=>{
    const fresh=db.prepare('SELECT id,tier FROM users WHERE id=?').get(user.id)
    if(!fresh) throw new ApiError(401,'请重新微信登录','UNAUTHORIZED')
    const plan=membershipPlans.find(p=>p.id===fresh.tier)||membershipPlans[0]
    const used=db.prepare('SELECT COUNT(*) AS count FROM catches WHERE user_id=?').get(user.id).count
    const favorite=db.prepare('SELECT favorite FROM preferences WHERE user_id=?').get(user.id)?.favorite||''
    return {...fresh,identity:'wechat',favorite,plan,used,remaining:Math.max(0,plan.limit-used),plans:membershipPlans}
  }
  const serialize=row=>{
    const expires=Math.floor(Date.now()/1000)+86400
    return {...JSON.parse(row.data),photo:row.photo_id?`/api/photos/${row.photo_id}?expires=${expires}&signature=${signature(row.photo_id,expires)}`:''}
  }
  return {
    db,close:()=>db.close(),account,
    createWechatSession(appId,openId){
      if(typeof appId!=='string'||!appId||typeof openId!=='string'||!openId)throw new ApiError(400,'微信身份无效')
      const token=randomBytes(32).toString('hex'),expiresAt=Date.now()+30*86400000
      db.exec('BEGIN IMMEDIATE')
      try{
        let identity=db.prepare('SELECT user_id FROM wechat_identities WHERE app_id=? AND open_id=?').get(appId,openId)
        if(!identity){
          const id=randomUUID()
          // Keep the old column for a non-destructive schema migration; it is no longer an authentication source.
          db.prepare('INSERT INTO users(id,token_hash,tier,created_at) VALUES (?,?,?,?)').run(id,hash(randomBytes(32)),'basic',Date.now())
          db.prepare('INSERT INTO wechat_identities VALUES (?,?,?)').run(appId,openId,id);identity={user_id:id}
        }
        db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now())
        db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token),identity.user_id,expiresAt)
        const user=db.prepare('SELECT id,tier FROM users WHERE id=?').get(identity.user_id)
        db.exec('COMMIT');return {token,user,expiresAt}
      }catch(e){db.exec('ROLLBACK');throw e}
    },
    authenticate(token){if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new ApiError(401,'请先微信登录','UNAUTHORIZED');const user=db.prepare('SELECT u.id,u.tier FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?').get(hash(token),Date.now());if(!user)throw new ApiError(401,'登录已过期，请重新微信登录','UNAUTHORIZED');return user},
    revokeSession(token){db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token))},
    setFavorite(user,id){
      if(typeof id!=='string'||!db.prepare('SELECT id FROM catches WHERE user_id=? AND id=?').get(user.id,id))throw new ApiError(404,'没有找到这条鱼获')
      db.prepare('INSERT INTO preferences(user_id,favorite) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET favorite=excluded.favorite').run(user.id,id)
      return account(user)
    },
    list(user){return db.prepare('SELECT data,photo_id FROM catches WHERE user_id=? ORDER BY json_extract(data,\'$.date\') DESC, json_extract(data,\'$.time\') DESC, json_extract(data,\'$.createdAt\') DESC').all(user.id).map(serialize)},
    get(user,id){const row=db.prepare('SELECT * FROM catches WHERE user_id=? AND id=?').get(user.id,id);return row},
    save(user,input,photo=undefined){
      const validation=validateRecord(input,localDate());if(validation)throw new ApiError(400,validation)
      if(typeof input.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(input.id))throw new ApiError(400,'鱼获编号无效')
      if(!['台钓','路亚','小物钓','海竿','其他'].includes(input.method))throw new ApiError(400,'请选择有效钓法')
      for(const [key,max] of [['note',120],['city',20]])if(typeof input[key]!=='string'||input[key].length>max)throw new ApiError(400,'备注或城市格式无效')
      db.exec('BEGIN IMMEDIATE')
      try {
        const previous=db.prepare('SELECT * FROM catches WHERE user_id=? AND id=?').get(user.id,input.id)
        const quota=account(user)
        if(!previous&&quota.used>=quota.plan.limit)throw new ApiError(409,`${quota.plan.name}可保存 ${quota.plan.limit} 条鱼获，额度已满。可整理旧记录或查看会员额度。`,'QUOTA_EXCEEDED')
        const data={id:input.id,speciesId:input.speciesId,date:input.date,time:input.time||'',dateSource:['exif','camera','manual','unknown'].includes(input.dateSource)?input.dateSource:'manual',photoTakenAt:typeof input.photoTakenAt==='string'?input.photoTakenAt.slice(0,16):'',photoTimeSource:['exif','camera'].includes(input.photoTimeSource)?input.photoTimeSource:'unknown',createdAt:previous?JSON.parse(previous.data).createdAt:Number.isFinite(input.createdAt)&&input.createdAt>0&&input.createdAt<=Date.now()?input.createdAt:Date.now(),weight:input.weight??null,length:input.length??null,method:input.method,note:input.note,city:input.city}
        const blob=photo===undefined?(previous?.photo||null):photo
        const photoId=photo===undefined?(previous?.photo_id||null):blob?randomUUID():null
        db.prepare('INSERT INTO catches VALUES (?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET data=excluded.data,photo=excluded.photo,photo_id=excluded.photo_id').run(user.id,input.id,JSON.stringify(data),blob,photoId)
        db.exec('COMMIT');return serialize({data:JSON.stringify(data),photo_id:photoId})
      }catch(e){db.exec('ROLLBACK');throw e}
    },
    remove(user,id){const result=db.prepare('DELETE FROM catches WHERE user_id=? AND id=?').run(user.id,id);if(!result.changes)throw new ApiError(404,'没有找到这条鱼获');return account(user)},
    photo(id,expires,sig){
      if(!/^\d{10}$/.test(expires)||Number(expires)<Date.now()/1000||Number(expires)>Date.now()/1000+86401||!/^[a-f0-9]{64}$/.test(sig))throw new ApiError(403,'照片链接已失效，请重新打开鱼册')
      if(!timingSafeEqual(Buffer.from(sig,'hex'),Buffer.from(signature(id,expires),'hex')))throw new ApiError(403,'照片链接无效')
      const row=db.prepare('SELECT photo FROM catches WHERE photo_id=?').get(id);if(!row?.photo)throw new ApiError(404,'照片不存在');return row.photo
    },
    setTier(userId,tier){if(!membershipPlans.some(p=>p.id===tier))throw new Error('Unknown membership tier');const result=db.prepare('UPDATE users SET tier=? WHERE id=?').run(tier,userId);if(!result.changes)throw new Error('User not found');return account({id:userId})}
  }
}
