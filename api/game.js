// API do Fusão Prime: perfis, recordes, rankings e descobertas.
// Roda como função da Vercel; o banco é o Postgres (Neon) em DATABASE_URL.
const { Pool } = require('pg');
const crypto = require('crypto');

const URL_DB = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED;
let pool = null, ready = null;
function db() {
  if (!URL_DB) throw Object.assign(new Error('banco não configurado'), { code: 503 });
  if (!pool) pool = new Pool({ connectionString: URL_DB, max: 3, ssl: /localhost|\/tmp|sslmode=disable/.test(URL_DB) ? false : { rejectUnauthorized: false } });
  return pool;
}
const q = (sql, args) => db().query(sql, args);

async function migrate() {
  await q(`create table if not exists players(
    id serial primary key, name text not null, name_key text not null unique,
    token_hash text not null, code_hash text not null,
    level int default 1, fav text, fav_name text, disc int default 0, best int default 0, cleared int default 0, stars int default 0,
    banned boolean default false, last_score_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now())`);
  await q(`create table if not exists runs(
    id serial primary key, player_id int references players(id) on delete cascade, wave int not null,
    a text, b text, fname text, dur int, kills int, hidden boolean default false, created_at timestamptz default now())`);
  await q(`create index if not exists runs_wave on runs(wave desc)`);
  await q(`create index if not exists runs_created on runs(created_at)`);
  await q(`create table if not exists discoveries(pair text primary key, player_id int references players(id) on delete set null, created_at timestamptz default now())`);
}
const ensure = () => ready || (ready = migrate().catch(e => { ready = null; throw e }));

const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => 'FP-' + [0, 1].map(() => Array.from(crypto.randomBytes(4), b => ALPHA[b % ALPHA.length]).join('')).join('-');
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const nameKey = n => String(n).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
  .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/@/g, 'a');

// filtro de palavrões (pt-BR e alguns em inglês); compara sem acento e sem espaços
const BAD = ['porra', 'caralh', 'buceta', 'boceta', 'xoxota', 'piroca', 'pinto', 'rola', 'cacete', 'merda', 'bosta', 'puta', 'puto', 'putaria', 'vagabund', 'viado', 'veado', 'bicha', 'traveco',
  'arrombad', 'fdp', 'filhodaputa', 'cuzao', 'cusao', 'corno', 'otario', 'babaca', 'idiota', 'imbecil', 'retardad', 'macaco', 'crioulo', 'nazi', 'hitler', 'estupr', 'pedofil', 'punheta', 'siririca',
  'foder', 'fode', 'transar', 'sexo', 'penis', 'vagina', 'bct', 'krl', 'prr', 'vsf', 'tnc', 'pqp', 'fuck', 'shit', 'bitch', 'dick', 'pussy', 'nigg', 'cunt', 'whore', 'admin', 'moderador'];
const badName = k => BAD.some(w => k.includes(w)) || /^cu$|^cus?$/.test(k);

function validName(n) {
  n = String(n || '').trim().replace(/\s+/g, ' ');
  if (n.length < 3 || n.length > 16) return [null, 'O apelido precisa ter de 3 a 16 letras.'];
  if (!/^[\p{L}\p{N} _.-]+$/u.test(n)) return [null, 'Use só letras, números, espaço, ponto, traço ou _.'];
  const k = nameKey(n);
  if (k.length < 3) return [null, 'O apelido precisa ter pelo menos 3 letras ou números.'];
  if (badName(k)) return [null, 'Esse apelido não é permitido. Escolha outro.'];
  return [n, null, k];
}
async function auth(token) {
  if (!token) throw Object.assign(new Error('sem login'), { code: 401 });
  const r = await q('select * from players where token_hash=$1', [sha(token)]);
  if (!r.rows[0]) throw Object.assign(new Error('perfil não encontrado'), { code: 401 });
  if (r.rows[0].banned) throw Object.assign(new Error('perfil bloqueado'), { code: 403 });
  return r.rows[0];
}
const ID = /^[a-z]{2,12}$/;
const clean = (s, n = 40) => String(s || '').replace(/[<>]/g, '').slice(0, n);
const weekStart = "date_trunc('week', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'";

