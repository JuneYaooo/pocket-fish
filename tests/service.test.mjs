import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync,rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { createStore } from '../server/store.mjs'
import { createApiServer } from '../server/app.mjs'
const record=(id)=>({id,speciesId:'crucian',date:'2024-06-12',time:'06:35',createdAt:Date.now(),photo:'',weight:.5,length:26,method:'台钓',city:'',note:'integration fixture',dateSource:'exif',photoTakenAt:'2024-06-12T06:35'})
test('persistent accounts isolate records; server enforces all tiers, edits, deletion and downgrade',()=>{
  const dir=mkdtempSync(join(tmpdir(),'pocket-fish-'));let store=createStore(join(dir,'test.sqlite'))
  try{
    const a=store.createWechatSession('wx-test','a'),b=store.createWechatSession('wx-test','b'),c=store.createWechatSession('wx-test','c')
    store.setTier(b.user.id,'plus');store.setTier(c.user.id,'collector')
    for(const [user,limit] of [[a.user,30],[b.user,300],[c.user,3000]]){
      for(let i=0;i<limit;i++)store.save(user,record('fish-'+i))
      assert.equal(store.account(user).used,limit)
      assert.throws(()=>store.save(user,record('overflow')),e=>e.code==='QUOTA_EXCEEDED')
      store.save(user,{...record('fish-0'),note:'edited at limit'})
      assert.equal(store.account(user).used,limit)
    }
    store.remove(a.user,'fish-1');store.save(a.user,record('replacement'));assert.equal(store.account(a.user).used,30)
    assert.throws(()=>store.remove(a.user,'missing'),e=>e.status===404)
    store.setTier(b.user.id,'basic');assert.equal(store.list(b.user).length,300);assert.throws(()=>store.save(b.user,record('new')),e=>e.status===409);store.save(b.user,{...record('fish-0'),note:'can still edit'})
    store.close();store=createStore(join(dir,'test.sqlite'))
    assert.equal(store.authenticate(a.token).id,a.user.id);assert.equal(store.list(a.user).length,30);assert.equal(store.list(b.user).length,300)
    assert.throws(()=>store.authenticate('wrong'),e=>e.status===401)
  }finally{store.close();rmSync(dir,{recursive:true,force:true})}
})
test('HTTP photo upload is isolated, strips metadata, survives reload; quota is atomic under concurrent requests',async()=>{
  const store=createStore(':memory:'),server=createApiServer(store,{wechatAppId:'wx-test',wechatAppSecret:'test-only',wechatFetch:async(url)=>({ok:true,json:async()=>({openid:new URL(url).searchParams.get('js_code'),session_key:'never-return-this'})})})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`
  const req=async(path,token,method='GET',body)=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})})
  try{
    const a=await(await req('/api/auth/wechat','','POST',{code:'a'})).json(),b=await(await req('/api/auth/wechat','','POST',{code:'b'})).json()
    assert.equal((await req('/api/catches','')).status,401)
    const raw=await sharp({create:{width:80,height:60,channels:3,background:'#ed824f'}}).jpeg().withMetadata().toBuffer()
    const saved=await(await req('/api/catches',a.token,'POST',{...record('photo'),photo:`data:image/jpeg;base64,${raw.toString('base64')}`})).json()
    assert.equal(saved.account.used,1);assert.ok(saved.record.photo.startsWith('/api/photos/'))
    assert.equal((await(await req('/api/catches',b.token)).json()).records.length,0)
    assert.equal((await req('/api/catches/photo',b.token,'DELETE')).status,404)
    assert.equal((await req('/api/catches',b.token,'POST',{...record('steal'),photo:saved.record.photo})).status,400)
    const photoResponse=await fetch(base+saved.record.photo);assert.equal(photoResponse.status,200)
    const info=await sharp(Buffer.from(await photoResponse.arrayBuffer())).metadata();assert.equal(info.exif,undefined);assert.equal(info.width,80)
    assert.equal((await fetch(base+saved.record.photo.replace(/signature=.*/, 'signature='+'0'.repeat(64)))).status,403)
    for(let i=0;i<28;i++)store.save(store.authenticate(a.token),record('prior-'+i))
    const simultaneous=await Promise.all([req('/api/catches',a.token,'POST',record('last-a')),req('/api/catches',a.token,'POST',record('last-b'))])
    assert.deepEqual(simultaneous.map(r=>r.status).sort(),[200,409]);assert.equal(store.account(a.account).used,30)
    assert.equal((await req('/api/catches',a.token,'POST',{...record('badtime'),time:'25:00'})).status,400)
    assert.equal((await req('/api/recognize',a.token,'POST',{photo:'bad'})).status,503)
  }finally{await new Promise(resolve=>server.close(resolve));store.close()}
})
