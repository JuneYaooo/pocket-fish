import { readPhotoTimestamp } from './photo-time'
export type PhotoSource='camera'|'album'
export async function preparePhoto(source:PhotoSource):Promise<{photo:string;takenAt:string;source:PhotoSource;timeSource:'exif'|'camera'|'unknown'}> {
  const result=await uni.chooseImage({count:1,sizeType:['original'],sourceType:[source]})
  let path=result.tempFilePaths[0],takenAt='',photo=''
  const file=(result.tempFiles as any[])[0]
  if(file?.size>25*1024*1024)throw new Error('请选择小于 25MB 的照片')
  // #ifdef H5
  const response=await fetch(path)
  const buffer=await response.arrayBuffer()
  takenAt=await readPhotoTimestamp(new Uint8Array(buffer))
  photo=await new Promise<string>((resolve,reject)=>{
    const img=new Image()
    img.onload=()=>{try{const canvas=document.createElement('canvas');const scale=Math.min(1,1600/Math.max(img.width,img.height));canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);const ctx=canvas.getContext('2d')!;ctx.fillStyle='#f2eee5';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/jpeg',.82))}catch(e){reject(e)}}
    img.onerror=()=>reject(new Error('无法读取照片，请选择 JPG、PNG 或 WebP 图片'))
    img.src=path
  })
  if(path.startsWith('blob:'))URL.revokeObjectURL(path)
  // #endif
  // #ifdef MP-WEIXIN
  const fs=uni.getFileSystemManager()
  const original=fs.readFileSync(path) as ArrayBuffer
  takenAt=await readPhotoTimestamp(new Uint8Array(original))
  const compressed=await uni.compressImage({src:path,quality:82,compressedWidth:1600})
  const bytes=fs.readFileSync(compressed.tempFilePath) as ArrayBuffer
  photo='data:image/jpeg;base64,'+uni.arrayBufferToBase64(bytes)
  // #endif
  if(photo.length>4*1024*1024)throw new Error('照片压缩后仍然过大，请换一张较小的图片')
  const timeSource=takenAt?'exif':source==='camera'?'camera':'unknown'
  if(!takenAt&&source==='camera'){
    const now=new Date();const pad=(n:number)=>String(n).padStart(2,'0')
    takenAt=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
  }
  return {photo,takenAt,source,timeSource}
}
