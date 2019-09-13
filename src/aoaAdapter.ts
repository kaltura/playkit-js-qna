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
    //todo [sa] toastsManager from contrib
}

export interface AoAMessage {
    id: string;
    startTime: number;
    endTime?: number;
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

    private _cuePointEngine: CuepointEngine<AoAMessage> | null = null;
    private _currentNotification: AoAMessage | null = null;
    private _lastId3Timestamp: number | null = null;

    constructor(options: AoaAdapterOptions) {
        this._kitchenSinkMessages = options.kitchenSinkMessages;
        this._qnaPushNotification = options.qnaPushNotification;
        this._bannerManager = options.bannerManager;
        this._playerApi = options.playerApi;
    }

    public init(): void {
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
                    return <AoAMessage>{
                        id: qnaMessage.id,
                        startTime: qnaMessage.startTime,
                        endTime: qnaMessage.endTime,
                        updated: false,
                        qnaMessage
                    };
                }
            );
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
        //show is kitchenSink //todo [sa] will be developed as part of a specific story
        // if (!newMessage.updated) {
        //     newMessage.updated = true;
        //     this._kitchenSinkMessages.addOrUpdateMessage(newMessage.qnaMessage);
        // }
    }

    private _hideBannerNotification() {
        if (!this._currentNotification) return;
        logger.debug("hide notification event", {
            method: "_hideBannerNotification"
        });
        this._bannerManager.remove();
        this._currentNotification = null;
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
                this._triggerAndHandleCuepointsData();
            } catch (e) {
                logger.debug("failed retrieving id3 tag metadata", {
                    method: "_onTimedMetadataLoaded",
                    data: e
                });
            }
        }
    };

    private _getMostRecentMessage(messages: AoAMessage[]): AoAMessage | null {
        let sortedLastFirst = messages.sort((a: AoAMessage, b: AoAMessage) => {
            return b.startTime - a.startTime;
        });
        return sortedLastFirst && sortedLastFirst[0] ? sortedLastFirst[0] : null;
    }
}
