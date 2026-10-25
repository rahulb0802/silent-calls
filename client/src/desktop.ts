import type {VoiceState} from './services/use-local-voice';
export type HoldKey = 'T' | 'F8' | 'F9' | 'F10' | 'CtrlRight';
export type HoldStatus = { active: boolean; key: HoldKey; message: string; receivedKey?: boolean };
export type HoldEvent = { type: 'down' | 'up' | 'cancel' };
export type DecisionInput = {utteranceId:string;candidates:{text:string;score:number}[];vocab:string[];me?:string};
/** The decision layer's ranking (silentcalls DecisionEvent): top options with combined lip + Jev probability. */
export type Decision = {utteranceId:string;route:'speak'|'choose'|'repeat';options:{text:string;prob:number;jev:boolean}[];jev:boolean;timings:Record<string,number>};
export type SetupStatus = {platform:string;canStartService:boolean;keyboardAllowed:boolean};
export interface DesktopAPI {
  openWidget(): Promise<void>;
  closeWidget(): Promise<void>;
  /** Compact companion at the top of the screen, sized to this height; null for the full panel. */
  setCompact(height:number|null): Promise<void>;
  showMain(route?:'workspace'|'audio-setup'|'library'|'onboarding'): Promise<void>;
  startGlobalHold(key: HoldKey): Promise<HoldStatus>;
  stopGlobalHold(): Promise<HoldStatus>;
  getGlobalHoldStatus(): Promise<HoldStatus>;
  openKeyboardSettings(topic?: 'accessibility' | 'input-monitoring'): Promise<void>;
  getSetupStatus():Promise<SetupStatus>;
  connectSetupVoice():Promise<VoiceState>;
  openSetupKeyboardSettings():Promise<void>;
  ensureTunnel(port:number): Promise<{ok:boolean;mode:'existing'|'started'|'none';message:string}>;
  getVoiceStatus(): Promise<VoiceState>;
  connectVoice(port:number): Promise<VoiceState>;
  disconnectVoice(): Promise<VoiceState>;
  speakText(text:string): Promise<VoiceState>;
  /** Dictation: type text into the focused app (clipboard + paste, clipboard restored). */
  typeText(text:string): Promise<{ok:boolean}>;
  /** Dictation: tell the local service what was typed, so later suggestions have it as context. */
  noteDictated(text:string): Promise<void>;
  /** Dictation: the words written out (capitals, punctuation, sentence breaks; no word changed), or null. */
  punctuate(input:{text:string;names:string[]}): Promise<string|null>;
  /** Phrase memory (Moss) on or off for this profile. */
  setMemory(input:{profile:string;on:boolean;secret?:string}): Promise<void>;
  forgetPhrases(): Promise<void>;
  setWidgetFocusable(focusable:boolean): Promise<void>;
  cloneVoice(wav:Uint8Array,name:string): Promise<VoiceState>;
  decide(input:DecisionInput): Promise<Decision|null>;
  reviewCall(vocab:string[]): Promise<VoiceState>;
  onVoiceStatus(callback:(state:VoiceState)=>void):()=>void;
  openAudioHelp(topic:'blackhole'|'vbcable'|'zoom'|'meet'|'facetime'|'cartesia'):Promise<void>;
  onGlobalHold(callback: (event: HoldEvent) => void): () => void;
  onGlobalHoldStatus(callback: (status: HoldStatus) => void): () => void;
}
