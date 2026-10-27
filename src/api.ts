import type { CatchRecord, FishId } from './domain'
export interface Plan {id:string;name:string;limit:number;description:string}
export interface Account {id:string;identity:'wechat';favorite:string;tier:string;plan:Plan;used:number;remaining:number;plans:Plan[]}
export interface ServiceConfig {recognitionAvailable:boolean;identityMode:'wechat';wechatLoginAvailable:boolean}
export interface Candidate {speciesId:FishId;reason:string}
export class ServiceError extends Error {constructor(message:string,public code:string=''){super(message)}}
export function createFishApi(storagePrefix:string){
  const tokenKey=storagePrefix+'wechat-session.v1'
  let token:string=uni.getStorageSync(tokenKey)||''
  const clearSession=()=>{token='';uni.removeStorageSync(tokenKey)}
  const base=(import.meta.env.VITE_API_BASE_URL||'').replace(/\/$/,'')
  async function request<T>(path:string,method:'GET'|'POST'|'DELETE'='GET',data?:unknown):Promise<T>{
    // #ifdef MP-WEIXIN
    if(!base)throw new ServiceError('鱼册暂未开放，请稍后再试','NO_API')
    // #endif
    let response:UniApp.RequestSuccessCallbackResult
    try{response=await uni.request({url:base+path,method,data:data as any,header:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},timeout:30000})}catch{throw new ServiceError('暂时连接不上鱼册服务，草稿仍保留，可稍后重试','OFFLINE')}
    const payload=response.data as any
    if(response.statusCode===401&&payload?.code==='UNAUTHORIZED')clearSession()
    if(response.statusCode<200||response.statusCode>=300)throw new ServiceError(payload?.error||'鱼册服务暂不可用，请重试',payload?.code)
    return payload as T
  }
  const adapt=(r:CatchRecord)=>({...r,photo:r.photo?.startsWith('/api/')?base+r.photo:r.photo})
  return {
    config:()=>request<{config:ServiceConfig}>('/api/config'),
    async connect():Promise<{account:Account;config:ServiceConfig}|null>{
      if(!token)return null
      try{return await request<{account:Account;config:ServiceConfig}>('/api/account')}
      catch(e){if(e instanceof ServiceError&&e.code==='UNAUTHORIZED')return null;throw e}
    },
    async login():Promise<{account:Account;config:ServiceConfig}>{
      // #ifdef MP-WEIXIN
      let code=''
      try{code=(await uni.login({provider:'weixin'})).code||''}catch{throw new ServiceError('微信登录未完成，请重试','LOGIN_CANCELLED')}
      if(!code)throw new ServiceError('未能取得微信登录凭证，请重试','LOGIN_FAILED')
      const result=await request<{token:string;account:Account;config:ServiceConfig}>('/api/auth/wechat','POST',{code})
      token=result.token;uni.setStorageSync(tokenKey,token);return result
      // #endif
      // #ifndef MP-WEIXIN
      throw new ServiceError('请在微信小程序中登录，网页仅供预览','WECHAT_REQUIRED')
      // #endif
    },
    async logout(){await request('/api/auth/logout','POST',{});clearSession()},
    favorite:(id:string)=>request<{account:Account}>('/api/account/favorite','POST',{id}),
    async list(){const result=await request<{records:CatchRecord[]}>('/api/catches');return result.records.map(adapt)},
    account:()=>request<{account:Account;config:ServiceConfig}>('/api/account'),
    async save(record:CatchRecord){const result=await request<{record:CatchRecord;account:Account}>('/api/catches','POST',record);return {...result,record:adapt(result.record)}},
    remove:(id:string)=>request<{account:Account}>('/api/catches/'+encodeURIComponent(id),'DELETE'),
    recognize:(photo:string)=>request<{candidates:Candidate[]}>('/api/recognize','POST',{photo})
  }
}
