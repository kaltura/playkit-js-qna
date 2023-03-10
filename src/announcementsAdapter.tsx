import {ToastSeverity} from '@playkit-js/common/dist/ui-common/toast-manager';
import {KitchenSinkMessages} from './kitchenSinkMessages';
import {MessageState, QnaMessage, QnaMessageType} from './qnaMessageFactory';
import {ToastIcon, ToastsType} from './components/toast-icon';
import {h} from 'preact';
import {Utils} from './utils';
import {DisplayToast} from './qna-plugin';
import {TimedMetadataEvent, CuePoint} from './types';

export interface AnnouncementsAdapterOptions {
  kitchenSinkMessages: KitchenSinkMessages;
  setDataListener: (args: any) => void;
  isKitchenSinkActive: () => boolean;
  updateMenuIcon: (indicatorState: boolean) => void;
  displayToast: DisplayToast;
}

export class AnnouncementsAdapter {
  private _kitchenSinkMessages: KitchenSinkMessages;
  private _isKitchenSinkActive: () => boolean;
  private _updateMenuIcon: (indicatorState: boolean) => void;
  private _displayToast: DisplayToast;

  constructor(options: AnnouncementsAdapterOptions) {
    this._kitchenSinkMessages = options.kitchenSinkMessages;
    this._isKitchenSinkActive = options.isKitchenSinkActive;
    this._displayToast = options.displayToast;
    this._updateMenuIcon = options.updateMenuIcon;
    options.setDataListener(this._handleTimedMetadata);
  }

  private _handleTimedMetadata = ({payload}: TimedMetadataEvent): void => {
    const filterFn = (metadata: any) =>
      metadata?.cuePointType === 'annotation.Annotation' &&
      ['qna', 'qna, Annotation_Deleted'].includes(metadata?.tags) &&
      metadata?.cueType === 'publicqna';
    const announcementCuePoints: CuePoint[] = Utils.prepareCuePoints(payload.cues, filterFn);
    if (announcementCuePoints.length) {
      const qnaMessages: QnaMessage[] = Utils.createQnaMessagesArray(announcementCuePoints).filter(qnaMessage => {
        return QnaMessageType.Announcement === qnaMessage.type;
      });
      this._processAnnouncements(qnaMessages);
    }
  };

  private _processAnnouncements = (qnaMessages: QnaMessage[]): void => {
    qnaMessages.forEach((qnaMessage: QnaMessage) => {
      if (qnaMessage.state === MessageState.Deleted) {
        this._kitchenSinkMessages.deleteMessage(qnaMessage.id);
      } else {
        this._kitchenSinkMessages.add(qnaMessage);
        //display toasts only for newly created messages
        if (Utils.isMessageInTimeFrame(qnaMessage)) {
          this._showAnnouncementNotifications();
        }
      }
    });
  };

  private _showAnnouncementNotifications() {
    if (!this._isKitchenSinkActive()) {
      //menu icon indication
      this._updateMenuIcon(true);
      //toast indication
      this._displayToast({
        text: 'New Announcement',
        icon: <ToastIcon type={ToastsType.Announcement} />,
        severity: ToastSeverity.Info
      });
    }
  }
}
