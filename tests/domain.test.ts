import test from 'node:test'
import assert from 'node:assert/strict'
import {achievements, stats, validateRecord, demoRecords} from '../src/domain.ts'
import type {CatchRecord} from '../src/domain.ts'
const base:CatchRecord={id:'a',speciesId:'carp',date:'2026-10-01',createdAt:1,photo:'',weight:1,length:30,method:'台钓',note:'',city:''}
test('first catch lights a species without claiming a beaten record',()=>{assert.deepEqual(achievements(base,[base]),{first:true,weightPB:false,lengthPB:false});assert.equal(stats([base]).fish,1)})
test('repeated catch stays separate; weight and length records are independent',()=>{const b={...base,id:'b',date:'2026-10-02',weight:1.2,length:29};assert.deepEqual(achievements(b,[base,b]),{first:false,weightPB:true,lengthPB:false});assert.equal(stats([base,b]).fish,1);assert.equal(stats([base,b]).catches,2)})
test('unknown measurements and unknown species do not fabricate achievements',()=>{const b={...base,id:'b',speciesId:'unknown' as const,weight:null,length:null};assert.deepEqual(achievements(b,[b]),{first:false,weightPB:false,lengthPB:false});assert.equal(stats([b]).fish,0)})
test('backdated import uses catch chronology instead of upload order',()=>{const earlier={...base,id:'old',createdAt:5,date:'2026-09-01',weight:2};assert.equal(achievements(base,[base,earlier]).first,false);assert.equal(achievements(base,[base,earlier]).weightPB,false)})
test('editing or removing records recomputes personal bests',()=>{const b={...base,id:'b',date:'2026-10-02',weight:2};assert.equal(stats([base,b]).pbs,1);assert.equal(stats([b]).pbs,0);assert.equal(achievements(b,[b]).first,true);assert.equal(stats([{...base,weight:3,length:31},b]).pbs,0)})
test('validates future, invalid dates and implausible/negative measurements',()=>{assert.notEqual(validateRecord({...base,date:'2026-02-30'},'2026-10-27'),'');assert.notEqual(validateRecord({...base,date:'2026-10-28'},'2026-10-27'),'');assert.notEqual(validateRecord({...base,weight:-1},'2026-10-27'),'');assert.notEqual(validateRecord({...base,length:NaN},'2026-10-27'),'');assert.equal(validateRecord({...base,weight:null,length:null},'2026-10-27'),'')})
test('sample collection has three species, six catches, two record-breaking catches',()=>{assert.deepEqual(stats(demoRecords),{fish:3,catches:6,days:5,pbs:2})})
test('aggregate personal-best counts match per-record chronology after edits and mixed measurements',()=>{
  const records=Array.from({length:80},(_,i)=>({...base,id:'r'+i,createdAt:i+1,date:`2026-10-${String(i%25+1).padStart(2,'0')}`,speciesId:(i%2?'crucian':'carp') as CatchRecord['speciesId'],weight:i%3===0?null:(i*13)%17+1,length:i%5===0?null:(i*7)%53+1}))
  assert.equal(stats(records).pbs,records.filter(r=>{const a=achievements(r,records);return a.weightPB||a.lengthPB}).length)
})