const H = {
  async register(b) {
    const [name, err, key] = validName(b.name);
    if (err) return { status: 400, body: { error: err } };
    const token = crypto.randomBytes(24).toString('hex'), code = newCode();
    try {
      const r = await q('insert into players(name,name_key,token_hash,code_hash) values($1,$2,$3,$4) returning id', [name, key, sha(token), sha(normCode(code))]);
      return { body: { id: r.rows[0].id, name, token, code } };
    } catch (e) {
      if (e.code === '23505') return { status: 409, body: { error: 'Esse apelido já tem dono. Escolha outro.' } };
      throw e;
    }
  },
  async recover(b) {
    const r = await q('select id,name from players where code_hash=$1 and not banned', [sha(normCode(b.code))]);
    if (!r.rows[0]) return { status: 404, body: { error: 'Código não encontrado. Confira as letras.' } };
    const token = crypto.randomBytes(24).toString('hex');
    await q('update players set token_hash=$1 where id=$2', [sha(token), r.rows[0].id]);
    return { body: { id: r.rows[0].id, name: r.rows[0].name, token } };
  },
  async sync(b) {
    const p = await auth(b.token), s = b.profile || {};
    const fav = ID.test(String(s.fav || '').split('|')[0]) ? clean(s.fav, 30) : null;
    await q('update players set level=$1,fav=$2,fav_name=$3,disc=$4,cleared=$5,stars=$6,updated_at=now() where id=$7',
      [Math.min(999, Math.max(1, s.level | 0)), fav, clean(s.favName, 40), Math.min(171, s.disc | 0), Math.min(10, s.cleared | 0), Math.min(40, s.stars | 0), p.id]);
    return { body: { ok: true } };
  },
  async score(b) {
    const p = await auth(b.token);
    const wave = b.wave | 0, dur = b.dur | 0, kills = b.kills | 0;
    if (wave < 1) return { status: 400, body: { error: 'onda inválida' } };
    // limites: não dá para passar de onda em menos de ~6 s, nem enviar recordes em sequência
    if (wave > 999 || dur < wave * 6 || kills > wave * 60) return { status: 422, body: { error: 'Recorde recusado: não bate com o tempo de jogo.' } };
    if (p.last_score_at && Date.now() - new Date(p.last_score_at).getTime() < 15000) return { status: 429, body: { error: 'Espere alguns segundos para enviar outro recorde.' } };
    const a = ID.test(b.a) ? b.a : null, bb = ID.test(b.b) ? b.b : null;
    await q('insert into runs(player_id,wave,a,b,fname,dur,kills) values($1,$2,$3,$4,$5,$6,$7)', [p.id, wave, a, bb, clean(b.fname, 40), dur, kills]);
    await q('update players set best=greatest(best,$1), last_score_at=now() where id=$2', [wave, p.id]);
    const rank = await q(`select count(*)+1 as pos from (select player_id, max(wave) w from runs r join players pl on pl.id=r.player_id where not r.hidden and not pl.banned group by player_id) t where t.w > $1`, [wave]);
    return { body: { ok: true, pos: +rank.rows[0].pos } };
  },
  async ranking(b) {
    const type = b.type || 'geral';
    if (type === 'colecao') {
      const r = await q(`select name,disc,level,fav,fav_name from players where not banned and disc>0 order by disc desc, updated_at asc limit 50`);
      return { body: { rows: r.rows } };
    }
    const where = type === 'semanal' ? `and r.created_at >= ${weekStart}` : '';
    const r = await q(`select distinct on (r.player_id) pl.name, pl.level, r.wave, r.a, r.b, r.fname, r.created_at
      from runs r join players pl on pl.id=r.player_id where not r.hidden and not pl.banned ${where}
      order by r.player_id, r.wave desc, r.created_at asc`);
    const rows = r.rows.sort((x, y) => y.wave - x.wave || new Date(x.created_at) - new Date(y.created_at)).slice(0, 50);
    return { body: { rows } };
  },
  async week() {
    const used = await q(`select a,b,max(fname) fname,count(*)::int n from runs r join players pl on pl.id=r.player_id where not r.hidden and not pl.banned and r.created_at >= ${weekStart} and a is not null group by a,b order by n desc limit 1`);
    const best = await q(`select r.a,r.b,r.fname,r.wave,pl.name from runs r join players pl on pl.id=r.player_id where not r.hidden and not pl.banned and r.created_at >= ${weekStart} and a is not null order by r.wave desc, r.created_at asc limit 1`);
    return { body: { used: used.rows[0] || null, best: best.rows[0] || null } };
  },
  async discover(b) {
    const p = await auth(b.token);
    const pairs = (Array.isArray(b.pairs) ? b.pairs : []).filter(x => /^[a-z]{2,12}\|[a-z]{2,12}$/.test(x)).slice(0, 200);
    let mine = [];
    if (pairs.length) {
      const r = await q(`insert into discoveries(pair,player_id) select unnest($1::text[]), $2 on conflict (pair) do nothing returning pair`, [pairs, p.id]);
      mine = r.rows.map(x => x.pair);
    }
    return { body: { first: mine } };
  },
  async firsts() {
    const r = await q(`select d.pair, pl.name from discoveries d left join players pl on pl.id=d.player_id and not pl.banned`);
    const map = {}; for (const x of r.rows) map[x.pair] = x.name || '—';
    return { body: { map } };
  },
  async profile(b) {
    const r = await q('select name,level,fav,fav_name,disc,best,cleared,stars,created_at from players where name_key=$1 and not banned', [nameKey(b.name || '')]);
    if (!r.rows[0]) return { status: 404, body: { error: 'Perfil não encontrado.' } };
    const f = await q('select count(*)::int n from discoveries d join players p on p.id=d.player_id where p.name_key=$1', [nameKey(b.name)]);
    return { body: { ...r.rows[0], firsts: f.rows[0].n } };
  },
  async admin(b) {
    if (!process.env.ADMIN_KEY || b.key !== process.env.ADMIN_KEY) return { status: 403, body: { error: 'chave inválida' } };
    const k = nameKey(b.name || '');
    if (b.op === 'list') { const r = await q('select id,name,best,disc,banned,created_at from players order by created_at desc limit 200'); return { body: { rows: r.rows } } }
    if (b.op === 'ban') { await q('update players set banned=true where name_key=$1', [k]); return { body: { ok: true } } }
    if (b.op === 'unban') { await q('update players set banned=false where name_key=$1', [k]); return { body: { ok: true } } }
    if (b.op === 'rename') { const [n, err, nk] = validName(b.to); if (err) return { status: 400, body: { error: err } }; await q('update players set name=$1,name_key=$2 where name_key=$3', [n, nk, k]); return { body: { ok: true } } }
    if (b.op === 'clearruns') { await q('update runs set hidden=true where player_id=(select id from players where name_key=$1)', [k]); await q('update players set best=0 where name_key=$1', [k]); return { body: { ok: true } } }
    if (b.op === 'delete') { await q('delete from players where name_key=$1', [k]); return { body: { ok: true } } }
    return { status: 400, body: { error: 'operação desconhecida' } };
  }
};

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  try {
    let b = {};
    if (req.method === 'POST') b = typeof req.body === 'object' && req.body ? req.body : JSON.parse(req.body || '{}');
    const qy = Object.assign({}, req.query || {}), a = qy.act || b.act; delete qy.act;
    if (req.method !== 'POST') Object.assign(b, qy);
    const fn = H[a];
    if (!fn) { res.statusCode = 404; return res.end(JSON.stringify({ error: 'ação desconhecida' })) }
    if (['register', 'recover', 'sync', 'score', 'discover', 'admin'].includes(a) && req.method !== 'POST') { res.statusCode = 405; return res.end('{"error":"use POST"}') }
    await ensure();
    const out = await fn(b);
    res.statusCode = out.status || 200;
    res.end(JSON.stringify(out.body));
  } catch (e) {
    res.statusCode = e.code === 401 || e.code === 403 || e.code === 503 ? e.code : 500;
    res.end(JSON.stringify({ error: res.statusCode === 500 ? 'Erro no servidor. Tente de novo.' : e.message }));
    if (res.statusCode === 500) console.error(e);
  }
};
module.exports._h = H; module.exports._ensure = ensure; module.exports._validName = validName;
