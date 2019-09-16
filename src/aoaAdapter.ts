import { KitchenSinkMessages } from "./kitchenSinkMessages";
import {
    PublicQnaNotificationsEvent,
    PushNotificationEventTypes,
    QnaPushNotification
} from "./qnaPushNotification";
import { BannerManager } from "@playkit-js-contrib/ui";
import {
    CuepointEngine,
    getContribLogger,
    PlayerAPI,
    UpdateTimeResponse
} from "@playkit-js-contrib/common";
import { MessageState, QnaMessage, QnaMessageType } from "./qnaMessage";

export interface AoaAdapterOptions {
    kitchenSinkMessages: KitchenSinkMessages;
    qnaPushNotification: QnaPushNotification;
    bannerManager: BannerManager;
    playerApi: PlayerAPI;
    delayedEndTime: number;
    //todo [sa] toastsManager from contrib
}

export interface AoAMessage {
    id: string;
    startTime: number;
    endTime: number;
    updated: boolean;
    qnaMessage: QnaMessage;
}

const logger = getContribLogger({
    class: "AoaAdapter",
    module: "qna-plugin"
});

const SeekThreshold: number = 7 * 1000;

export class AoaAdapter {
    private _kitchenSinkMessages: KitchenSinkMessages;
    private _qnaPushNotification: QnaPushNotification;
    private _bannerManager: BannerManager;
    private _playerApi: PlayerAPI;
    private _delayedEndTime: number;

    private _cuePointEngine: CuepointEngine<AoAMessage> | null = null;
    private _currentNotification: AoAMessage | null = null;
    private _lastId3Timestamp: number | null = null;

    private _initialize = false;
    // messages that might need to be displayed in the kitchenSink are waiting for ID3 timestamp initial value
    private _pendingKSMessages: AoAMessage[] = [];

    constructor(options: AoaAdapterOptions) {
        this._kitchenSinkMessages = options.kitchenSinkMessages;
        this._qnaPushNotification = options.qnaPushNotification;
        this._bannerManager = options.bannerManager;
        this._playerApi = options.playerApi;
        this._delayedEndTime = options.delayedEndTime;
    }

    public init(): void {
        if (this._initialize) return;

        this._initialize = true;
        this._addPlayerListeners();
        this._qnaPushNotification.on(
            PushNotificationEventTypes.PublicNotifications,
            this._handleAoaMessages
        );
    }

    public reset(): void {
        this._cuePointEngine = new CuepointEngine<AoAMessage>([]);
    }

    public destroy(): void {
        logger.info("destroy AoaAdapter", { method: "destroy" });
        this._removePlayerListeners();
        this._qnaPushNotification.off(
            PushNotificationEventTypes.PublicNotifications,
            this._handleAoaMessages
        );
        this.reset();
    }

    private _handleAoaMessages = ({ qnaMessages }: PublicQnaNotificationsEvent): void => {
        logger.debug("handle push notification event", {
            method: "_handleAoaMessages",
            data: qnaMessages
        });
        let notifications: AoAMessage[] = qnaMessages
            .filter((qnaMessage: QnaMessage) => {
                return QnaMessageType.AnswerOnAir === qnaMessage.type;
            })
            .map(
                (qnaMessage: QnaMessage): AoAMessage => {
                    return {
                        id: qnaMessage.id,
                        startTime: qnaMessage.createdAt.getTime(),
                        endTime: qnaMessage.createdAt.getTime() + this._delayedEndTime,
                        updated: false,
                        qnaMessage
                    };
                }
            );

        // The KitchenSink should displays all AOA messages that were already displayed in the player's banner.
        // since the player can be loaded in the middle of a live stream / DVR, there might be some AOA messages
        // that were already passed their startTime and were already displayed in the player's banner.
        // Since these messages won't be handled by the CP engine (already removed), there is a need to handle them
        // outside of the CP engine.
        // also, since the registration to the push manager is done immediately and The player ID3 event can
        // be triggered only in a later time, there is a need to save them until ID3 tag will be triggered.
        this._pendingKSMessages = this._pendingKSMessages
            .concat(notifications)
            .filter((obj: AoAMessage, pos, arr) => {
                return arr.map(mapObj => mapObj.id).indexOf(obj.id) === pos;
            });
        this._createCuePointEngine(notifications);
    };

    private _createCuePointEngine(notifications: AoAMessage[]): void {
        let engineMessages: AoAMessage[] = this._cuePointEngine
            ? this._cuePointEngine.cuepoints
            : [];

        logger.debug("creating new cuepoint engine instance", {
            method: "_createCuePointEngine",
            data: {
                newNotifications: notifications,
                currentNotifications: engineMessages
            }
        });

        let wasUpdated = false;
        notifications.forEach((notification: AoAMessage) => {
            let existingIndex = engineMessages.findIndex((item: AoAMessage) => {
                return item.id === notification.id; //find by Id and not reference to support deleted annotations
            });
            if (existingIndex === -1) {
                //add new AoAMessage
                wasUpdated = true;
                engineMessages.push(notification);
            } else if (notification.qnaMessage.state === MessageState.Deleted) {
                //update current AoAMessage in current cuepoint array
                wasUpdated = true;
                engineMessages.splice(existingIndex, 1);
            }
        });
        if (wasUpdated) {
            this._cuePointEngine = new CuepointEngine<AoAMessage>(engineMessages, {
                reasonableSeekThreshold: SeekThreshold
            });
        }

        this._triggerAndHandleCuepointsData();
    }

