import type { DesktopAPI } from './desktop';
declare global { interface Window { desktop?: DesktopAPI; } }
