import {KitchenSinkMessages} from './kitchenSinkMessages';
import {MessageState, QnaMessage} from './qnaMessageFactory';
import {ToastIcon, ToastsType} from './components/toast-icon';
import {h} from 'preact';
import {Utils} from './utils';
import {DisplayToast} from './qna-plugin';
import {ToastSeverity, TimedMetadataEvent} from './types';
import {QnaMessageFactory} from './qnaMessageFactory';

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
    const announcementCuePoints = payload.cues.filter((cue: any) => {
      if (cue?.type !== 'cuepoint') {
        return false;
      }
      const {metadata} = cue;
      return metadata?.cuePointType === 'annotation.Annotation' && metadata?.tags === 'qna' && metadata?.cueType === 'publicqna';
    });
    const qnaMessages: any = announcementCuePoints.map(cue => {
      const {metadata} = cue;
      const xmls = Utils.getXmlFromCue(cue);
      return {
        id: cue.id,
        createdAt: new Date(metadata?.createdAt * 1000),
        messageContent: metadata?.text,
        ...QnaMessageFactory.parseXml(xmls[0])
      };
    });
    if (qnaMessages.length) {
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
