export type FishId = 'crucian' | 'carp' | 'mandarin' | 'snakehead' | 'unknown'
export interface Species { id: FishId; name: string; latin: string; index: number; color: string; description: string }
export interface CatchRecord {
  id: string; speciesId: FishId; date: string; createdAt: number; photo: string;
  weight: number | null; length: number | null; method: string; note: string; city: string;
  time?: string; dateSource?: 'exif'|'camera'|'manual'|'unknown'; photoTakenAt?: string; photoTimeSource?: 'exif'|'camera'|'unknown';
}
export const species: Species[] = [
  { id: 'crucian', name: '鲫鱼', latin: 'Carassius auratus', index: 0, color: '#4c69e8', description: '记住每一次浮漂下沉，也记住那些安静等待的下午。' },
  { id: 'carp', name: '鲤鱼', latin: 'Cyprinus carpio', index: 1, color: '#dcae52', description: '从第一尾，到刷新纪录的那一尾，每一次较量都值得收藏。' },
  { id: 'mandarin', name: '鳜鱼', latin: 'Siniperca chuatsi', index: 2, color: '#ee8150', description: '漂亮的斑纹，难忘的一口。把这份上岸的惊喜留在鱼册里。' },
  { id: 'snakehead', name: '乌鳢', latin: 'Channa argus', index: 3, color: '#a28cbc', description: '下一段与水有关的故事，也许就从它开始。' },
]
export const unknownSpecies: Species = { id: 'unknown', name: '待确认鱼种', latin: '待确认', index: -1, color: '#9b968e', description: '先留住这次鱼获，之后可以补充鱼种。' }
export const getSpecies = (id: FishId) => species.find(s => s.id === id) || unknownSpecies
export const demoRecords: CatchRecord[] = [
  { id:'demo-1', speciesId:'crucian', date:'2026-09-12', createdAt:1, photo:'/static/cases/crucian-net.jpg', time:'06:20', weight:0.32, length:22, method:'台钓', note:'秋天的第一尾，小小的也很开心。', city:'' },
  { id:'demo-2', speciesId:'carp', date:'2026-09-26', createdAt:2, photo:'/static/cases/carp-river.jpg', time:'16:45', weight:1.6, length:43, method:'台钓', note:'守了一下午，终于等到你。', city:'' },
  { id:'demo-3', speciesId:'mandarin', date:'2026-10-11', createdAt:3, photo:'/static/cases/mandarin-net.jpg', time:'08:10', weight:0.86, length:32, method:'路亚', note:'第一次解锁鳜鱼，斑纹真漂亮。', city:'' },
  { id:'demo-4', speciesId:'crucian', date:'2026-10-18', createdAt:4, photo:'/static/cases/crucian-hands.jpg', time:'07:35', weight:0.46, length:26, method:'台钓', note:'风停的时候，浮漂终于动了。', city:'' },
  { id:'demo-5', speciesId:'carp', date:'2026-10-18', createdAt:5, photo:'/static/cases/carp-mat.jpg', time:'08:25', weight:1.3, length:39, method:'台钓', note:'今天的第二份惊喜。', city:'' },
  { id:'demo-6', speciesId:'mandarin', date:'2026-10-25', createdAt:6, photo:'/static/cases/mandarin-bank.jpg', time:'06:50', weight:1.28, length:38, method:'路亚', note:'换了三个标点，终于等到这一口。', city:'' },
]
export const ordered = (records: CatchRecord[]) => [...records].sort((a,b) => a.date.localeCompare(b.date) || a.createdAt-b.createdAt || a.id.localeCompare(b.id))
export function achievements(record: CatchRecord, records: CatchRecord[]) {
  const same = ordered(records.filter(r => r.speciesId === record.speciesId))
  const index = same.findIndex(r => r.id === record.id)
  const previous = same.slice(0, index)
  const best = (key: 'weight'|'length') => {
    const measured = previous.map(r=>r[key]).filter((n): n is number => n !== null && n > 0)
    return record[key] !== null && measured.length > 0 && record[key]! > Math.max(...measured)
  }
  return { first: index === 0 && record.speciesId !== 'unknown', weightPB: best('weight'), lengthPB: best('length') }
}
export function validateRecord(input: Partial<CatchRecord>, today: string) {
  if (!input.speciesId || ![...species.map(s=>s.id), 'unknown'].includes(input.speciesId)) return '请选择鱼种，或先选待确认'
  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return '请选择钓获日期'
  const parsed = new Date(input.date+'T00:00:00Z')
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10) !== input.date) return '请选择有效日期'
  if (input.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) return '请选择有效钓获时间'
  if (input.date > today) return '钓获日期不能晚于今天'
  if (input.weight !== null && input.weight !== undefined && (!Number.isFinite(input.weight) || input.weight <= 0 || input.weight > 500)) return '重量请填写 0 到 500 kg 之间的实测数值，未测量可留空'
  if (input.length !== null && input.length !== undefined && (!Number.isFinite(input.length) || input.length <= 0 || input.length > 1000)) return '长度请填写 0 到 1000 cm 之间的实测数值，未测量可留空'
  return ''
}
export function stats(records: CatchRecord[]) {
  const best=new Map<FishId,{weight:number|null;length:number|null}>();let pbs=0
  for(const r of ordered(records)){
    const prior=best.get(r.speciesId)||{weight:null,length:null}
    if((r.weight!==null&&prior.weight!==null&&r.weight>prior.weight)||(r.length!==null&&prior.length!==null&&r.length>prior.length))pbs++
    best.set(r.speciesId,{weight:r.weight!==null&&r.weight>0?Math.max(prior.weight||0,r.weight):prior.weight,length:r.length!==null&&r.length>0?Math.max(prior.length||0,r.length):prior.length})
  }
  return {fish:new Set(records.filter(r=>r.speciesId!=='unknown').map(r=>r.speciesId)).size,catches:records.length,days:new Set(records.map(r=>r.date)).size,pbs}
}
export const localDate = () => {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
export const formatDate = (date: string) => date.replace(/-/g,'.')

export const membershipPlans = [
  { id: 'basic', name: '普通会员', limit: 30, description: '从第一尾开始收藏' },
  { id: 'plus', name: '进阶会员', limit: 300, description: '留住更多上岸的瞬间' },
  { id: 'collector', name: '典藏会员', limit: 3000, description: '一册收藏多年的鱼获' },
] as const
export const speciesAliases: Record<string,string[]> = {crucian:['鲫','鲫瓜子'],carp:['鲤','鲤拐子'],mandarin:['鳜','桂鱼','桂花鱼'],snakehead:['黑鱼','乌鱼','生鱼','财鱼']}
export function searchSpecies(query: string) {
  const q=query.trim().toLowerCase()
  return species.filter(s=>!q||[s.name,s.latin,...(speciesAliases[s.id]||[])].some(name=>name.toLowerCase().includes(q)))
}
