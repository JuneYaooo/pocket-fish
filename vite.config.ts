import { defineConfig, loadEnv } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
export default defineConfig(({mode})=>{
  const env=loadEnv(mode,process.cwd(),'')
  return {plugins:[uni()],server:{proxy:{'/api':{target:`http://127.0.0.1:${env.FISH_PORT||8787}`,changeOrigin:false}}}}
})
