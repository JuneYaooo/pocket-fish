<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch, getCurrentInstance, onMounted, onUnmounted } from 'vue'
import { onBackPress } from '@dcloudio/uni-app'
import AppIcon from '@/components/AppIcon.vue'
import FishArt from '@/components/FishArt.vue'
import { species, getSpecies, demoRecords, ordered, achievements, stats, localDate, formatDate, validateRecord, searchSpecies, membershipPlans } from '@/domain'
import type { CatchRecord, FishId } from '@/domain'
import { createFishApi } from '@/api'
import type { Account, Candidate, ServiceConfig } from '@/api'
import { preparePhoto } from '@/photo'
import type { PhotoSource } from '@/photo'

let storagePrefix = 'pocket-fish.'
// #ifdef H5
if (import.meta.env.DEV && new URLSearchParams(location.search).get('sandbox') === '1') storagePrefix = 'pocket-fish.qa.'
// #endif
const ownRecords = ref<CatchRecord[]>([])
const isDemo = ref(false)
let isWechat = false
// #ifdef H5
isDemo.value = true
// #endif
// #ifdef MP-WEIXIN
isWechat = true
// #endif
let nativeTop = 0
// #ifdef MP-WEIXIN
nativeTop = uni.getSystemInfoSync().statusBarHeight || 0
// #endif
const tab = ref('album'), filter = ref('all'), query = ref('')
watch(tab,()=>nextTick(()=>{
  uni.pageScrollTo({scrollTop:0,duration:0})
  // #ifdef H5
  document.querySelector('.app-shell')?.scrollTo({top:0})
  // #endif
}))
const panel = ref(''), selectedFish = ref<FishId>('mandarin'), selectedId = ref('')
const busy = ref(false), error = ref(''), toastText = ref(''), poster = ref(''), showCity = ref(false)
const posterStyle = ref<'field'|'record'>('field')
const favorite = ref('')
const savedDraft = ref<any>(null)
let draftOwner = ''
let pendingAction: null | (()=>void|Promise<void>) = null
const api=createFishApi(storagePrefix)
const account=ref<Account|null>(null),serviceConfig=ref<ServiceConfig>({recognitionAvailable:false,identityMode:'wechat',wechatLoginAvailable:false})
const serviceReady=ref(false),serviceError=ref(''),connecting=ref(false)
const savedNewSpecies=ref(false)
const photoBusy=ref(false),recognizing=ref(false),recognitionNote=ref(''),candidates=ref<Candidate[]>([])
const speciesQuery=ref(''),albumView=ref(isDemo.value?'catches':'species'),dateTouched=ref(false)
let photoEpoch=0
const matchedSpecies=computed(()=>searchSpecies(speciesQuery.value))
const quotaFull=computed(()=>!!account.value&&account.value.remaining===0)
function clearAccount(){account.value=null;ownRecords.value=[];favorite.value='';serviceReady.value=false}
async function loadAccount(result:{account:Account;config:ServiceConfig}){
  const remote=await api.list()
  if(draftOwner&&draftOwner!==result.account.id){savedDraft.value=null;Object.assign(form,{id:'',pendingId:'',photo:'',note:'',city:''})}
  draftOwner=result.account.id
  account.value=result.account;serviceConfig.value=result.config;favorite.value=result.account.favorite
  ownRecords.value=remote;serviceReady.value=true;isDemo.value=false
  if(remote.some(r=>r.photo))albumView.value='catches'
}
async function connectService(){
  if(connecting.value)return
  connecting.value=true;serviceError.value=''
  try{
    serviceConfig.value=(await api.config()).config
    const result=await api.connect()
    if(result)await loadAccount(result)
    else clearAccount()
  }catch(e:any){serviceError.value=e.message||'暂时连接不上鱼册，请稍后重试';if(e.code==='UNAUTHORIZED')clearAccount()}
  finally{connecting.value=false}
}
function requireAccount(action:()=>void|Promise<void>){
  if(account.value&&serviceReady.value)return true
  pendingAction=action;error.value='';panel.value='login';return false
}
function openLogin(){pendingAction=()=>startOwn();error.value='';panel.value='login'}
async function loginWechat(){
  if(connecting.value)return
  connecting.value=true;error.value=''
  try{
    await loadAccount(await api.login());serviceError.value='';panel.value=''
    const next=pendingAction;pendingAction=null
    if(next)await next()
  }catch(e:any){error.value=e.message||'微信登录未完成，请重试'}finally{connecting.value=false}
}
async function logout(){
  if(busy.value||connecting.value)return
  try{await api.logout()}catch(e:any){if(e.code!=='UNAUTHORIZED'){toast(e.message||'退出未成功，请重试');return}}
  clearAccount();savedDraft.value=null;draftOwner='';pendingAction=null;poster.value='';selectedId.value=''
  Object.assign(form,{id:'',pendingId:'',photo:'',note:'',city:''});panel.value='';isDemo.value=false;tab.value='album'
  toast('已退出登录，鱼册仍保存在你的微信账号下')
}
onMounted(()=>void connectService())
const instance = getCurrentInstance()
let toastTimer: ReturnType<typeof setTimeout>
// #ifdef H5
const keyboardAction=(event:KeyboardEvent)=>{const target=event.target as HTMLElement;if((event.key==='Enter'||event.key===' ')&&target.getAttribute('role')==='button'){event.preventDefault();target.click()}}
onMounted(()=>document.addEventListener('keydown',keyboardAction))
onUnmounted(()=>document.removeEventListener('keydown',keyboardAction))
// #endif
onUnmounted(()=>clearTimeout(toastTimer))
const toast = (message:string) => { toastText.value=message; clearTimeout(toastTimer); toastTimer=setTimeout(()=>toastText.value='',3200) }
const records = computed(()=>isDemo.value ? demoRecords : ownRecords.value)
const summary = computed(()=>stats(records.value))
const latest = computed(()=>ordered(records.value).reverse())
const hero = computed(()=>records.value.find(r=>r.id===favorite.value) || latest.value[0])
const fish = computed(()=>getSpecies(selectedFish.value))
const fishRecords = computed(()=>ordered(records.value.filter(r=>r.speciesId===selectedFish.value)).reverse())
const selectedRecord = computed(()=>records.value.find(r=>r.id===selectedId.value) || fishRecords.value[0])
const visibleSpecies = computed(()=>species.filter(s=>(!query.value||s.name.includes(query.value)||s.latin.toLowerCase().includes(query.value.toLowerCase())) && (filter.value==='all'||(filter.value==='collected' ? has(s.id) : !has(s.id)))))
const catchLimit=ref(24),tripLimit=ref(20)
const shownCatches=computed(()=>latest.value.slice(0,catchLimit.value))
const trips = computed(()=>{const groups=new Map<string,CatchRecord[]>();for(const r of latest.value){if(!groups.has(r.date))groups.set(r.date,[]);groups.get(r.date)!.push(r)}return [...groups].map(([date,records])=>({date,records}))})
const has = (id:FishId) => records.value.some(r=>r.speciesId===id)
const count = (id:FishId) => records.value.filter(r=>r.speciesId===id).length
const badge = (r:CatchRecord) => {const a=achievements(r,records.value); return a.first?'首次钓获':a.weightPB||a.lengthPB?'个人最佳':'鱼获收藏'}
const pbText = (r:CatchRecord) => { const a=achievements(r,records.value); return [a.weightPB?'重量纪录':'',a.lengthPB?'长度纪录':''].filter(Boolean).join(' · ') }
const weightText = (r?:CatchRecord) => r?.weight != null ? `${r.weight} kg` : '未称重'
const photoCaption = (r?:CatchRecord) => r?.photo ? (isDemo.value ? 'AI 鱼获示例' : '我的鱼获照片') : '鱼种图鉴插画'
const form = reactive({id:'',pendingId:'',speciesId:'' as FishId|'',date:localDate(),time:'',dateSource:'unknown' as NonNullable<CatchRecord['dateSource']>,photoTakenAt:'',photoTimeSource:'unknown' as 'exif'|'camera'|'unknown',photo:'',weight:'',length:'',method:'台钓',note:'',city:''})
const saveLabel=computed(()=>busy.value?'正在保存…':(!form.id&&!form.pendingId&&quotaFull.value?'存储额度已满':form.photo?'保存实拍鱼获':'保存鱼获'))
const methods = ['台钓','路亚','小物钓','海竿','其他']
const draftPayload = () => ({...form})
watch(form,()=>{if(panel.value==='record'&&account.value){savedDraft.value=draftPayload();draftOwner=account.value.id}})
function startOwn(){if(!requireAccount(()=>startOwn()))return;albumView.value='catches';isDemo.value=false;query.value='';filter.value='all';panel.value='';tab.value='album' }
function showDetail(id:FishId,recordId=''){selectedFish.value=id;selectedId.value=recordId;panel.value='detail'}
function openRecord(id?:FishId,edit?:CatchRecord,resume=false){
  if(!requireAccount(()=>openRecord(id,edit,resume)))return
  if(!edit&&!resume&&quotaFull.value){panel.value='membership';return}
  error.value='';busy.value=false;speciesQuery.value='';candidates.value=[];recognitionNote.value='';photoEpoch++
  const existing = resume ? savedDraft.value : edit ? {...edit,weight:edit.weight==null?'':String(edit.weight),length:edit.length==null?'':String(edit.length)} : null
  Object.assign(form,{id:'',pendingId:'',speciesId:id||'',date:localDate(),time:'',dateSource:'unknown',photoTakenAt:'',photoTimeSource:'unknown' as 'exif'|'camera'|'unknown',photo:'',weight:'',length:'',method:'台钓',note:'',city:''},existing||{})
  dateTouched.value=!!existing?.date
  panel.value='record'
}
async function beginCapture(source:PhotoSource){if(!requireAccount(()=>beginCapture(source)))return;openRecord();if(panel.value==='record')await choosePhoto(source)}
function closePanel(){if(busy.value||photoBusy.value||connecting.value)return;if(panel.value==='login')pendingAction=null;photoEpoch++;recognizing.value=false;panel.value='';error.value=''}
onBackPress(()=>{if(panel.value){closePanel();return true}return false})
function discardDraft(){if(photoBusy.value||busy.value)return;photoEpoch++;savedDraft.value=null;panel.value='';toast('草稿已移除')}
function editCatchDate(value:string){form.date=value;dateTouched.value=true;form.dateSource='manual'}
function editCatchTime(value:string){form.time=value;dateTouched.value=true;form.dateSource='manual'}
function applyPhotoTime(){if(!form.photoTakenAt)return;form.date=form.photoTakenAt.slice(0,10);form.time=form.photoTakenAt.slice(11,16);form.dateSource=form.photoTimeSource;dateTouched.value=false}
const timeHint=computed(()=>form.dateSource==='exif'?'已读取原照片拍摄时间，可手动修改':form.dateSource==='camera'?'按本次拍照时间填写，可手动修改':form.dateSource==='manual'?'已手动设置钓获时间':form.photo?'照片没有可读取的拍摄时间，请选择钓获日期':'可补录往日鱼获，日期和时间都能修改')
async function choosePhoto(source:PhotoSource='album'){
  if(photoBusy.value||busy.value)return
  error.value='';photoBusy.value=true;const epoch=++photoEpoch;candidates.value=[];recognitionNote.value='';recognizing.value=false
  try{
    const result=await preparePhoto(source)
    if(epoch!==photoEpoch)return
    form.photo=result.photo;form.photoTakenAt=result.takenAt;form.photoTimeSource=result.timeSource
    if(!dateTouched.value){form.date=result.takenAt.slice(0,10);form.time=result.takenAt.slice(11,16);form.dateSource=result.timeSource}
    if(serviceConfig.value.recognitionAvailable)void recognizePhoto()
    else recognitionNote.value='自动识鱼尚未开通，先搜索鱼名或别名匹配鱼卡。'
  }catch(e:any){if(!String(e?.errMsg||e?.message||'').toLowerCase().includes('cancel'))error.value=e.message||'照片没有导入成功，请重试'}finally{photoBusy.value=false}
}
async function recognizePhoto(){
  if(!form.photo||recognizing.value)return
  const epoch=photoEpoch,photo=form.photo;recognizing.value=true;recognitionNote.value='正在分析照片中的鱼…'
  try{
    const result=await api.recognize(photo)
    if(epoch!==photoEpoch||form.photo!==photo)return
    candidates.value=result.candidates
    recognitionNote.value=result.candidates.length?'找到可能对应的鱼卡，请对照实拍照片确认。':'暂未匹配到图鉴内鱼种，可搜索鱼名或先存为待确认。'
  }catch(e:any){if(epoch===photoEpoch)recognitionNote.value=e.message||'识鱼暂不可用，请手动选择鱼卡'}finally{if(epoch===photoEpoch)recognizing.value=false}
}
async function saveRecord(){
  if(busy.value||photoBusy.value)return
  if(!serviceReady.value){error.value=serviceError.value||'正在连接鱼册服务，请稍后保存';return}
  if(!form.id&&!form.pendingId)form.pendingId=`catch-${Date.now()}-${Math.random().toString(36).slice(2,7)}`
  const record:CatchRecord={id:form.id||form.pendingId,createdAt:ownRecords.value.find(r=>r.id===form.id)?.createdAt||Date.now(),speciesId:form.speciesId as FishId,date:form.date,time:form.time,dateSource:form.dateSource,photoTakenAt:form.photoTakenAt,photoTimeSource:form.photoTimeSource,photo:form.photo,weight:form.weight.trim()===''?null:Number(form.weight),length:form.length.trim()===''?null:Number(form.length),method:form.method,note:form.note.trim(),city:form.city.trim()}
  error.value=validateRecord(record,localDate());if(error.value)return
  busy.value=true
  try{
    savedNewSpecies.value=!form.id&&record.speciesId!=='unknown'&&!ownRecords.value.some(r=>r.speciesId===record.speciesId)
    const saved=await api.save(record);account.value=saved.account
    ownRecords.value=ownRecords.value.some(r=>r.id===record.id)?ownRecords.value.map(r=>r.id===record.id?saved.record:r):[...ownRecords.value,saved.record]
    isDemo.value=false;savedDraft.value=null
    photoEpoch++;recognizing.value=false;selectedFish.value=record.speciesId;selectedId.value=record.id;panel.value='success';tab.value='album';albumView.value='catches';query.value='';filter.value='all'
  }catch(e:any){error.value=e.message||'鱼获未保存，草稿已保留，请重试';if(e.code==='UNAUTHORIZED'){clearAccount();requireAccount(()=>openRecord(undefined,undefined,true))}if(e.code==='QUOTA_EXCEEDED'){try{account.value=(await api.account()).account}catch{}}}finally{busy.value=false}
}
async function setFavorite(){
  if(!selectedRecord.value||busy.value)return
  if(isDemo.value){toast('示例鱼册仅供浏览，请先微信登录');return}
  busy.value=true
  try{const result=await api.favorite(selectedRecord.value.id);account.value=result.account;favorite.value=result.account.favorite;toast('已设为鱼册代表作')}
  catch(e:any){toast(e.message||'未能设置，请重试')}finally{busy.value=false}
}
async function deleteRecord(){
  const r=selectedRecord.value;if(!r||isDemo.value||busy.value)return
  const answer=await uni.showModal({title:'移除这条鱼获？',content:'实拍照片与记录将从鱼册移除，释放 1 条存储额度。',confirmText:'移除',confirmColor:'#a44e3c'})
  if(answer.confirm){busy.value=true;try{const result=await api.remove(r.id);account.value=result.account;ownRecords.value=ownRecords.value.filter(x=>x.id!==r.id);panel.value='';toast('鱼获已移除，已释放 1 条额度')}catch(e:any){toast(e.message||'未能移除，请重试')}finally{busy.value=false}}
}
function openShare(){showCity.value=false;poster.value='';posterStyle.value='field';panel.value='share';error.value=''}
function setPosterStyle(style:'field'|'record'){if(busy.value)return;posterStyle.value=style;if(poster.value)generatePoster()}
async function generatePoster(){
  const r=selectedRecord.value;if(!r||busy.value)return;busy.value=true;error.value='';poster.value=''
  try{
    await nextTick()
    const s=getSpecies(r.speciesId),ctx=uni.createCanvasContext('shareCanvas',instance?.proxy)
    const recordStyle=posterStyle.value==='record'
    const ink=recordStyle?'#f5efe3':'#202124', muted=recordStyle?'#c0b7a8':'#66635d'
    ctx.setFillStyle(recordStyle?'#17181a':'#e2d9c8');ctx.fillRect(0,0,600,860)
    ctx.setFillStyle(recordStyle?'#222326':'#f6f0e5');ctx.fillRect(24,24,552,812)
    ctx.setStrokeStyle(recordStyle?'#8e7957':'#b9aa8d');ctx.setLineWidth(1);ctx.strokeRect(40,40,520,780)
    ctx.setFillStyle(ink);ctx.setFontSize(22);ctx.fillText('口袋鱼获',66,89)
    ctx.setFillStyle(muted);ctx.setFontSize(13);ctx.fillText('每一尾，都亲手遇见。',66,115)
    ctx.setFillStyle(recordStyle?'#ff945d':'#365bd4');ctx.setFontSize(16);ctx.fillText(recordStyle?'曜石典藏':'钴蓝图鉴',448,88)
    ctx.setFillStyle(muted);ctx.setFontSize(13);ctx.fillText(isDemo.value?'示例鱼获':badge(r),448,114)
    ctx.setFillStyle(recordStyle?'#ed824f':'#4663df');ctx.fillRect(56,142,488,342)
    const imgPath=r.photo||'/static/fish-atlas.webp'
    if(r.photo||s.index>=0){const info=await uni.getImageInfo({src:imgPath});if(r.photo){const ratio=Math.min(464/info.width,318/info.height);const w=info.width*ratio,h=info.height*ratio;ctx.drawImage(info.path,68+(464-w)/2,154+(318-h)/2,w,h)}else{const sw=info.width/2,sh=info.height/2;ctx.drawImage(info.path,(s.index%2)*sw,(s.index>1?1:0)*sh,sw,sh,90,113,420,420)}}
    ctx.setStrokeStyle(recordStyle?'#412d22':'#d0d6fd');ctx.setLineWidth(1)
    for(let x=70;x<=530;x+=10){ctx.beginPath();ctx.moveTo(x,484);ctx.lineTo(x,484-(x%50===20?12:6));ctx.stroke()}
    ctx.setFillStyle(muted);ctx.setFontSize(12);ctx.fillText(photoCaption(r),66,510)
    ctx.setFillStyle(ink);ctx.setFontSize(42);ctx.fillText(s.name,66,563);ctx.setFontSize(15);ctx.setFillStyle(muted);ctx.fillText(s.latin,66,592)
    ctx.setFillStyle(ink);ctx.setFontSize(36);ctx.fillText(r.weight==null?'—':String(r.weight),66,648);ctx.fillText(r.length==null?'—':String(r.length),340,648)
    ctx.setFontSize(13);ctx.setFillStyle(muted);ctx.fillText(isDemo.value?'kg · 示例重量':'kg · 自报重量',66,674);ctx.fillText(isDemo.value?'cm · 示例长度':'cm · 自报长度',340,674)
    ctx.setStrokeStyle(recordStyle?'#605340':'#c8baa3');ctx.beginPath();ctx.moveTo(66,699);ctx.lineTo(534,699);ctx.stroke()
    ctx.setFillStyle(ink);ctx.setFontSize(17);ctx.fillText(`${formatDate(r.date)}${r.time?' '+r.time:''}  ·  ${r.method}`,66,735)
    ctx.setFillStyle(muted);ctx.setFontSize(15);ctx.fillText(showCity.value&&r.city?r.city:'钓点保密',66,767)
    ctx.setFillStyle(recordStyle?'#ff945d':'#365bd4');ctx.fillRect(66,793,28,3);ctx.setFillStyle(muted);ctx.setFontSize(12);ctx.fillText('把今天这一尾，收进口袋。',108,800)
    await new Promise<void>(resolve=>ctx.draw(false,()=>resolve()))
    const result=await new Promise<{tempFilePath:string}>((resolve,reject)=>uni.canvasToTempFilePath({canvasId:'shareCanvas',width:600,height:860,destWidth:1200,destHeight:1720,fileType:'png',success:resolve,fail:reject},instance?.proxy))
    poster.value=result.tempFilePath
  }catch {error.value='分享图生成失败，请重试。原始鱼获已保留。'}finally{busy.value=false}
}
async function savePoster(){if(!poster.value)return
  // #ifdef H5
  const a=document.createElement('a');a.href=poster.value;a.download=`口袋鱼获-${fish.value.name}-${selectedRecord.value?.date}.png`;a.click();toast('已发起图片下载，手机可长按预览图保存')
  // #endif
  // #ifdef MP-WEIXIN
  try{await uni.saveImageToPhotosAlbum({filePath:poster.value});toast('已保存到相册')}catch{error.value='未能保存，请允许相册权限，或长按预览图保存'}
  // #endif
}
function changeCity(e: any){showCity.value=e.detail.value;poster.value=''}
function previewPhoto(){const photo=selectedRecord.value?.photo;if(photo)uni.previewImage({urls:[photo]})}
function previewPoster(){if(poster.value)uni.previewImage({urls:[poster.value]})}
const badges=computed(()=>[
  {name:'初见之喜',description:'留下第一条鱼获',icon:'sparkles',achieved:summary.value.catches>0},
  {name:'淡水探索家',description:'点亮 3 个鱼种',icon:'fish',achieved:summary.value.fish>=3},
  {name:'超越自己',description:'刷新一次个人纪录',icon:'trophy',achieved:summary.value.pbs>0},
  {name:'水边常客',description:'留下 10 天出钓记录',icon:'compass',achieved:summary.value.days>=10}
])
</script>

