import {mkdir,stat,writeFile} from 'node:fs/promises';
// Opt-in download of MediaPipe's face landmark model (Apache-2.0, ~3.7 MB) for the mouth meter and hands-free
// mode. Stored in public/models (not committed); the widget loads it from there.
const URL_='https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const out='public/models/face_landmarker.task';
try { if ((await stat(out)).size > 100000) { console.log(`${out} already present.`); process.exit(0); } } catch {}
await mkdir('public/models',{recursive:true});
const response=await fetch(URL_);
if(!response.ok)throw new Error(`Download failed: HTTP ${response.status}`);
await writeFile(out,new Uint8Array(await response.arrayBuffer()));
console.log(`Saved ${out}.`);
