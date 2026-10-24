import type {ServiceSettings} from './settings';

type CalibrationMemory={goal:number;accepted:number;completedAt:string};
function key(settings:ServiceSettings){
  const endpoint=new URL(settings.apiUrl.trim() || settings.websocketUrl.replace(/^ws:/,'http:').replace(/^wss:/,'https:'));
  if(endpoint.hostname==='localhost')endpoint.hostname='127.0.0.1';
  return `silent-calls:setup:v2:${encodeURIComponent(endpoint.origin)}:${encodeURIComponent(settings.profileId.trim())}`;
}
function read(settings:ServiceSettings):{complete?:boolean;calibration?:CalibrationMemory}{
  try{return JSON.parse(localStorage.getItem(key(settings)) || '{}') || {};}catch{return {};}
}
export function savedCalibration(settings:ServiceSettings):CalibrationMemory|null{
  const value=read(settings).calibration;
  return value && Number.isInteger(value.goal) && value.goal>=30 && value.goal<=60 && Number.isInteger(value.accepted) && value.accepted>=value.goal && typeof value.completedAt==='string'?value:null;
}
export function setupComplete(settings:ServiceSettings){
  if(read(settings).complete===true)return true;
  // Bind the previous single-profile completion flag to the current profile once.
  try{if(localStorage.getItem('silent-calls:onboarding')==='complete'){rememberSetup(settings);localStorage.removeItem('silent-calls:onboarding');return true;}}catch{ /* Setup remains accessible if storage is unavailable. */ }
  return false;
}
function write(settings:ServiceSettings,value:ReturnType<typeof read>){
  localStorage.setItem(key(settings),JSON.stringify(value));
  window.dispatchEvent(new Event('silent-calls:setup'));
}
export function rememberCalibration(settings:ServiceSettings,goal:number,accepted:number){
  write(settings,{...read(settings),calibration:{goal,accepted,completedAt:new Date().toISOString()}});
}
export function rememberSetup(settings:ServiceSettings){write(settings,{...read(settings),complete:true});}
export function repeatSetup(settings:ServiceSettings){
  localStorage.removeItem('silent-calls:onboarding');
  write(settings,{...read(settings),complete:false});
}
