import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { parsePhotoTimestamp,readPhotoTimestamp } from '../src/photo-time.ts'
import { searchSpecies,validateRecord } from '../src/domain.ts'
test('capture time keeps original local wall-clock date and rejects invalid or future dates',()=>{
  const now=new Date('2026-10-27T12:00:00')
  assert.equal(parsePhotoTimestamp('2024:06:12 06:35:22',now),'2024-06-12T06:35')
  assert.equal(parsePhotoTimestamp('2024:02:30 06:35:00',now),'')
  assert.equal(parsePhotoTimestamp('2028:06:12 06:35:00',now),'')
  assert.equal(parsePhotoTimestamp(undefined,now),'')
  assert.equal(validateRecord({speciesId:'carp',date:'2024-06-12',time:'24:10'},'2026-10-27'),'请选择有效钓获时间')
})
test('photo without capture metadata never fabricates a date from upload or modified time',async()=>{
  const jpg=await sharp({create:{width:4,height:4,channels:3,background:'#ffffff'}}).jpeg().toBuffer()
  assert.equal(await readPhotoTimestamp(jpg),'')
  assert.equal(await readPhotoTimestamp(new Uint8Array([1,2,3])),'')
})
test('reads DateTimeOriginal from a real JPEG EXIF segment before image compression',async()=>{
  const jpg=await sharp({create:{width:4,height:4,channels:3,background:'#ffffff'}}).withExif({IFD2:{DateTimeOriginal:'2024:06:12 06:35:22'}}).jpeg().toBuffer()
  assert.equal(await readPhotoTimestamp(jpg),'2024-06-12T06:35')
})
test('species search maps aliases to the same fish card and leaves unknown names unmatched',()=>{
  assert.equal(searchSpecies('桂鱼')[0]?.id,'mandarin')
  assert.equal(searchSpecies('黑鱼')[0]?.id,'snakehead')
  assert.equal(searchSpecies('  CARASSIUS  ')[0]?.id,'crucian')
  assert.equal(searchSpecies('不存在的鱼').length,0)
})
