import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {validate,render,deck,agentPrompt} from './core.js';
import starter from './starter.js';
const run=promisify(execFile),root=path.dirname(fileURLToPath(import.meta.url));
export async function createApp(dir=process.env.TALKIES_WORKSPACE||path.join(root,'workspace')){
 await fs.mkdir(dir,{recursive:true});const file=path.join(dir,'talk.json');
 try{await fs.access(file)}catch{await fs.writeFile(file,JSON.stringify(starter,null,2))}
 const load=async()=>validate(JSON.parse(await fs.readFile(file,'utf8')));
 const git=async(args)=> (await run('git',args,{cwd:dir,timeout:30000,maxBuffer:2e6})).stdout;
 const app=express();app.use((req,res,next)=>{if(req.headers.origin&&req.headers.origin!==`${req.protocol}://${req.get('host')}`)return res.status(403).json({error:'Cross-origin request rejected'});next()});app.use(express.json({limit:'5mb'}));
 app.get('/api/talk',async(req,res)=>res.json(await load()));
 app.put('/api/talk',async(req,res)=>{validate(req.body);await fs.writeFile(file+'.tmp',JSON.stringify(req.body,null,2));await fs.rename(file+'.tmp',file);res.json({saved:true})});
 app.post('/api/render',(req,res)=>res.json({html:render(String(req.body.markdown||''))}));
 app.get('/api/export',async(req,res)=>{res.attachment('talk.html').type('html').send(render(deck(await load()),true))});
 app.get('/api/git',async(req,res)=>{try{res.json({branch:(await git(['branch','--show-current'])).trim(),status:await git(['status','--short']),diff:await git(['diff','--','talk.json','slides.md'])})}catch{res.json({initialized:false,status:'No Git repository. Initialize or mount a cloned talk repository.'})}});
 app.post('/api/git/init',async(req,res)=>{await git(['init']);res.json({ok:true})});
 app.post('/api/git/remote',async(req,res)=>{const url=String(req.body.url||'');if(!/^(https:\/\/[^\s]+|git@[^\s]+:[^\s]+)$/.test(url))throw Error('Use an HTTPS or SSH Git remote');try{await git(['remote','get-url','origin']);await git(['remote','set-url','origin',url])}catch{await git(['remote','add','origin',url])}res.json({ok:true})});
 app.post('/api/git/commit',async(req,res)=>{const t=await load();await fs.writeFile(path.join(dir,'slides.md'),deck(t));await git(['add','--','talk.json','slides.md']);const message=String(req.body.message||'Update talk');res.json({output:await git(['commit','-m',message])})});
 app.post('/api/git/push',async(req,res)=>{const branch=(await git(['branch','--show-current'])).trim();res.json({output:await git(['push','-u','origin',branch])})});
 app.post('/api/publish',async(req,res)=>{
 const t=await load();if(t.publish.provider==='export')return res.json({download:'/api/export'});
 if(t.private&&t.publish.provider==='github')throw Error('Private talks cannot publish to GitHub Pages. Choose internal GitLab or export.');
 if((await git(['status','--porcelain'])).trim())throw Error('Commit local changes before publishing.');
 const temp=await fs.mkdtemp(path.join(dir,'.publish-'));
 try{
 const remote=(await git(['remote','get-url',t.publish.remote||'origin'])).trim();
 await run('git',['init','-b','talkies-pages'],{cwd:temp});
 const exists=await run('git',['ls-remote','--heads',remote,'talkies-pages'],{cwd:temp,timeout:30000});
 if(exists.stdout.trim()){await run('git',['fetch',remote,'talkies-pages'],{cwd:temp,timeout:30000});await run('git',['reset','--hard','FETCH_HEAD'],{cwd:temp});}
 await fs.writeFile(path.join(temp,'index.html'),render(deck(t),true));
 await fs.writeFile(path.join(temp,'.nojekyll'),'');
 if(t.publish.provider==='gitlab')await fs.writeFile(path.join(temp,'.gitlab-ci.yml'),`pages:
  stage: deploy
  script:
    - mkdir -p public
    - cp index.html public/index.html
  artifacts:
    paths:
      - public
  rules:
    - if: '$CI_COMMIT_BRANCH == "talkies-pages"'
`);
 await run('git',['add','.'],{cwd:temp});
 const changes=await run('git',['status','--porcelain'],{cwd:temp});
 if(changes.stdout.trim()){
 await run('git',['-c','user.name=Talkies','-c','user.email=talkies@localhost','commit','-m','Publish slideshow'],{cwd:temp});
 await run('git',['push',remote,'HEAD:refs/heads/talkies-pages'],{cwd:temp,timeout:60000});}
 res.json({output:'Slideshow pushed to talkies-pages. Pages deployment must be enabled on the repository.',url:t.publish.url||null});
 }finally{await fs.rm(temp,{recursive:true,force:true})}
 });
 app.post('/api/agent',async(req,res)=>{const t=await load();if(!t.aiEnabled)throw Error('AI is disabled for this talk');const s=t.slides.find(x=>x.id===req.body.slideId);if(!s)throw Error('Slide not found');const prompt=agentPrompt(t,s,String(req.body.mode||'review'));if(!process.env.TALKIES_BRIDGE_TOKEN)return res.status(503).json({error:'Host agent bridge is not configured. Copy the prepared task instead.',prompt});const response=await fetch(process.env.TALKIES_BRIDGE_URL||'http://host.docker.internal:4319/run',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.TALKIES_BRIDGE_TOKEN}`},body:JSON.stringify({prompt}),signal:AbortSignal.timeout(180000)});const data=await response.json();res.status(response.status).json(data)});
 app.post('/api/task',async(req,res)=>{const t=await load(),s=t.slides.find(x=>x.id===req.body.slideId);if(!s)throw Error('Slide not found');res.json({prompt:agentPrompt(t,s,String(req.body.mode||'review'))})});
 app.use(express.static(path.join(root,'public')));app.use((err,req,res,next)=>res.status(400).json({error:err.message}));return app;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const app=await createApp();app.listen(Number(process.env.PORT||4318),'0.0.0.0',()=>console.log('Talkies: http://localhost:4318'))}
