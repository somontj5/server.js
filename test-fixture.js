// Isolated test database only. Never loads or modifies data/db.json.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
function fixture() {
  const t=Date.now(), users={seller:{id:'seller',name:'Тестовый продавец',shopNum:'1'},buyer:{id:'buyer',name:'Покупатель'},admin:{id:'admin',admin:true}}, sessions={};
  for(const role of ['seller','buyer','admin'])sessions['test-'+role]={userId:role,createdAt:t};
  const listings={};
  function add(id,extra){listings[id]={id,cat:'clothes',sub:'suits',section:'suits-two',name:'Двойка флис',sellerId:'seller',a:{gender:'Женское',ageGroup:'Взрослое',cond:'Новое'},photos:['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cD1sAAAAASUVORK5CYII='],price:'100',row:'1',shopNum:'1',shopName:'Тест',phone:'+992 90 123 45 67',ways:['phone','wa'],createdAt:t,...extra}}
  add('base',{});add('match',{});add('archived',{archived:true});add('unrelated',{sub:'shoes',section:'shoes-other',name:'Обувь'});
  add('atlas',{sub:'dress',section:'dress-dresses',name:'Атласное платье'});add('scarf',{sub:'acc',section:'',name:'Платок'});
  add('legacy-home',{cat:'home',sub:'',section:'',name:'Старое домашнее'});add('legacy-other',{cat:'other',sub:'',section:'',name:'Другое'});
  add('legacy-tg',{contact:'tg',ways:['tg']});add('legacy-optout',{ways:[],contact:'both'});add('legacy-wa',{ways:['wa'],contact:'wa'});
  // Keep only base/match in suits-two for the narrow-screen regression.
  for(const id of ['legacy-tg','legacy-optout','legacy-wa']){listings[id].sub='tops';listings[id].section='tops-tees'}
  function dress(id,sizes,extra){add(id,{sub:'dress',section:'dress-dresses',name:'Платье хлопок',sizes,...extra})}
  dress('size-exact',{entries:[{system:'number',values:['48']}],standard:false});
  dress('size-bounded',{entries:[],standard:true,standardRange:{system:'number',from:'46',to:'52'}});
  dress('size-unknown',{entries:[],standard:true},{price:'1',createdAt:t+1000});
  dress('size-wrong',{entries:[{system:'number',values:['54']}],standard:false});
  dress('size-letters',{entries:[{system:'letter',values:['M']}],standard:false});
  dress('size-child',{entries:[{system:'height',values:['120']}],standard:false},{a:{gender:'Унисекс',ageGroup:'Детское'}});
  const Catalog=require('./android-src/assets/www/categories'),Tags=require('./tags'),crypto=require('node:crypto');
  for(const l of Object.values(listings)){
    if(l.cat==='clothes')Object.assign(l,Catalog.normalize(l));
    const text=[l.name,l.desc,l.material,l.a&&l.a.mat,l.mtags].filter(Boolean).join(' ');
    l.aiVersion=crypto.createHash('sha256').update(JSON.stringify(['tags-v2',text,Tags.layer1(l),Tags.DICT()])).digest('hex');
  }
  return {users,sessions,listings,codes:{},threads:{},reviews:[],searches:{}};
}
async function start(port=18091){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gm-size-tests-')),file=path.join(dir,'db.json');fs.writeFileSync(file,JSON.stringify(fixture()));
 const child=spawn(process.execPath,['server.js'],{cwd:__dirname,env:{...process.env,PORT:String(port),GM_CHILD:'1',DB_FILE:file,BOT_TOKEN:'',AI_WORKER_TOKEN:'test-worker',GITHUB_ACTIONS:''},stdio:['ignore','pipe','pipe']});
 let log='';child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
 const base='http://127.0.0.1:'+port;
 for(let i=0;i<100;i++){try{const r=await fetch(base+'/health');if(r.ok)return {base,child,dir,stop:async()=>{const done=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await done;fs.rmSync(dir,{recursive:true,force:true})}}}catch{}await new Promise(r=>setTimeout(r,50));if(child.exitCode!==null)break}
 child.kill('SIGTERM');fs.rmSync(dir,{recursive:true,force:true});throw Error('Fixture startup failed: '+log);
}
module.exports={fixture,start};
if(require.main===module)start(Number(process.env.PORT)||18091).then(s=>{console.log('Isolated fixture ready: '+s.base);process.on('SIGTERM',()=>s.stop().then(()=>process.exit(0)));process.on('SIGINT',()=>s.stop().then(()=>process.exit(0)))}).catch(e=>{console.error(e);process.exit(1)});
