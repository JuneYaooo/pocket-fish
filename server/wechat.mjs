import { ApiError } from './store.mjs'

// OpenID is accepted only from WeChat's server response, never from the client.
export async function exchangeWechatCode(code, { appId, appSecret, fetcher=fetch }) {
  if (!appId || !appSecret) throw new ApiError(503,'微信登录暂未开通，请稍后再试','WECHAT_UNAVAILABLE')
  if (typeof code!=='string' || !code.trim() || code.length>256) throw new ApiError(400,'请重新发起微信登录','INVALID_CODE')
  const url=new URL('https://api.weixin.qq.com/sns/jscode2session')
  url.search=new URLSearchParams({appid:appId,secret:appSecret,js_code:code,grant_type:'authorization_code'}).toString()
  let result
  try {
    const response=await fetcher(url,{signal:AbortSignal.timeout(10000)})
    if (!response.ok) throw new Error('Upstream unavailable')
    result=await response.json()
  } catch { throw new ApiError(502,'微信登录暂时未成功，请重试','WECHAT_FAILED') }
  if (result.errcode || typeof result.openid!=='string' || !result.openid || result.openid.length>128) {
    throw new ApiError(401,'微信登录凭证已失效，请重新登录','WECHAT_REJECTED')
  }
  return result.openid
}
