import {h} from 'preact';
import {ToastSeverity} from '@playkit-js/common';
import {KitchenSinkMessages} from './kitchenSinkMessages';
import {MessageDeliveryStatus, QnaMessage, QnaMessageFactory, QnaMessageType} from './qnaMessageFactory';
import {Utils} from './utils';
import {ToastIcon, ToastsType} from './components/toast-icon';
import {DisplayToast} from './qna-plugin';
import {MessageLoader} from './providers/message-loader';
import {TimedMetadataEvent, CuePoint} from './types';

export interface ChatMessagesAdapterOptions {
  kitchenSinkMessages: KitchenSinkMessages;
  setDataListener: (args: any) => void;
  isKitchenSinkActive: () => boolean;
  updateMenuIcon: (indicatorState: boolean) => void;
  displayToast: DisplayToast;
  player: KalturaPlayerTypes.Player;
  logger: KalturaPlayerTypes.Logger;
}

interface SubmitRequestParams {
  requests: any;
  missingProfileId: boolean;
  requestIndexCorrection: number;
}

export class ChatMessagesAdapter {
  private _kitchenSinkMessages: KitchenSinkMessages;
  private _isKitchenSinkActive: () => boolean;
  private _updateMenuIcon: (indicatorState: boolean) => void;
  private _displayToast: DisplayToast;
  private _player: KalturaPlayerTypes.Player;
  private _logger: KalturaPlayerTypes.Logger;

  private _entryId: string | undefined;
  private _metadataProfileId: number | null = null;

  constructor(options: ChatMessagesAdapterOptions) {
    this._kitchenSinkMessages = options.kitchenSinkMessages;
    this._isKitchenSinkActive = options.isKitchenSinkActive;
    this._updateMenuIcon = options.updateMenuIcon;
    this._displayToast = options.displayToast;
    this._player = options.player;
    this._logger = options.logger;
    options.setDataListener(this._handleTimedMetadata);
  }

  private _handleTimedMetadata = ({payload}: TimedMetadataEvent): void => {
    const filterFn = (metadata: any) =>
      metadata?.cuePointType === 'annotation.Annotation' &&
      ['qna, aoa_auto_reply', 'qna'].includes(metadata?.tags) &&
      metadata?.cueType === 'userqna';
    const messageCuePoints: CuePoint[] = Utils.prepareCuePoints(payload.cues, filterFn);
    if (messageCuePoints.length) {
      const qnaMessages: QnaMessage[] = Utils.createQnaMessagesArray(messageCuePoints);
      this._addAnyQnaMessage(qnaMessages);
    }
  };

  public onMediaLoad(entryId: string): void {
    this._entryId = entryId;
  }

  public reset(): void {
    this._metadataProfileId = null;
    this._entryId = undefined;
  }

  public onMessageRead = (messageId: string): void => {
    this._kitchenSinkMessages.updateMessageById(messageId, null, (message: QnaMessage) => {
      // there is no need ot update message since it was already read
      if (message.unRead === false) return message;

      return {...message, unRead: false};
    });
  };

  public submitQuestion = async (question: string, parentId: string | null) => {
    const uuid = Utils.generateId();

    const pendingQnaMessage = QnaMessageFactory.createPendingQnaMessage({
      id: uuid,
      text: question,
      parentId: parentId ? parentId : undefined,
      createdAt: new Date()
    });

    this._addAnyQnaMessage([pendingQnaMessage]);

    try {
      await this._multiRequestForAddMessage(uuid, question, parentId);
    } catch (err) {
      this._handleMultiRequestsError(err, pendingQnaMessage);
    }
  };

  private async _multiRequestForAddMessage(uuid: string, question: string, parentId: string | null) {
    const {requests, missingProfileId, requestIndexCorrection} = this._prepareSubmitRequest(uuid, question, parentId);

    const responses = await this._player.provider.doRequest([requests]);
    if (!responses) {
      this._logger.error('no response');
      throw new Error('no response');
    }
    const data = responses.get(MessageLoader.id);
    if (!data.response || !data.response.length) {
      const firstError = responses.getFirstError();
      this._logger.error('Add cue point multi-request failed');
      throw new Error('Add cue point multi-request failed');
    }

    if (missingProfileId) {
      this._metadataProfileId = data.response[0].data.objects[0].id;
    }

    const index = 0 + requestIndexCorrection;
    const hasCuePoint = data.response.length > index + 1;
    if (!hasCuePoint) {
      throw new Error('Add cue-point multi-request error: There is no cue-point object added');
    }

    const cuePoint = data.response[index].data;
    if (!cuePoint) {
      throw new Error('Add cue-point multi-request error: There is no KalturaAnnotation cue-point object added');
    }
  }

  private _handleMultiRequestsError(err: any, pendingQnaMessage: QnaMessage) {
    this._logger.error('Failed to submit new question');

    this._kitchenSinkMessages.updateMessageById(pendingQnaMessage.id, pendingQnaMessage.parentId, (message: QnaMessage) => {
      return {...message, deliveryStatus: MessageDeliveryStatus.SEND_FAILED};
    });

    this._displayToast({
      text: "Couldn't sent message",
      icon: <ToastIcon type={ToastsType.Error} />,
      severity: ToastSeverity.Error
    });
  }

