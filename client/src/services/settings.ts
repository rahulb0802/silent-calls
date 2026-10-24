import {ensureOwnName} from './personal-library';
export type ServiceSettings={websocketUrl:string;apiUrl:string;profileId:string};
const STORAGE='silent-calls:services:v1';
export function loadSettings():ServiceSettings{
  let value:Partial<ServiceSettings>={};
  try{value=JSON.parse(localStorage.getItem(STORAGE)||'{}')||{};}catch{ /* Use a fresh local profile for invalid saved settings. */ }
  const settings={websocketUrl:typeof value.websocketUrl==='string'?value.websocketUrl:'ws://127.0.0.1:8000/ws/session',apiUrl:typeof value.apiUrl==='string'?value.apiUrl:'',profileId:typeof value.profileId==='string' && value.profileId && !value.profileId.startsWith('local-')?value.profileId:`person-${crypto.randomUUID().slice(0,8)}`};
  if(typeof value.profileId!=='string' || !value.profileId || value.profileId.startsWith('local-'))localStorage.setItem(STORAGE,JSON.stringify(settings));
  return settings;
}
export function saveSettings(settings:ServiceSettings){
  for(const [field,protocols] of [['websocketUrl',['ws:','wss:']],['apiUrl',['http:','https:']]] as const){
    if(!settings[field])continue;
    const url=new URL(settings[field]);
    if(!(protocols as readonly string[]).includes(url.protocol)||url.username||url.password)throw new Error('Use a service URL without embedded credentials.');
  }
  if(!settings.profileId.trim())throw new Error('Enter a profile ID for enrollment.');
  localStorage.setItem(STORAGE,JSON.stringify(settings));
  ensureOwnName(settings.profileId);
  window.dispatchEvent(new Event('silent-calls:settings'));
}