<template>
  <view class="desktop-note"><view class="desktop-logo"><AppIcon name="fish" :size="30"/><text>口袋鱼获</text></view><text class="desktop-kicker">钓鱼人的随身收藏册</text><text class="desktop-title">这一尾，<br/>值得留一张。</text><text class="desktop-copy">从第一尾鲫鱼，到新的个人纪录。<br/>每一张卡，都来自亲手钓获的瞬间。</text><view class="desktop-line"/><text class="desktop-foot">拍鱼获 · 集鱼种 · 晒纪录</text></view>
  <view class="app-shell" :aria-hidden="!!panel">
    <view class="topbar" :style="nativeTop?{paddingTop:(nativeTop+9)+'px',paddingBottom:'15px'}:{}"><view class="brand"><view class="brand-mark"><AppIcon name="fish" :size="23"/></view><text>口袋鱼获</text><text class="brand-en">POCKET FISH</text></view><!-- #ifndef MP-WEIXIN --><button class="ui-button round-button" role="button" tabindex="0"  aria-label="打开设置" @click="panel='settings'"><AppIcon name="dots" :size="22"/></button><!-- #endif --></view>
    <view v-if="!account&&!isDemo" class="demo-strip"><text>微信登录，收藏每次钓获</text><button class="ui-button" role="button" tabindex="0" @click="openLogin">微信登录 <text>↗</text></button></view>
    <view v-if="isDemo" class="demo-strip"><text>示例鱼册 · AI 场景图片</text><button class="ui-button"  role="button" tabindex="0" @click="startOwn">开始我的收藏 <text>↗</text></button></view>
    <view v-if="tab==='album'" class="page-content">
      <view class="page-heading"><view><text class="eyebrow">每一尾，都值得珍藏。</text><text class="page-title">我的鱼册<text class="small-period">.</text></text></view><view class="edition"><text>淡水收藏</text><text class="edition-bottom">VOL. 01</text></view></view>
      <view class="stats-row"><view><text class="stat-number">{{String(summary.fish).padStart(2,'0')}}</text><text>点亮鱼种</text></view><view><text class="stat-number">{{String(summary.catches).padStart(2,'0')}}</text><text>鱼获收藏</text></view><view><text class="stat-number">{{String(summary.pbs).padStart(2,'0')}}</text><text>个人纪录</text></view></view>
      <view class="capture-actions">
        <button class="ui-button capture-now" role="button" tabindex="0" @click="beginCapture('camera')"><AppIcon name="camera" :size="26"/><view><text>拍照记鱼</text><text>刚上岸，拍一张</text></view><text class="capture-plus">＋</text></button>
        <button class="ui-button capture-past" role="button" tabindex="0" @click="beginCapture('album')"><AppIcon name="photo" :size="24"/><view><text>导入老照片</text><text>自动读取拍摄时间</text></view></button>
      </view>
      <view class="capture-caption"><button class="ui-button" role="button" tabindex="0" @click="openRecord()">也可以先记文字</button><button class="ui-button" role="button" tabindex="0" @click="panel='membership'"><text>{{account?`${account.plan.name} · ${account.used}/${account.plan.limit} 条`:'鱼获存储额度'}}</text><AppIcon name="chevron-right" :size="13"/></button></view>
      <view v-if="serviceError" class="service-alert"><text>{{serviceError}}</text><button class="ui-button" role="button" tabindex="0" @click="connectService">{{connecting?'正在重连…':'重新连接'}}</button></view>
      <button class="ui-button hero-card" role="button" tabindex="0" v-if="hero" :class="{'with-photo':!!hero.photo}" @click="showDetail(hero.speciesId,hero.id)" aria-label="查看代表鱼获">
        <view class="hero-top"><view class="hero-label"><AppIcon name="award" :size="16"/><text>本册代表作</text></view><text class="hero-num">{{hero.speciesId==='unknown'?'待确认鱼种':'图鉴 '+String(getSpecies(hero.speciesId).index+1).padStart(3,'0')}}</text></view>
        <view class="hero-scene"><view class="hero-field"/><text class="hero-watermark" aria-hidden="true">{{String(getSpecies(hero.speciesId).index+1).padStart(3,'0')}}</text><view class="hero-fish"><image v-if="hero.photo" :src="hero.photo" class="hero-photo" mode="aspectFit"/><FishArt v-else :index="getSpecies(hero.speciesId).index"/></view><text class="hero-stamp">{{badge(hero)}}</text><text class="hero-image-label">{{photoCaption(hero)}}</text><view class="field-ruler"/></view>
        <view class="hero-bottom"><view><text class="hero-name">{{getSpecies(hero.speciesId).name}}</text><text class="hero-latin">{{hero.date.slice(5).replace('-','.')}} · {{hero.method}}</text></view><view class="hero-facts"><view><text class="hero-value">{{hero.weight??'—'}}</text><text class="hero-unit"> kg</text></view><text>{{hero.length!=null?hero.length+' cm':'未测长'}} · {{isDemo?'示例尺寸':'自报尺寸'}}</text></view></view>
      </button>
      <view v-else class="empty-hero"><view class="empty-illustration"><FishArt :index="0"/></view><text class="empty-title">第一条鱼，第一段故事。</text><text class="muted">从相册里挑一张得意的鱼获，开始收藏。</text></view>
      <button class="ui-button draft-row" role="button" tabindex="0" v-if="savedDraft"  @click="openRecord(undefined,undefined,true)"><AppIcon name="file-pencil" :size="17"/><text>还有一条鱼获等你收进鱼册</text><AppIcon name="chevron-right" :size="16"/></button>
      <view class="section-heading"><view class="album-switch"><button class="ui-button" role="button" tabindex="0" :class="{active:albumView==='species'}" @click="albumView='species'">鱼种图鉴</button><button class="ui-button" role="button" tabindex="0" :class="{active:albumView==='catches'}" @click="albumView='catches'">鱼获照片</button></view><text class="section-meta">{{albumView==='species'?`${summary.fish} / ${species.length} 已点亮`:`${summary.catches} 条鱼获`}}</text></view>
      <view v-if="albumView==='catches'" class="catch-grid">
        <button class="ui-button catch-tile" role="button" tabindex="0" v-for="r in shownCatches" :key="r.id" @click="showDetail(r.speciesId,r.id)"><view class="catch-tile-photo"><image v-if="r.photo" :src="r.photo" :lazy-load="true" mode="aspectFit"/><FishArt v-else :index="getSpecies(r.speciesId).index"/><text>{{photoCaption(r)}}</text></view><view class="catch-tile-copy"><text>{{getSpecies(r.speciesId).name}}</text><text>{{formatDate(r.date)}} {{r.time||''}}</text><text>{{weightText(r)}} · {{r.method}}</text></view></button>
        <view v-if="!latest.length" class="inline-empty">拍下第一条鱼，或从相册导入过去的鱼获。</view>
      </view>
      <button v-if="albumView==='catches'&&latest.length>catchLimit" class="ui-button quiet-button" role="button" tabindex="0" @click="catchLimit+=24">继续查看鱼获（{{shownCatches.length}} / {{latest.length}}）</button>
      <template v-if="albumView==='species'">
      <view class="collection-progress" role="img" :aria-label="`已收集 ${summary.fish} 个鱼种，共 ${species.length} 个`"><view v-for="s in species" :key="s.id" :class="{filled:has(s.id)}"/></view>
      <view class="collection-tools"><view class="filter-tabs"><button class="ui-button"  role="button" tabindex="0" :class="{active:filter==='all'}" @click="filter='all'">全部</button><button class="ui-button"  role="button" tabindex="0" :class="{active:filter==='collected'}" @click="filter='collected'">已点亮</button><button class="ui-button"  role="button" tabindex="0" :class="{active:filter==='locked'}" @click="filter='locked'">待解锁</button></view><view class="search"><AppIcon name="search" :size="16"/><input v-model="query" placeholder="找鱼种" aria-label="搜索鱼种" maxlength="40"/></view></view>
      <view class="fish-grid"><button class="ui-button species-card" role="button" tabindex="0" v-for="s in visibleSpecies" :key="s.id"  :class="{uncollected:!has(s.id)}" @click="showDetail(s.id)"><view class="species-color" :style="{background:s.color}"/><view class="species-top"><text>{{String(s.index+1).padStart(3,'0')}}</text><AppIcon v-if="has(s.id)" name="circle-check" :size="17"/><AppIcon v-else name="lock" :size="15"/></view><view class="species-art" :class="'species-art-'+s.id"><FishArt :index="s.index" :locked="!has(s.id)"/></view><view class="species-caption"><text class="species-name">{{s.name}}</text><text class="species-latin">{{s.latin}}</text><view class="species-count"><text>{{has(s.id)?`${count(s.id)} 条鱼获`:'等一次不期而遇'}}</text><AppIcon name="arrow-up-right" :size="15"/></view></view></button></view>
      <view v-if="!visibleSpecies.length" class="inline-empty">还没有匹配的鱼种，换个名字或筛选试试。</view>
      <button class="ui-button draft-row"  role="button" tabindex="0" v-if="records.some(r=>r.speciesId==='unknown')"  @click="showDetail('unknown')"><AppIcon name="fish" :size="18"/><text>{{count('unknown')}} 条鱼获待确认鱼种</text><AppIcon name="chevron-right" :size="16"/></button>
      </template>
      <view class="album-end"><AppIcon name="ripple" :size="23"/><text>大鱼小鱼，都有一席之地。</text></view>
    </view>

    <view v-else-if="tab==='trips'" class="page-content">
      <view class="page-heading"><view><text class="eyebrow">有鱼，有风，也有好时光。</text><text class="page-title">出钓手记<text class="small-period">.</text></text></view><AppIcon name="compass" :size="32"/></view>
      <view class="journal-summary"><text class="journal-count">{{summary.days}}</text><view><text>个留在水边的日子</text><text class="muted">共收集 {{summary.catches}} 条鱼获</text></view></view>
      <view v-if="!trips.length" class="empty-block"><AppIcon name="sun" :size="38"/><text class="empty-title">下一次出钓，从这里记起。</text><text class="muted">照片、钓法和那天的心情，都值得留下。</text><button class="ui-button primary" role="button" tabindex="0"  @click="openRecord()">记录第一条鱼获</button></view>
      <view v-for="trip in trips.slice(0,tripLimit)" :key="trip.date" class="trip-group"><view class="trip-date"><text>{{formatDate(trip.date)}}</text><text>{{trip.records.length}} 条鱼获</text></view><button class="ui-button trip-item" role="button" tabindex="0" v-for="r in trip.records" :key="r.id"  @click="showDetail(r.speciesId,r.id)"><view class="trip-art" :style="{background:getSpecies(r.speciesId).color}"><image v-if="r.photo" :src="r.photo" mode="aspectFill"/><FishArt v-else :index="getSpecies(r.speciesId).index"/></view><view class="trip-copy"><view class="trip-title"><text>{{getSpecies(r.speciesId).name}}</text><text class="tiny-tag">{{badge(r)}}</text></view><text class="trip-note">{{r.note||'今天的鱼获，留给以后的自己。'}}</text><text class="trip-meta">{{weightText(r)}} · {{r.method}}</text></view><AppIcon name="chevron-right" :size="17"/></button></view>
      <button v-if="trips.length>tripLimit" class="ui-button quiet-button" role="button" tabindex="0" @click="tripLimit+=20">查看更早的出钓记录</button>
    </view>

    <view v-else class="page-content">
      <view class="profile-heading"><view class="avatar"><AppIcon name="fish" :size="40"/></view><view><text class="profile-name">{{isDemo?'水边的收藏家':'我的水边故事'}}</text><text class="muted">每一条，都亲手遇见。</text></view></view>
      <button v-if="!account" class="ui-button primary profile-login" role="button" tabindex="0" @click="openLogin">微信登录 · 开始我的收藏</button><text v-else class="account-status">已登录微信账号 · 鱼册随账号保存</text>
      <view class="profile-stats"><view><text>{{summary.fish}}</text><text>鱼种</text></view><view><text>{{summary.catches}}</text><text>鱼获</text></view><view><text>{{summary.days}}</text><text>出钓日</text></view></view>
      <button class="ui-button member-summary" role="button" tabindex="0" @click="panel='membership'"><AppIcon name="crown" :size="27"/><view><text>{{account?.plan.name||'鱼获存储'}}</text><text>{{account?`已存 ${account.used} 条 · 还可存 ${account.remaining} 条`:'查看不同会员的收藏额度'}}</text></view><AppIcon name="chevron-right" :size="18"/></button>
      <view class="section-heading"><text class="section-title">我的成就</text><text class="section-meta">{{badges.filter(b=>b.achieved).length}} 枚已获得</text></view>
      <view class="badge-grid"><view v-for="b in badges" :key="b.name" class="achievement" :class="{dim:!b.achieved}"><view class="medal"><AppIcon :name="b.icon" :size="30"/></view><text class="badge-name">{{b.name}}</text><text class="badge-description">{{b.description}}</text></view></view>
      <view class="section-heading"><text class="section-title">个人纪录</text><AppIcon name="trophy" :size="20"/></view>
      <view v-if="!records.some(r=>r.weight!==null||r.length!==null)" class="inline-empty">记录实测重量或长度，留下自己的第一项纪录。</view>
      <view v-for="s in species.filter(s=>has(s.id))" :key="s.id" class="record-row"><text>{{s.name}}</text><view><text>{{records.filter(r=>r.speciesId===s.id&&r.weight!=null).length ? Math.max(...records.filter(r=>r.speciesId===s.id).map(r=>r.weight||0))+' kg' : '未称重'}}</text><text class="muted">{{records.filter(r=>r.speciesId===s.id&&r.length!=null).length ? Math.max(...records.filter(r=>r.speciesId===s.id).map(r=>r.length||0))+' cm' : '未测量'}}</text></view></view>
      <button class="ui-button settings-row" role="button" tabindex="0"  @click="panel='settings'"><AppIcon name="shield-lock" :size="21"/><view><text>我的鱼册，我做主</text><text class="muted">独立鱼册 · 钓点默认保密</text></view><AppIcon name="chevron-right" :size="18"/></button>
    </view>

    <view class="bottom-nav"><button class="ui-button"  role="button" tabindex="0" :class="{selected:tab==='album'}" @click="tab='album'"><AppIcon name="cards" :size="23"/><text>鱼册</text></button><button class="ui-button"  role="button" tabindex="0" :class="{selected:tab==='trips'}" @click="tab='trips'"><AppIcon name="compass" :size="23"/><text>出钓</text></button><button class="ui-button"  role="button" tabindex="0" :class="{selected:tab==='profile'}" @click="tab='profile'"><AppIcon name="user-circle" :size="23"/><text>我的</text></button></view>
  </view>

  <view v-if="panel" class="modal-layer" role="dialog" aria-modal="true" :aria-label="panel==='login'?'微信登录':panel==='record'?'记录鱼获':'鱼获详情'">
    <view class="scrim" @click="closePanel"/>
    <view class="sheet" :class="{'record-sheet':panel==='record','login-sheet':panel==='login'}"><view class="sheet-handle"/><view class="sheet-heading"><text>{{panel==='record'?(form.id?'编辑鱼获':'记录这条鱼'):panel==='login'?'登录我的鱼册':panel==='membership'?'我的存储额度':panel==='settings'?'我的鱼册':panel==='share'?'分享这份好手气':panel==='success'?(form.id?'鱼获已更新':'已收进鱼册'):fish.name}}</text><button class="ui-button round-button" role="button" tabindex="0"  aria-label="关闭弹窗" @click="closePanel"><AppIcon name="x" :size="22"/></button></view>
      <scroll-view :key="panel" scroll-y class="sheet-scroll">
        <view v-if="panel==='login'" class="login-body">
          <view class="login-emblem"><AppIcon name="fish" :size="48"/></view>
          <text class="login-title">每次上岸，都在你的鱼册里。</text>
          <text class="login-copy">微信登录后，照片、钓获记录和会员额度跟随账号保存。换一部手机，也能继续收藏。</text>
          <button v-if="isWechat" class="ui-button primary" role="button" tabindex="0" :disabled="connecting" @click="loginWechat">{{connecting?'正在微信登录…':'微信登录'}}</button>
          <view v-else class="login-preview"><AppIcon name="info-circle" :size="20"/><text>请在微信小程序中登录，当前网页仅供界面预览。</text></view>
          <text v-if="error" class="error-text" role="alert">{{error}}</text>
          <button class="ui-button quiet-button" role="button" tabindex="0" @click="pendingAction=null;isDemo=true;albumView='catches';panel='';tab='album'">先看看示例鱼册</button>
        </view>
        <view v-else-if="panel==='record'" class="form-body">
          <text v-if="isDemo" class="form-hint">这条鱼获将保存到你自己的鱼册。</text>
          <view class="record-steps"><text class="active">01 实拍鱼获</text><text>02 匹配鱼卡</text><text>03 钓获时间</text></view>
          <view class="photo-input" :class="{filled:form.photo}"><image v-if="form.photo" :src="form.photo" mode="aspectFit"/><template v-else><view class="camera-circle"><AppIcon name="camera" :size="28"/></view><text class="photo-title">把亲手钓到的这一尾留下来</text><text class="muted">照片会出现在鱼获卡和分享图上</text></template><text v-if="photoBusy" class="photo-processing">正在读取照片和拍摄时间…</text><text v-else-if="form.photo" class="photo-caption">这张实拍照片将作为鱼获卡面</text></view>
          <view class="photo-source-actions"><button class="ui-button secondary" role="button" tabindex="0" :disabled="photoBusy||busy" @click="choosePhoto('camera')"><AppIcon name="camera" :size="18"/>{{form.photo?'重新拍照':'现在拍照'}}</button><button class="ui-button secondary" role="button" tabindex="0" :disabled="photoBusy||busy" @click="choosePhoto('album')"><AppIcon name="photo" :size="18"/>{{form.photo?'更换照片':'从相册上传'}}</button></view>
          <view class="form-label"><text>这条鱼，对应哪张鱼卡？</text><text class="optional">选择后归入图鉴</text></view>
          <view v-if="form.photo" class="recognition-status"><AppIcon :name="recognizing?'sparkles':'fish'" :size="18"/><text>{{recognitionNote||'可搜索鱼名或别名，确认对应鱼卡。'}}</text><button v-if="serviceConfig.recognitionAvailable&&!recognizing&&form.photo.startsWith('data:')" class="ui-button" role="button" tabindex="0" @click="recognizePhoto">重新识别</button></view>
          <view v-if="candidates.length" class="recognition-candidates"><button class="ui-button" role="button" tabindex="0" v-for="c in candidates" :key="c.speciesId" :class="{chosen:form.speciesId===c.speciesId}" @click="form.speciesId=c.speciesId"><text>{{getSpecies(c.speciesId).name}}</text><text>{{c.reason}}</text><text>{{form.speciesId===c.speciesId?'已确认':'选这张鱼卡'}}</text></button></view>
          <view class="species-search"><AppIcon name="search" :size="18"/><input v-model="speciesQuery" placeholder="搜索鱼名 / 别名，如桂鱼、黑鱼" aria-label="搜索匹配鱼卡" maxlength="40"/></view>
          <view class="species-picker"><button class="ui-button" role="button" tabindex="0" v-for="s in matchedSpecies" :key="s.id" :class="{chosen:form.speciesId===s.id}" @click="form.speciesId=s.id"><view class="pick-fish"><FishArt :index="s.index"/></view><text>{{s.name}}</text><AppIcon v-if="form.speciesId===s.id" name="circle-check" :size="14"/></button></view>
          <text v-if="!matchedSpecies.length" class="form-hint">当前图鉴还没有匹配鱼种，可以先存为待确认。</text>
          <text v-if="form.speciesId&&form.speciesId!=='unknown'" class="matched-card"><AppIcon name="circle-check" :size="15"/> 已匹配「{{getSpecies(form.speciesId).name}}」鱼卡 · 每条鱼获单独保存</text>
          <button class="ui-button unknown-choice" role="button" tabindex="0" :class="{chosen:form.speciesId==='unknown'}" @click="form.speciesId='unknown'"><AppIcon :name="form.speciesId==='unknown'?'circle-check':'circle'" :size="18"/><text>还不确定，先存为待确认</text></button>
          <view class="form-label"><text>什么时候钓到的？</text><text class="optional">按实际钓获时间填写</text></view>
          <view class="catch-datetime"><picker mode="date" :value="form.date||localDate()" :end="localDate()" @change="editCatchDate($event.detail.value)"><view class="picker-value"><view><text>钓获日期</text><text>{{form.date?formatDate(form.date):'请选择日期'}}</text></view><AppIcon name="chevron-down" :size="16"/></view></picker><picker mode="time" :value="form.time||'12:00'" @change="editCatchTime($event.detail.value)"><view class="picker-value"><view><text>时间 · 选填</text><text>{{form.time||'未填写'}}</text></view><AppIcon name="chevron-down" :size="16"/></view></picker></view>
          <view class="time-hint"><AppIcon name="clock" :size="15"/><text>{{timeHint}}</text></view><button v-if="form.photoTakenAt&&dateTouched" class="ui-button use-photo-time" role="button" tabindex="0" @click="applyPhotoTime">使用照片时间 {{formatDate(form.photoTakenAt.slice(0,10))}} {{form.photoTakenAt.slice(11,16)}}</button>
          <view class="form-label"><text>留下这次的纪录</text><text class="optional">选填，未测量可留空</text></view>
          <view class="measurement-fields"><view><text>重量</text><view><input v-model="form.weight" type="digit" placeholder="未称重" aria-label="重量"/><text>kg</text></view></view><view><text>长度</text><view><input v-model="form.length" type="digit" placeholder="未测量" aria-label="长度"/><text>cm</text></view></view></view>
          <view class="form-label">钓法</view><view class="method-picker"><button class="ui-button"  role="button" tabindex="0" v-for="method in methods" :key="method" :class="{chosen:form.method===method}" @click="form.method=method">{{method}}</button></view>
          <view class="form-label"><text>那一刻，有什么想记住的？</text><text class="optional">{{form.note.length}}/120</text></view><textarea v-model="form.note" maxlength="120" placeholder="比如，守了一下午，终于等到这一口。" class="note-input" :auto-height="false"/>
          <view class="form-line"><text>所在城市 <text class="optional">选填</text></text><input v-model="form.city" placeholder="不记录精确钓点" maxlength="20" aria-label="所在城市"/></view>
          <view class="privacy-hint"><AppIcon name="lock" :size="14"/><text>照片与记录保存到你的微信账号，城市默认不出现在分享图中。</text></view>
          <text v-if="error" class="error-text" role="alert">{{error}}</text>
          <button class="ui-button primary" role="button" tabindex="0"  :disabled="busy||photoBusy||(!form.id&&!form.pendingId&&quotaFull)" @click="saveRecord"><AppIcon name="cards" :size="21" light/>{{saveLabel}}</button>
          <view class="save-quota"><text>{{account?`本次${form.id?'编辑不新增额度':'保存占用 1 条额度'} · ${account.remaining} 条可用`:'等待连接鱼册服务'}}</text><button class="ui-button" role="button" tabindex="0" @click="panel='membership'">查看额度</button></view>
          <button class="ui-button quiet-button" role="button" tabindex="0"  @click="discardDraft">放弃这份草稿</button>
        </view>

        <view v-else-if="panel==='detail'||panel==='success'" class="detail-body">
          <view v-if="panel==='success'" class="success-message"><AppIcon name="circle-check" :size="22"/><text>{{form.id?'鱼获已更新，收藏和纪录已重新计算。':savedNewSpecies?'新鱼种点亮，故事又多了一页。':'这份上岸的惊喜，已经好好收藏。'}}</text></view>
          <view class="detail-card"><view class="detail-card-top"><text>口袋鱼获 · 珍藏鱼获</text><text>{{selectedRecord?badge(selectedRecord):'等待解锁'}}</text></view><view class="detail-art" :style="{background:fish.color}"><image v-if="selectedRecord?.photo" :src="selectedRecord.photo" mode="aspectFit" @click="previewPhoto"/><FishArt v-else :index="fish.index" :locked="!selectedRecord"/></view><view class="field-ruler"/><view class="detail-card-caption"><text class="detail-fish-name">{{fish.name}}</text><text class="detail-latin">{{fish.latin}}</text><view v-if="selectedRecord" class="detail-metrics"><view><text>{{selectedRecord.weight??'—'}}</text><text>kg · {{isDemo?'示例重量':'自报重量'}}</text></view><view><text>{{selectedRecord.length??'—'}}</text><text>cm · {{isDemo?'示例长度':'自报长度'}}</text></view></view><text v-if="!selectedRecord?.photo||isDemo" class="art-label">{{photoCaption(selectedRecord)}}</text></view></view>
          <template v-if="selectedRecord"><view class="detail-context"><text>{{formatDate(selectedRecord.date)}} {{selectedRecord.time||''}} · {{selectedRecord.method}}</text><view><AppIcon name="lock" :size="14"/><text>钓点保密</text></view></view><text v-if="pbText(selectedRecord)" class="pb-note"><AppIcon name="trophy" :size="16"/> {{pbText(selectedRecord)}}已刷新</text><text class="catch-note">{{selectedRecord.note||'每一次相遇，都值得留下。'}}</text><view class="detail-actions"><button class="ui-button primary" role="button" tabindex="0"  @click="openShare"><AppIcon name="share-2" :size="19" light/>制作分享卡</button><button class="ui-button secondary" role="button" tabindex="0" v-if="!isDemo"  @click="openRecord(undefined,selectedRecord)"><AppIcon name="pencil" :size="19"/>编辑</button></view><button class="ui-button quiet-button" role="button" tabindex="0" v-if="!isDemo"  @click="setFavorite">{{favorite===selectedRecord.id?'已是我的代表作':'设为我的代表作'}}</button><view class="section-heading"><text class="section-title">与它的 {{fishRecords.length}} 次相遇</text></view><button class="ui-button history-row" role="button" tabindex="0" v-for="r in fishRecords" :key="r.id"  :class="{current:r.id===selectedRecord.id}" @click="selectedId=r.id"><image v-if="r.photo" :src="r.photo" :lazy-load="true" mode="aspectFit" class="history-photo"/><view><text>{{formatDate(r.date)}} {{r.time||''}}</text><text class="muted">{{badge(r)}}</text></view><text>{{weightText(r)}}</text><AppIcon name="chevron-right" :size="16"/></button><button class="ui-button delete-button" role="button" tabindex="0" v-if="!isDemo"  @click="deleteRecord">移除这条鱼获</button></template>
          <template v-else><text class="locked-copy">{{fish.description}}</text><button class="ui-button primary" role="button" tabindex="0"  @click="openRecord(fish.id)"><AppIcon name="camera" :size="20" light/>记下我的第一尾{{fish.name}}</button></template>
        </view>

        <view v-else-if="panel==='share'" class="share-body"><view class="poster-styles"><button class="ui-button" role="button" tabindex="0" :aria-pressed="posterStyle==='field'" :class="{chosen:posterStyle==='field'}" :disabled="busy" @click="setPosterStyle('field')"><view class="style-swatch field-swatch"/><view><text>钴蓝图鉴</text><text>象牙白 × 钴蓝</text></view><AppIcon v-if="posterStyle==='field'" name="circle-check" :size="18"/></button><button class="ui-button" role="button" tabindex="0" :aria-pressed="posterStyle==='record'" :class="{chosen:posterStyle==='record'}" :disabled="busy" @click="setPosterStyle('record')"><view class="style-swatch record-swatch"/><view><text>曜石典藏</text><text>炭黑 × 熔岩橙</text></view><AppIcon v-if="posterStyle==='record'" name="circle-check" :size="18"/></button></view><view class="share-photo-info"><AppIcon name="photo" :size="19"/><text>{{selectedRecord?.photo?(isDemo?'分享卡使用当前 AI 鱼获示例图':'分享卡使用这条鱼获的实拍照片'):'这条记录没有实拍照片，将使用图鉴插画'}}</text></view><view class="privacy-hint"><AppIcon name="shield-lock" :size="17"/><text>分享前可预览照片、钓获时间和尺寸，城市默认隐藏。</text></view><view v-if="selectedRecord?.city" class="form-line"><text>在卡片中显示城市</text><switch :checked="showCity" color="#e78350" @change="changeCity"/></view><image v-if="poster" :src="poster" class="poster-preview" mode="widthFix" @click="previewPoster"/><view v-else class="share-placeholder"><AppIcon name="cards" :size="48"/><text>这尾，值得钓友看一眼。</text><text class="muted">{{busy?'正在制作收藏卡…':'选一张喜欢的卡面，留住这次鱼获'}}</text></view><text v-if="error" class="error-text">{{error}}</text><button class="ui-button primary" role="button" tabindex="0" v-if="!poster" :disabled="busy" @click="generatePoster">{{busy?'正在制作卡片…':'生成分享图'}}</button><button class="ui-button primary" role="button" tabindex="0" v-else @click="savePoster"><AppIcon name="download" :size="20" light/>保存分享图</button><button class="ui-button quiet-button" role="button" tabindex="0" @click="panel='detail'">返回鱼获</button></view>

        <view v-else-if="panel==='membership'" class="membership-body">
          <view class="member-hero"><AppIcon name="crown" :size="35"/><text>{{account?.plan.name||'鱼获存储'}}</text><view v-if="account"><text>{{account.used}}</text><text> / {{account.plan.limit}} 条</text></view><text v-else class="member-login-hint">微信登录后查看我的额度</text><text>每一条钓获，都有独立的照片和时间</text></view>
          <view v-if="account" class="quota-track"><view :style="{width:Math.min(100,(account?.used||0)/(account?.plan.limit||30)*100)+'%'}"/></view>
          <text class="quota-explainer">同一种鱼钓多次分别计数；编辑不增加额度，移除一条释放一个名额。示例鱼册不占用额度。</text>
          <view v-for="plan in account?.plans||membershipPlans" :key="plan.id" class="membership-plan" :class="{current:account?.tier===plan.id}"><view><text>{{plan.name}}</text><text>{{plan.description}}</text></view><view><text>{{plan.limit.toLocaleString()}} <text>条</text></text><text>{{account?.tier===plan.id?'当前等级':'存储上限'}}</text></view></view>
          <view class="membership-note"><AppIcon name="lock" :size="17"/><text>会员额度绑定微信账号，付费开通暂未上线。已保存的鱼获不会因等级降低而删除。</text></view>
          <text v-if="account" class="member-identity">已绑定微信账号</text><button v-else class="ui-button primary" role="button" tabindex="0" @click="openLogin">微信登录，查看我的额度</button>
          <button v-if="account" class="ui-button quiet-button" role="button" tabindex="0" @click="connectService">{{connecting?'正在刷新…':'刷新存储额度'}}</button>
          <button v-if="savedDraft" class="ui-button primary" role="button" tabindex="0" @click="openRecord(undefined,undefined,true)">返回鱼获草稿</button>
        </view>
        <view v-else-if="panel==='settings'" class="settings-body"><view class="settings-intro"><AppIcon name="fish" :size="44"/><text class="section-title">一本只属于你的鱼册</text><text class="muted">照片、鱼获记录和会员额度绑定微信账号。重新登录同一微信账号，就能继续查看自己的收藏。</text></view><button class="ui-button settings-option" role="button" tabindex="0"  @click="startOwn"><view><text>我的收藏</text><text class="muted">{{account?`${ownRecords.length} 条鱼获 · 随账号保存`:'微信登录后查看'}}</text></view><AppIcon name="chevron-right" :size="20"/></button><button class="ui-button settings-option" role="button" tabindex="0"  @click="isDemo=true;albumView='catches';tab='album';panel='' "><view><text>浏览示例鱼册</text><text class="muted">示例不计入我的收藏</text></view><AppIcon name="chevron-right" :size="20"/></button><button class="ui-button settings-option" role="button" tabindex="0" @click="panel='membership'"><view><text>会员与存储额度</text><text class="muted">{{account?`${account.used} / ${account.plan.limit} 条鱼获`:'查看鱼获存储额度'}}</text></view><AppIcon name="chevron-right" :size="20"/></button><view class="privacy-hint"><AppIcon name="lock" :size="18"/><text>保存的照片移除原始定位元数据，城市默认不进入分享图。</text></view><button v-if="account" class="ui-button quiet-button" role="button" tabindex="0" @click="logout">退出登录</button><view class="album-end"><text>口袋鱼获 · 慢慢钓，慢慢收集。</text></view></view>
      </scroll-view>
    </view>
  </view>
  <view v-if="toastText" class="toast" role="status">{{toastText}}</view>
  <canvas canvas-id="shareCanvas" id="shareCanvas" class="export-canvas" style="width:600px;height:860px"/>
</template>

<style src="./style.css"></style>
