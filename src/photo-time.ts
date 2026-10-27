import exifr from 'exifr'
export function parsePhotoTimestamp(value: unknown, now=new Date()): string {
  if(typeof value!=='string')return ''
  const match=/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?/.exec(value)
  if(!match)return ''
  const [,year,month,day,hour,minute]=match
  const date=new Date(Number(year),Number(month)-1,Number(day),Number(hour),Number(minute))
  if(Number(year)<1970||date.getFullYear()!==Number(year)||date.getMonth()+1!==Number(month)||date.getDate()!==Number(day)||date.getHours()!==Number(hour)||date.getMinutes()!==Number(minute)||date>now)return ''
  return `${year}-${month}-${day}T${hour}:${minute}`
}
export async function readPhotoTimestamp(bytes: Uint8Array): Promise<string> {
  try{
    const tags=await exifr.parse(bytes,{pick:['DateTimeOriginal'],reviveValues:false,gps:false,ifd1:false,exif:true})
    return parsePhotoTimestamp(tags?.DateTimeOriginal)
  }catch{return ''}
}
