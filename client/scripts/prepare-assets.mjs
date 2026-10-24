import {cp,mkdir} from 'node:fs/promises';
import path from 'node:path';
// Copies installed npm assets only. No model or runtime is fetched from a CDN.
await mkdir('public/vendor',{recursive:true});
await cp(path.join('node_modules','@mediapipe','tasks-vision','wasm'),'public/vendor/vision',{recursive:true});
console.log('Installed MediaPipe WASM runtime copied locally. Select a local face_landmarker.task file in the app to enable the meter.');
