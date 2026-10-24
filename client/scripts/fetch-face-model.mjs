import {mkdir,stat,writeFile,rename,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const modelUrl='https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const out='public/models/face_landmarker.task';
export async function ensureFaceModel(){
  try{if((await stat(out)).size>100000)return;}catch{}
  console.log('Preparing hands-free controls…');
  const response=await fetch(modelUrl,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Gesture model download failed (${response.status}).`);
  const data=new Uint8Array(await response.arrayBuffer());
  if(data.length<100000 || data.length>20*1024*1024)throw new Error('The gesture model download was incomplete.');
  await mkdir('public/models',{recursive:true});
  const temporary=`${out}.${process.pid}.tmp`;
  try{await writeFile(temporary,data);await rename(temporary,out);}finally{await rm(temporary,{force:true});}
  console.log('Hands-free controls are ready.');
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)await ensureFaceModel();