    private _triggerAndHandleCuepointsData(): void {
        if (!this._cuePointEngine || !this._lastId3Timestamp) return;

        let engineData: UpdateTimeResponse<AoAMessage> = this._cuePointEngine.updateTime(
            this._lastId3Timestamp,
            false
        );

        logger.debug("handle cuepoint engine data", {
            method: "_handleCuepointEngineData",
            data: engineData
        });

        //in case player was reloaded or user seeked the video
        if (engineData.snapshot) {
            this._handleSnapshotData(this._getMostRecentMessage(engineData.snapshot));
        } else if (engineData.delta) {
            this._handleDeltaData(engineData.delta.show, engineData.delta.hide);
        }
    }

    private _handleSnapshotData(lastShow: AoAMessage | null) {
        if (lastShow) {
            this._showCurrentNotification(lastShow);
        } else {
            //if there is no notification to show - make sure to clear current notification if needed
            // (if user seeked while an notification was displayed)
            this._hideBannerNotification();
        }
    }

    private _handleDeltaData(showArray: AoAMessage[], hideArray: AoAMessage[]) {
        let lastToShow = this._getMostRecentMessage(showArray);

        if (lastToShow && this._currentNotification !== lastToShow) {
            this._showCurrentNotification(lastToShow);
            return;
        }

        if (!this._currentNotification || !hideArray.includes(this._currentNotification)) {
            return;
        }

        this._hideBannerNotification();
    }

    private _showCurrentNotification(newMessage: AoAMessage) {
        logger.debug("show notification event", {
            method: "_showCurrentNotification",
            data: newMessage
        });
        //show in banner
        if (!this._currentNotification || newMessage.id !== this._currentNotification.id) {
            this._currentNotification = newMessage;
            this._bannerManager.add({
                content: {
                    text: newMessage.qnaMessage.messageContent
                        ? newMessage.qnaMessage.messageContent
                        : ""
                }
            });
        }
        this._addToKitchenSink(newMessage);
    }

    private _hideBannerNotification() {
        if (!this._currentNotification) return;
        logger.debug("hide notification event", {
            method: "_hideBannerNotification"
        });
        this._bannerManager.remove();
        this._currentNotification = null;
    }

    private _addToKitchenSink(aoaMessage: AoAMessage): void {
        if (!aoaMessage.updated) {
            aoaMessage.updated = true;
            this._kitchenSinkMessages.addOrUpdateMessage(aoaMessage.qnaMessage);
        }
    }

    private _addPlayerListeners() {
        if (!this._playerApi) return;
        this._removePlayerListeners();
        const { kalturaPlayer, eventManager } = this._playerApi;
        eventManager.listen(
            kalturaPlayer,
            kalturaPlayer.Event.TIMED_METADATA,
            this._onTimedMetadataLoaded
        );
    }

    private _removePlayerListeners() {
        if (!this._playerApi) return;
        const { kalturaPlayer, eventManager } = this._playerApi;
        eventManager.unlisten(
            kalturaPlayer,
            kalturaPlayer.Event.TIMED_METADATA,
            this._onTimedMetadataLoaded
        );
    }

    private _onTimedMetadataLoaded = (event: any): void => {
        const id3TagCues = event.payload.cues.filter(
            (cue: any) => cue.value && cue.value.key === "TEXT"
        );
        if (id3TagCues.length) {
            try {
                this._lastId3Timestamp = JSON.parse(
                    id3TagCues[id3TagCues.length - 1].value.data
                ).timestamp;
                logger.debug(
                    `Calling cuepoint engine updateTime with id3 timestamp: ${
                        this._lastId3Timestamp
                    }`,
                    {
                        method: "_onTimedMetadataLoaded"
                    }
                );
                this._handlePendingKSMessages();
                this._triggerAndHandleCuepointsData();
            } catch (e) {
                logger.debug("failed retrieving id3 tag metadata", {
                    method: "_onTimedMetadataLoaded",
                    data: e
                });
            }
        }
    };

    private _handlePendingKSMessages() {
        while (this._pendingKSMessages.length > 0) {
            let aoaMessage = this._pendingKSMessages.shift();
            // add to KS an AOA message which its' startTime is earlier than current video ID3 timestamp
            // and might not be returned by the CP engine.
            // No need to check for duplication - updated flag / addOrUpdate method handles it.
            if (
                aoaMessage &&
                this._lastId3Timestamp &&
                aoaMessage.startTime <= this._lastId3Timestamp
            ) {
                this._addToKitchenSink(aoaMessage);
            }
        }
    }

    private _getMostRecentMessage(messages: AoAMessage[]): AoAMessage | null {
        let sortedLastFirst = messages.sort((a: AoAMessage, b: AoAMessage) => {
            return b.startTime - a.startTime;
        });
        return sortedLastFirst && sortedLastFirst[0] ? sortedLastFirst[0] : null;
    }
}
