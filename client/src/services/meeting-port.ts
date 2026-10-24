import type {CaptureClip,Frame} from '../capture/buffer';
export type Candidate={id:string;text:string;lipScore?:number;prob?:number;source?:'copilot'|'memory';facts?:{source:string;detail:string}[]};
export type Route='speak'|'choose'|'repeat';
/** The server's per-utterance quality report (numbers and flags only; server/lipread/frames.py quality()). */
export type QualityData={[key:string]:number|string[]|undefined;flags?:string[]};
export type UtteranceStart={utteranceId:string;pressedAtMs:number;width:number;height:number;targetFps:number};
export type MeetingEvent=
  | {type:'candidates';utteranceId:string;candidates:Candidate[];confidence?:number;timings?:Record<string,number>;quality?:string;qualityData?:QualityData;adapter?:string|null;route?:Route;ranker?:'jev'|'lip'}
  | {type:'repair';utteranceId:string;text:string}
  | {type:'upload';utteranceId:string;sentFrames:number;bufferedBytes:number}
  | {type:'caption';speaker:string;text:string}
  | {type:'speech.started'|'speech.finished';utteranceId:string}
  | {type:'connection';connected:boolean;message:string}
  | {type:'error';message:string;utteranceId?:string;code?:string};
/** Supply an approved transport adapter here when the team agrees its endpoint and protocol. */
export interface MeetingPort{
  subscribe(listener:(event:MeetingEvent)=>void):()=>void;
  start(start:UtteranceStart):void;
  frame(utteranceId:string,sequence:number,frame:Frame):void;
  end(clip:CaptureClip):void;
  cancel(utteranceId:string):void;
  confirm(utteranceId:string,candidateId:string,editedText?:string):void;
  quickPhrase(utteranceId:string,text:string):void;
}
export type EnrollmentClip={prompt:string;blob:Blob;split:'train'|'eval'};
export type TrainingJob={id:string;status:'queued'|'training'|'complete'|'failed';progress:number;beforeAccuracy?:number;afterAccuracy?:number;message?:string};
export interface EnrollmentPort{
  uploadClip(clip:EnrollmentClip,profileId:string,signal:AbortSignal):Promise<string>;
  startTraining(profileId:string,clipIds:string[],signal:AbortSignal):Promise<TrainingJob>;
  getTrainingJob(id:string,signal:AbortSignal):Promise<TrainingJob>;
}
