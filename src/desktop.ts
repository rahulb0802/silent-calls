export type HoldKey = 'F8' | 'F9' | 'F10' | 'CtrlRight';
export type HoldStatus = { active: boolean; key: HoldKey; message: string };
export type HoldEvent = { type: 'down' | 'up' | 'cancel' };
export interface DesktopAPI {
  openWidget(): Promise<void>;
  closeWidget(): Promise<void>;
  showMain(route?:'workspace'): Promise<void>;
  startGlobalHold(key: HoldKey): Promise<HoldStatus>;
  stopGlobalHold(): Promise<HoldStatus>;
  getGlobalHoldStatus(): Promise<HoldStatus>;
  openKeyboardSettings(): Promise<void>;
  onGlobalHold(callback: (event: HoldEvent) => void): () => void;
  onGlobalHoldStatus(callback: (status: HoldStatus) => void): () => void;
}
