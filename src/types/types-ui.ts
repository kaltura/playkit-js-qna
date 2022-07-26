export type OnClick = (e: KeyboardEvent | MouseEvent, byKeyboard?: boolean) => void;

export enum PluginStates {
  OPENED = 'opened',
  CLOSED = 'closed'
}

// TODO: move to ui managers
export enum ToastSeverity {
  Info = 'Info',
  Success = 'Success',
  Warn = 'Warn',
  Error = 'Error'
}

// TODO: move to cue-point manager
export interface CuePoint {
  startTime: number;
  endTime?: number;
  id: string;
  type: string;
  metadata: any;
  text?: string;
}

// TODO: move to cue-point manager
export interface TimedMetadataEvent {
  payload: {
    cues: Array<CuePoint>;
  };
}

export interface ModeratorSettings {
  createdAt: number;
  qnaEnabled: boolean;
  announcementOnly: boolean;
}