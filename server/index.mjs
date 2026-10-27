import { mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createStore } from './store.mjs'
import { createApiServer } from './app.mjs'
const database=resolve(process.env.FISH_DB||'.data/pocket-fish.sqlite')
mkdirSync(dirname(database),{recursive:true})
const store=createStore(database)
const server=createApiServer(store,{recognitionUrl:process.env.FISH_RECOGNITION_URL,recognitionKey:process.env.FISH_RECOGNITION_KEY,recognitionModel:process.env.FISH_RECOGNITION_MODEL,wechatAppId:process.env.WECHAT_APP_ID,wechatAppSecret:process.env.WECHAT_APP_SECRET})
const port=Number(process.env.FISH_PORT||8787)
server.listen(port,'127.0.0.1',()=>console.log(`Pocket Fish API: http://127.0.0.1:${port}`))
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{store.close();process.exit(0)}))
