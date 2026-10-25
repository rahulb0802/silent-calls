import {practiceSentences, vocabularyTerms} from './personal-library';
import {profileSecret} from './profile-key';
import type {ServiceSettings} from './settings';
export type EnrollmentPrompt={id:string;sentence:string};
export type EnrollmentProgress={n_clips:number;sentence_ids:string[]};
export type TrainingReport={promoted?:boolean;promotion_reason?:string;baseline?:string;incumbent_wer?:number;incumbent_top1?:number;incumbent_top5?:number;active_n_enrollment?:number;n_enrollment?:number;before_wer?:number;after_wer?:number;before_top5?:number;after_top5?:number;n_train?:number;n_val?:number;n_test?:number;per_clip?:{key:string;ref:string;before:string;after:string}[]};
export type TrainingStatus={state:'none'|'queued'|'loading'|'evaluating'|'training'|'done'|'failed';step?:number;steps?:number;loss?:number;phase?:string;has_adapter?:boolean;error?:string;report?:TrainingReport};
export type UploadResult={ok:boolean;sentence_id:string;n_clips?:number;sentence_ids?:string[];error?:string;quality?:{face_rate?:number;n_frames?:number;flags?:string[]}};
export class EnrollmentHttpError extends Error {constructor(message:string,public status:number){super(message);}}
export const trainingRunning=(status:TrainingStatus|null)=>Boolean(status && ['queued','loading','evaluating','training'].includes(status.state));
export class EnrollmentApi {
  readonly base:string;
  readonly user:string;
  constructor(settings:ServiceSettings) {
    const source=settings.apiUrl.trim() || (settings.websocketUrl || 'ws://127.0.0.1:8000/ws/session').replace(/^ws:/,'http:').replace(/^wss:/,'https:');
    const url=new URL(source);
    if(url.protocol!=='http:' || !['localhost','127.0.0.1'].includes(url.hostname) || url.username || url.password)throw new Error('Use the SSH tunnel HTTP URL, such as http://127.0.0.1:8000.');
    url.hostname='127.0.0.1';this.base=url.origin;
    this.user=settings.profileId.trim();
    if(!this.user || this.user.length>128)throw new Error('Save a profile ID before enrolling.');
  }
  private tunnelReady=false;
  private async request(path:string,signal:AbortSignal,init:RequestInit={}) {
    if(!this.tunnelReady && window.desktop?.ensureTunnel){  // the desktop app opens the SSH tunnel itself
      const result=await window.desktop.ensureTunnel(Number(new URL(this.base).port || 80));
      if(!result.ok)throw new Error(result.message);
      this.tunnelReady=true;
    }
    const controller=new AbortController();
    const abort=()=>controller.abort();
    if(signal.aborted)controller.abort();else signal.addEventListener('abort',abort,{once:true});
    const timeout=setTimeout(()=>controller.abort(),init.method==='POST'?90000:20000);
    try {
      // the profile's secret (profile-key.ts): the GPU files this profile's data under it
      const headers=new Headers(init.headers);headers.set('X-Profile-Secret',profileSecret(this.user));
      const response=await fetch(`${this.base}${path}`,{...init,headers,signal:controller.signal,credentials:'omit',redirect:'error'});
      const text=await response.text();
      if(text.length>3_000_000)throw new Error('The server response was too large.');
      let data;
      try{data=JSON.parse(text);}catch{throw new Error('The GPU did not return JSON. Check the tunnel and server address.');}
      if(!response.ok)throw new EnrollmentHttpError(typeof data.detail==='string'?data.detail.slice(0,1000):`GPU request failed (${response.status}).`,response.status);
      return data;
    }catch(reason){
      if(controller.signal.aborted && !signal.aborted){this.tunnelReady=false;throw new Error('GPU request timed out. Refresh status before retrying a training start.');}
      throw reason;
    }finally{clearTimeout(timeout);signal.removeEventListener('abort',abort);}
  }
  private path(prefix:string,suffix=''){return `/${prefix}/${encodeURIComponent(this.user)}${suffix}`;}
  /** Your saved vocabulary goes to the server first, so the prompts include a few sentences with your name
   * and your words (within the first 30), and the lip-reader is biased toward them for this profile. */
  async prompts(signal:AbortSignal):Promise<EnrollmentPrompt[]> {
    await this.request(this.path('vocab'),signal,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({words:vocabularyTerms(),practice:practiceSentences()})});
    const value=await this.request(`/enroll/sentences?user_id=${encodeURIComponent(this.user)}`,signal);
    if(!Array.isArray(value) || !value.length || value.length>200 || value.some(item=>!item || typeof item.id!=='string' || !item.id || typeof item.sentence!=='string' || !item.sentence))throw new Error('The server returned an invalid prompt list.');
    return value;
  }
  async progress(signal:AbortSignal):Promise<EnrollmentProgress> {
    const value=await this.request(this.path('enroll'),signal);
    if(!Number.isInteger(value.n_clips) || value.n_clips<0 || !Array.isArray(value.sentence_ids) || value.sentence_ids.some((id:unknown)=>typeof id!=='string'))throw new Error('The server returned invalid enrollment progress.');
    return value;
  }
  async upload(prompt:EnrollmentPrompt,blob:Blob,signal:AbortSignal):Promise<UploadResult> {
    if(!blob.size || blob.size>20*1024*1024)throw new Error('Record a shorter clip (maximum 20 MB).');
    const form=new FormData();form.set('sentence_id',prompt.id);form.set('text',prompt.sentence);
    form.set('file',blob,`${prompt.id}.${blob.type.includes('mp4')?'mp4':'webm'}`);
    const value=await this.request(this.path('enroll','/clip'),signal,{method:'POST',body:form});
    if(typeof value.ok!=='boolean' || value.sentence_id!==prompt.id)throw new Error('The server returned an invalid clip acknowledgement. Refresh enrollment progress before retrying.');
    return value;
  }
  /** Phrases corrected in calls and kept for training (opt-in, src/services/learning.ts). */
  async corrections(signal:AbortSignal):Promise<number> {
    const value=await this.request(this.path('corrections'),signal);
    if(!Number.isInteger(value.n) || value.n<0)throw new Error('The GPU returned an invalid correction count.');
    return value.n;
  }
  async deleteCorrections(signal:AbortSignal):Promise<void> { await this.request(this.path('corrections'),signal,{method:'DELETE'}); }
  async start(signal:AbortSignal):Promise<{job_id:string;state:string}> {
    const value=await this.request(`${this.path('train')}?steps=100`,signal,{method:'POST'});
    if(typeof value.job_id!=='string' || typeof value.state!=='string')throw new Error('Training start was not acknowledged. Refresh server status before retrying.');
    return value;
  }
  async status(signal:AbortSignal):Promise<TrainingStatus> {
    const value=await this.request(this.path('train','/status'),signal);
    if(!['none','queued','loading','evaluating','training','done','failed'].includes(value.state))throw new Error('The GPU returned an unknown training state.');
    return value;
  }
  async report(signal:AbortSignal):Promise<TrainingReport> {
    const value=await this.request(this.path('train','/report'),signal);
    if(!value || typeof value!=='object' || Array.isArray(value))throw new Error('The GPU returned an invalid training report.');
    return value;
  }
}
