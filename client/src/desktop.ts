import type {VoiceState} from './services/use-local-voice';
export type HoldKey = 'F8' | 'F9' | 'F10' | 'CtrlRight';
export type HoldStatus = { active: boolean; key: HoldKey; message: string };
export type HoldEvent = { type: 'down' | 'up' | 'cancel' };
export interface DesktopAPI {
  openWidget(): Promise<void>;
  closeWidget(): Promise<void>;
  showMain(route?:'workspace'|'audio-setup'): Promise<void>;
  startGlobalHold(key: HoldKey): Promise<HoldStatus>;
  stopGlobalHold(): Promise<HoldStatus>;
  getGlobalHoldStatus(): Promise<HoldStatus>;
  openKeyboardSettings(): Promise<void>;
  getVoiceStatus(): Promise<VoiceState>;
  connectVoice(port:number): Promise<VoiceState>;
  disconnectVoice(): Promise<VoiceState>;
  speakText(text:string): Promise<VoiceState>;
  onVoiceStatus(callback:(state:VoiceState)=>void):()=>void;
  openAudioHelp(topic:'blackhole'|'vbcable'|'zoom'|'meet'|'facetime'):Promise<void>;
  onGlobalHold(callback: (event: HoldEvent) => void): () => void;
  onGlobalHoldStatus(callback: (status: HoldStatus) => void): () => void;
}
