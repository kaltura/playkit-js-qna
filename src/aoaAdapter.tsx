import {KitchenSinkMessages} from './kitchenSinkMessages';
import {BannerManager, VisibilityMode, BannerState} from '@playkit-js-contrib/ui';
import {MessageState, QnaMessage, QnaMessageType} from './qnaMessageFactory';
import {ToastIcon, ToastsType} from './components/toast-icon';
import {h} from 'preact';
import {Utils} from './utils';
import {DisplayToast} from './qna-plugin';
import {ToastSeverity, TimedMetadataEvent, CuePoint} from './types';

export interface AoaAdapterOptions {
  kitchenSinkMessages: KitchenSinkMessages;
  setDataListener: (args: any) => void;
  onCuesBecomeActive: (args: any) => void;
  bannerManager: BannerManager;
  isKitchenSinkActive: () => boolean;
  updateMenuIcon: (indicatorState: boolean) => void;
  displayToast: DisplayToast;
  logger: KalturaPlayerTypes.Logger;
}

export class AoaAdapter {
  private _kitchenSinkMessages: KitchenSinkMessages;
  private _bannerManager: BannerManager;
  private _isKitchenSinkActive: () => boolean;
  private _updateMenuIcon: (indicatorState: boolean) => void;
  private _displayToast: DisplayToast;
  private _logger: KalturaPlayerTypes.Logger;

  private _currentNotification: QnaMessage | null = null;

  constructor(options: AoaAdapterOptions) {
    this._kitchenSinkMessages = options.kitchenSinkMessages;
    this._bannerManager = options.bannerManager;
    this._isKitchenSinkActive = options.isKitchenSinkActive;
    this._updateMenuIcon = options.updateMenuIcon;
    this._displayToast = options.displayToast;
    this._logger = options.logger;
    options.setDataListener(this._handleAddTimedMetadata);
    options.onCuesBecomeActive(this._handleChangeTimedMetadata);
  }

  private _prepareAoaMessages = (cuePoints: CuePoint[]): QnaMessage[] => {
    return Utils.createQnaMessagesArray(cuePoints).filter(qnaMessage => {
      return QnaMessageType.AnswerOnAir === qnaMessage.type;
    });
  };

  private _handleAddTimedMetadata = ({payload}: TimedMetadataEvent): void => {
    const filterFn = (metadata: any) =>
      metadata?.cuePointType === 'annotation.Annotation' && metadata?.tags === 'qna' && metadata?.cueType === 'publicqna';
    const aoaCuePoints: CuePoint[] = Utils.prepareCuePoints(payload.cues, filterFn);
    if (aoaCuePoints.length) {
      const qnaMessages: QnaMessage[] = this._prepareAoaMessages(aoaCuePoints);
      this._processAddData(qnaMessages);
    }
  };

  private _handleChangeTimedMetadata = ({payload}: TimedMetadataEvent): void => {
    const filterFn = (metadata: any) =>
      metadata?.cuePointType === 'annotation.Annotation' && metadata?.tags === 'qna' && metadata?.cueType === 'publicqna';
    const aoaCuePoints: CuePoint[] = Utils.prepareCuePoints(payload.cues, filterFn);
    if (aoaCuePoints.length) {
      const qnaMessages: QnaMessage[] = this._prepareAoaMessages(aoaCuePoints);
      this._processChangeData(qnaMessages);
    }
  };

  private _processAddData = (qnaMessages: QnaMessage[]): void => {
    qnaMessages.forEach((qnaMessage: QnaMessage) => {
      if (qnaMessage.state === MessageState.Deleted) {
        this._kitchenSinkMessages.deleteMessage(qnaMessage.id);
        this._hideBannerNotification();
      } else {
        this._kitchenSinkMessages.add(qnaMessage);
      }
    });
  };

  private _processChangeData = (qnaMessages: QnaMessage[]): void => {
    qnaMessages.forEach((qnaMessage: QnaMessage) => {
      if (Utils.isMessageInTimeFrame(qnaMessage)) {
        this._showCurrentNotification(qnaMessage);
      }
    });
  };

  private _showCurrentNotification(qnaMessage: QnaMessage) {
    this._logger.debug('show notification event');
    //show in banner
    if (!this._currentNotification || qnaMessage.id !== this._currentNotification.id) {
      this._currentNotification = qnaMessage;
      const currentBannerState = this._bannerManager.add({
        content: {
          text: qnaMessage.messageContent ? qnaMessage.messageContent : ''
        }
      });
      this._showAOANotifications(currentBannerState);
    }
  }

  private _showAOANotifications(bannerState: BannerState) {
    if (bannerState.visibilityMode === VisibilityMode.HIDDEN && !this._isKitchenSinkActive()) {
      //menu icon indication
      this._updateMenuIcon(true);
      //toast indication
      this._displayToast({
        text: 'New Audience asks',
        icon: <ToastIcon type={ToastsType.AOA} />,
        severity: ToastSeverity.Info
      });
    }
  }

  private _hideBannerNotification() {
    if (!this._currentNotification) return;
    this._logger.debug('hide notification event');
    this._bannerManager.remove();
    this._currentNotification = null;
  }
}