  resendQuestion = async (pendingQnaMessage: QnaMessage, parentId: string | null) => {
    if (!pendingQnaMessage.messageContent) {
      return;
    }

    if (pendingQnaMessage.deliveryStatus === MessageDeliveryStatus.SENDING) {
      return;
    }

    const newUuid = Utils.generateId();
    const newMessage = this._kitchenSinkMessages.updateMessageId(pendingQnaMessage.id, newUuid, pendingQnaMessage.parentId);

    if (!newMessage || !newMessage.messageContent) {
      return;
    }

    this._kitchenSinkMessages.updateMessageById(newMessage.id, newMessage.parentId, (message: QnaMessage) => {
      return {...message, deliveryStatus: MessageDeliveryStatus.SENDING};
    });

    try {
      await this._multiRequestForAddMessage(newMessage.id, newMessage.messageContent, parentId);
    } catch (err) {
      this._handleMultiRequestsError(err, newMessage);
    }
  };

  private _prepareSubmitRequest(uuid: string, question: string, parentId: string | null) {
    const userId = Utils.getAnonymousUserId();
    if (!this._entryId) {
      throw new Error("Can't make requests without entryId");
    }
    if (!userId) {
      throw new Error("Can't make requests without userId");
    }
    const missingProfileId = !this._metadataProfileId;
    const requestIndexCorrection = missingProfileId ? 1 : 0;

    // 2 - Prepare to add annotation cuePoint request
    const addCuePointArgs: any = {
      entryId: this._entryId,
      startTime: Date.now(), // TODO player time (this.[_corePlugin].player.currentTime - gives wrong numbers)
      text: question,
      isPublic: 1, // TODO verify with backend team
      searchableOnEntry: 0,
      systemName: uuid
    };

    let thread;
    if (parentId) {
      thread = this._kitchenSinkMessages.getMasterMessageById(parentId);
      if (!thread) {
        throw new Error("Can't make reply requests without thread");
      }
      /**
       * Disclaimer Start -
       * This section which sets kalturaAnnotationArgs.parentId with the last reply is used
       * for other applications and not for this one.
       * For server cuePoint validation it can be change to kalturaAnnotationArgs.parentId = thread.id
       * instead of last reply. (MasterQuestion -> reply -> reply....)
       */
      // create a created Reply List that omit all the failed/ pending message leaving with the created only
      const createdReplyList = thread.replies.filter((qnaMessage: QnaMessage) => {
        return qnaMessage.deliveryStatus === MessageDeliveryStatus.CREATED;
      });
      const cuePointParentId = createdReplyList.length ? createdReplyList[createdReplyList.length - 1].id : thread.id;
      addCuePointArgs.parentId = cuePointParentId;
      /**
       * End.
       */
    }

    //  3 - Prepare to add metadata
    const metadata: Record<string, string> = {};
    if (thread) {
      metadata.ThreadId = thread.id;
    }
    metadata.Type = QnaMessageType.Question;
    metadata.ThreadCreatorId = userId;
    const xmlData = Utils.createXmlFromObject(metadata);

    let metadataProfileId: number | string = this._metadataProfileId ? this._metadataProfileId : 0;
    if (missingProfileId) {
      metadataProfileId = `{1:result:objects:0:id}`;
    }
    const addMetadataArgs = {
      metadataProfileId,
      objectType: 'annotationMetadata.Annotation',
      xmlData: xmlData,
      objectId: `{${1 + requestIndexCorrection}:result:id}`
    };

    // 4 - Prepare to update cuePoint with Tags
    const updateCuePointArgs = {
      id: `{${1 + requestIndexCorrection}:result:id}`
    };

    const multirequest = {
      loader: MessageLoader,
      params: {
        missingProfileId,
        addCuePointArgs,
        addMetadataArgs,
        updateCuePointArgs
      }
    };

    const submitRequestParams: SubmitRequestParams = {
      requests: multirequest,
      missingProfileId,
      requestIndexCorrection
    };
    return submitRequestParams;
  }

  private _addAnyQnaMessage = (qnaMessages: QnaMessage[]): void => {
    qnaMessages.forEach((qnaMessage: QnaMessage) => {
      //is master question
      if (qnaMessage.parentId === null) {
        this._kitchenSinkMessages.add(qnaMessage);
      } else if (qnaMessage.parentId) {
        this._kitchenSinkMessages.addReply(qnaMessage.parentId, qnaMessage);
        this._setWillBeAnsweredOnAir(qnaMessage.parentId);
        this._setMessageAsUnRead(qnaMessage.parentId, qnaMessage);
        //display toasts only for newly created messages in server (not pending/failed)
        //and only for messages sent from the producer and not by current user
        if (Utils.isMessageInTimeFrame(qnaMessage) && qnaMessage.type === QnaMessageType.Answer) {
          //menu icon indication if kitchenSink is closed
          if (!this._isKitchenSinkActive()) this._updateMenuIcon(true);
          //toast indication
          this._displayToast({
            text: 'New Reply',
            icon: <ToastIcon type={ToastsType.Reply} />,
            severity: ToastSeverity.Info
          });
        }
      }
    });
  };

  private _setWillBeAnsweredOnAir(messageId: string): void {
    this._kitchenSinkMessages.updateMessageById(messageId, null, (message: QnaMessage) => {
      if (message.willBeAnsweredOnAir) {
        return message;
      }
      let aoaReplyIndex = Utils.findIndex(message.replies || [], item => {
        return item.isAoAAutoReply;
      });
      if (aoaReplyIndex > -1) {
        return {...message, willBeAnsweredOnAir: true};
      }
      return message;
    });
  }

  private _setMessageAsUnRead(messageId: string, reply: QnaMessage): void {
    // an old reply
    if (!Utils.isMessageInTimeFrame(reply)) return;
    // a reply created by current user and not by producer
    if (reply.type !== QnaMessageType.Answer) return;
    // new reply
    this._kitchenSinkMessages.updateMessageById(messageId, null, (message: QnaMessage) => {
      return {...message, unRead: true};
    });
  }
}
