import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createStore } from '../server/store.mjs'
import { createApiServer } from '../server/app.mjs'
import { exchangeWechatCode } from '../server/wechat.mjs'

const catchRecord={id:'shared-fish',speciesId:'crucian',date:'2024-06-12',time:'06:35',photo:'',weight:1,length:25,method:'台钓',city:'',note:'account fixture'}

test('same WeChat account restores catches, photos, tier and favorite across sessions; another identity is isolated',()=>{
  const store=createStore(':memory:')
  try{
    const first=store.createWechatSession('wx-app','openid-a')
    store.save(first.user,catchRecord,Buffer.from('photo-fixture'));store.setTier(first.user.id,'plus');store.setFavorite(first.user,catchRecord.id)
    const second=store.createWechatSession('wx-app','openid-a'),other=store.createWechatSession('wx-app','openid-b'),otherApp=store.createWechatSession('wx-other','openid-a')
    assert.equal(second.user.id,first.user.id);assert.notEqual(second.token,first.token)
    assert.equal(store.account(second.user).tier,'plus');assert.equal(store.account(second.user).used,1)
    assert.equal(store.account(second.user).favorite,catchRecord.id)
    assert.equal(store.list(second.user)[0].id,catchRecord.id)
    assert.equal(Buffer.from(store.get(second.user,catchRecord.id).photo).toString(),'photo-fixture')
    assert.equal(store.list(other.user).length,0);assert.notEqual(otherApp.user.id,first.user.id)
    assert.throws(()=>store.setFavorite(other.user,catchRecord.id),e=>e.status===404)
    store.revokeSession(first.token)
    assert.throws(()=>store.authenticate(first.token),e=>e.status===401)
    assert.equal(store.authenticate(second.token).id,first.user.id)
    store.db.prepare('UPDATE sessions SET expires_at=0').run()
    assert.throws(()=>store.authenticate(second.token),e=>e.status===401)
  }finally{store.close()}
})

test('legacy data is preserved without trusting old anonymous tokens or binding it to an unrelated WeChat account',()=>{
  const store=createStore(':memory:'),oldToken='1'.repeat(64)
  try{
    store.db.prepare('INSERT INTO users VALUES (?,?,?,?)').run('legacy',createHash('sha256').update(oldToken).digest('hex'),'collector',Date.now())
    store.save({id:'legacy'},catchRecord)
    assert.throws(()=>store.authenticate(oldToken),e=>e.status===401)
    const next=store.createWechatSession('wx-app','openid-a')
    assert.equal(store.list(next.user).length,0)
    assert.equal(store.list({id:'legacy'}).length,1)
  }finally{store.close()}
})

test('code exchange uses the fixed official endpoint and rejects missing configuration, invalid codes and upstream failures',async()=>{
  const config={appId:'wx-app',appSecret:'server-secret'}
  let called=0
  assert.equal(await exchangeWechatCode('one-use-code',{...config,fetcher:async(url)=>{
    called++;assert.equal(url.origin+url.pathname,'https://api.weixin.qq.com/sns/jscode2session')
    assert.equal(url.searchParams.get('grant_type'),'authorization_code');assert.equal(url.searchParams.get('js_code'),'one-use-code')
    assert.equal(url.searchParams.get('secret'),'server-secret')
    return{ok:true,json:async()=>({openid:'verified-id',session_key:'private'})}
  }}),'verified-id')
  assert.equal(called,1)
  await assert.rejects(exchangeWechatCode('code',{}),e=>e.code==='WECHAT_UNAVAILABLE')
  await assert.rejects(exchangeWechatCode('',config),e=>e.code==='INVALID_CODE')
  await assert.rejects(exchangeWechatCode('bad',{...config,fetcher:async()=>({ok:true,json:async()=>({errcode:40029,errmsg:'invalid'})})}),e=>e.code==='WECHAT_REJECTED')
  await assert.rejects(exchangeWechatCode('bad',{...config,fetcher:async()=>{throw new Error('secret must never be surfaced')}}),e=>e.code==='WECHAT_FAILED'&&!e.message.includes('secret'))
})

test('HTTP login ignores supplied user identity, restores the verified account, and logout revokes only its session',async()=>{
  const store=createStore(':memory:')
  const server=createApiServer(store,{wechatAppId:'wx-app',wechatAppSecret:'server-secret',wechatFetch:async(url)=>({ok:true,json:async()=>new URL(url).searchParams.get('js_code')==='invalid'?{errcode:40029}:{openid:'verified-id',session_key:'private-session-key'}})})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`
  const req=(path,body,token)=>fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})})
  try{
    assert.equal((await req('/api/session',{})).status,410)
    assert.equal((await req('/api/auth/wechat',{openid:'spoofed'})).status,400)
    assert.equal((await req('/api/auth/wechat',{code:'invalid'})).status,401)
    const first=await(await req('/api/auth/wechat',{code:'code-1',openid:'spoofed',tier:'collector'})).json()
    assert.equal(first.account.tier,'basic');assert.equal(first.account.identity,'wechat')
    assert.equal(first.openid,undefined);assert.equal(first.session_key,undefined)
    assert.equal(JSON.stringify(first).includes('server-secret'),false)
    await req('/api/catches',catchRecord,first.token)
    await req('/api/account/favorite',{id:catchRecord.id},first.token)
    const second=await(await req('/api/auth/wechat',{code:'code-2'})).json()
    assert.equal(second.account.id,first.account.id);assert.equal(second.account.used,1);assert.equal(second.account.favorite,catchRecord.id)
    assert.equal((await req('/api/auth/logout',{},first.token)).status,200)
    assert.equal((await req('/api/account',null,first.token)).status,401)
    assert.equal((await req('/api/account',null,second.token)).status,200)
  }finally{await new Promise(resolve=>server.close(resolve));store.close()}
})
