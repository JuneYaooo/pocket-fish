import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { createStore } from './store.mjs'
const [userId,tier]=process.argv.slice(2)
if(!userId||!tier){console.error('Usage: npm run member -- USER_ID basic|plus|collector');process.exit(1)}
const path=resolve(process.env.FISH_DB||'.data/pocket-fish.sqlite')
if(!existsSync(path)){console.error('Database does not exist. Start the API first.');process.exit(1)}
const store=createStore(path)
try{const a=store.setTier(userId,tier);console.log(JSON.stringify({id:a.id,tier:a.tier,used:a.used,limit:a.plan.limit},null,2))}finally{store.close()}
