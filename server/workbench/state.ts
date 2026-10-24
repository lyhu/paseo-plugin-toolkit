import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { paseoHome } from "../models/storage";
import { createRevisionedJsonStore } from "../storage/revisioned-json";
import { defaultWorkbenchState,workbenchStateSchema,readWorkbenchState,saveWorkbenchPreferences,saveWorkbenchMemory,removeWorkbenchMemory } from "../../shared/workbench/state";
export function createWorkbenchStateStore(home=paseoHome()) {
  return createRevisionedJsonStore({filename:join(home,"toolkit","workbench","state.json"),schema:workbenchStateSchema,create:defaultWorkbenchState,concurrencyError:"工作台已在其他设备更新，请刷新后重试。"});
}
export function registerWorkbenchState(server:PluginServerContext) {
  const store=createWorkbenchStateStore();
  server.handle(readWorkbenchState,()=>store.read());
  server.handle(saveWorkbenchPreferences,({revision,preferences})=>store.update(revision,state=>({...state,preferences})));
  server.handle(saveWorkbenchMemory,({revision,id,...memory})=>store.update(revision,state=>{
    if(id&&!state.memories.some(m=>m.id===id))throw new Error("记忆不存在，请刷新后重试。");
    const next={...memory,id:id??randomUUID(),updatedAt:new Date().toISOString()};
    return {...state,memories:[next,...state.memories.filter(m=>m.id!==id)]};
  }));
  server.handle(removeWorkbenchMemory,({revision,id})=>store.update(revision,state=>({...state,memories:state.memories.filter(m=>m.id!==id)})));
  return store;
}
