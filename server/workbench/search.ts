import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { PaseoApi, PaseoAgentTimelineHandle, PaseoAgentTimelineRefetchOptions } from "@getpaseo/client";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { z } from "zod";
import { paseoHome } from "../models/storage";
import { writePrivateJsonFile } from "../storage/revisioned-json";
import { searchHitSchema,searchSessionSchema,readSearchStatus,indexWorkbenchSession,cancelWorkbenchIndex,clearWorkbenchIndex,searchWorkbenchHistory,type SearchSession,type SearchHit,type IndexStatus } from "../../shared/workbench/search";
const documentSchema=z.object({session:searchSessionSchema,hits:z.array(searchHitSchema),indexedAt:z.string()});
const key=(s:Pick<SearchSession,"serverId"|"agentId">)=>JSON.stringify([s.serverId,s.agentId]);
const normalize=(s:string)=>s.normalize("NFKC").toLocaleLowerCase();
function grams(s:string){const chars=Array.from(normalize(s));return new Set(chars.length<3?[chars.join("")]:chars.slice(0,-2).map((_,i)=>chars.slice(i,i+3).join("")));}
export function createHistoryIndex(home=paseoHome()) {
  const directory=join(home,"toolkit","workbench","search");
  const documents=new Map<string,z.infer<typeof documentSchema>>();
  const postings=new Map<string,Set<string>>();
  const hits=new Map<string,SearchHit>();
  const errors:IndexStatus[]=[];
  function rebuild(){postings.clear();hits.clear();for(const [documentId,doc] of documents)for(const hit of doc.hits){const id=JSON.stringify([documentId,hit.epoch,hit.seq]);hits.set(id,hit);for(const gram of grams(hit.text)){let ids=postings.get(gram);if(!ids)postings.set(gram,ids=new Set());ids.add(id);}}}
  if(existsSync(directory))for(const file of readdirSync(directory).filter(x=>x.endsWith(".json"))){try{const doc=documentSchema.parse(JSON.parse(readFileSync(join(directory,file),"utf8")));documents.set(key(doc.session),doc);}catch{errors.push({serverId:"unknown",agentId:file,workspaceId:"unknown",title:"损坏的索引分片",status:"failed",count:0,error:"索引损坏；原文件已保留，请清除并重新索引。"});}}
  rebuild();
  const filename=(session:SearchSession)=>join(directory,createHash("sha256").update(key(session)).digest("hex")+".json");
  return {
    replace(session:SearchSession,entries:SearchHit[]){const document=documentSchema.parse({session,hits:entries,indexedAt:new Date().toISOString()});writePrivateJsonFile(filename(session),document);documents.set(key(session),document);rebuild();},
    remove(session:SearchSession){const file=filename(session);if(existsSync(file))unlinkSync(file);documents.delete(key(session));rebuild();},
    statuses():IndexStatus[]{return [...[...documents.values()].map(d=>({...d.session,status:"ready" as const,count:d.hits.length,indexedAt:d.indexedAt})),...errors];},
    search(query:string,serverId?:string,limit=30){const q=normalize(query);let candidates:Iterable<string>=hits.keys();if(Array.from(q).length>=3){const lists=[...grams(q)].map(g=>postings.get(g)??new Set<string>()).sort((a,b)=>a.size-b.size);candidates=[...(lists[0]??[])].filter(id=>lists.every(list=>list.has(id)));}const result:SearchHit[]=[];for(const id of candidates){const hit=hits.get(id)!;if((!serverId||hit.serverId===serverId)&&normalize(hit.text).includes(q))result.push(hit);}return result.sort((a,b)=>b.indexedAt.localeCompare(a.indexedAt)||b.seq-a.seq).slice(0,limit);},
  };
}
export async function collectSessionHistory(timeline:Pick<PaseoAgentTimelineHandle,"refetch">,session:SearchSession,signal:AbortSignal,onProgress:(count:number)=>void=()=>{}):Promise<SearchHit[]> {
  let cursor:PaseoAgentTimelineRefetchOptions["cursor"],epoch:string|undefined;
  const hits=new Map<number,SearchHit>();
  const indexedAt=new Date().toISOString();
  do {
    if(signal.aborted)throw new Error("索引已取消");
    const page=await timeline.refetch({direction:cursor?"before":"tail",cursor,limit:100});
    if(signal.aborted)throw new Error("索引已取消");
    if(page.error||page.gap||page.staleCursor||(epoch!==undefined&&page.epoch!==epoch))throw new Error("历史已改变或存在缺页，请重新索引。");
    epoch=page.epoch;
    for(const entry of page.entries){const item=entry.item;if(item.type!=="user_message"&&item.type!=="assistant_message")continue;const text=item.text.trim();if(text)hits.set(entry.seqStart,{...session,text:text.slice(0,8000),seq:entry.seqStart,epoch:page.epoch,indexedAt});}
    if(hits.size>10000)throw new Error("该会话超过单次一万条文本预算；尚未替换已有索引。");
    onProgress(hits.size);
    const next=page.hasOlder?page.startCursor:undefined;
    if(page.hasOlder&&(!next||(cursor&&next.seq>=cursor.seq)))throw new Error("历史分页没有前进。");
    cursor=next??undefined;
  }while(cursor);
  return [...hits.values()];
}
export function createIndexJobs(index:ReturnType<typeof createHistoryIndex>,acquire:(serverId:string)=>Promise<PaseoApi>) {
  const jobs=new Map<string,{state:IndexStatus;abort:AbortController}>();
  const queue:Array<{session:SearchSession;job:{state:IndexStatus;abort:AbortController}}>=[];
  const activeHosts=new Set<string>();let active=0,disposed=false;
  function pump(){if(disposed)return;for(let i=0;i<queue.length&&active<2;){const entry=queue[i]!;if(activeHosts.has(entry.session.serverId)){i++;continue;}queue.splice(i,1);if(entry.job.abort.signal.aborted)continue;active++;activeHosts.add(entry.session.serverId);void run(entry).finally(()=>{active--;activeHosts.delete(entry.session.serverId);pump();});}}
  async function run({session,job}:{session:SearchSession;job:{state:IndexStatus;abort:AbortController}}){let api:PaseoApi|undefined;try{job.state.status="indexing";api=await acquire(session.serverId);const agent=api.agents.ref(session.agentId);await agent.refresh();if(agent.workspaceId!==session.workspaceId)throw new Error("会话工作区归属已改变，请刷新后重试。");const result=await collectSessionHistory(agent.timeline,session,job.abort.signal,count=>{job.state.count=count;});if(job.abort.signal.aborted)return;index.replace(session,result);job.state={...session,status:"ready",count:result.length,indexedAt:new Date().toISOString()};}catch(error){job.state.status=job.abort.signal.aborted?"cancelled":"failed";job.state.error=error instanceof Error?error.message:String(error);}finally{await api?.dispose();}}
  return {
    start(session:SearchSession){const old=jobs.get(key(session));if(old&&(old.state.status==="queued"||old.state.status==="indexing"))return old.state;const job={state:{...session,status:"queued" as const,count:0} as IndexStatus,abort:new AbortController()};jobs.set(key(session),job);queue.push({session,job});pump();return job.state;},
    cancel(session:SearchSession){const job=jobs.get(key(session));if(job&&(job.state.status==="queued"||job.state.status==="indexing")){job.abort.abort();job.state.status="cancelled";}},
    clear(session:SearchSession){this.cancel(session);index.remove(session);jobs.delete(key(session));},
    statuses(){const result=new Map(index.statuses().map(s=>[key(s),s]));for(const [id,job] of jobs)result.set(id,job.state);return [...result.values()];},
    dispose(){disposed=true;for(const job of jobs.values())job.abort.abort();queue.length=0;},
  };
}
export function registerWorkbenchSearch(server:PluginServerContext) {
  const index=createHistoryIndex();
  let jobs:ReturnType<typeof createIndexJobs>|undefined;
  const getJobs=(paseo:PaseoApi)=>jobs??(jobs=createIndexJobs(index,id=>paseo.hosts.client(id)));
  server.handle(readSearchStatus,(_, {paseo})=>getJobs(paseo).statuses());
  server.handle(indexWorkbenchSession,(input,{paseo})=>getJobs(paseo).start(input));
  server.handle(cancelWorkbenchIndex,(input,{paseo})=>{getJobs(paseo).cancel(input);return {};});
  server.handle(clearWorkbenchIndex,(input,{paseo})=>{getJobs(paseo).clear(input);return {};});
  server.handle(searchWorkbenchHistory,({query,serverId,limit},{paseo})=>({hits:index.search(query,serverId,limit),coverage:getJobs(paseo).statuses()}));
  return ()=>jobs?.dispose();
}
