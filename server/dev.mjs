import { spawn } from 'node:child_process'
const args=process.argv.slice(2)
const api=spawn(process.execPath,['server/index.mjs'],{stdio:'inherit'})
const web=spawn(process.execPath,['node_modules/@dcloudio/vite-plugin-uni/bin/uni.js','--host','0.0.0.0',...args],{stdio:'inherit'})
let stopping=false
function stop(code=0){if(stopping)return;stopping=true;api.kill('SIGTERM');web.kill('SIGTERM');process.exitCode=code}
api.on('exit',code=>stop(code||0));web.on('exit',code=>stop(code||0))
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>stop())
