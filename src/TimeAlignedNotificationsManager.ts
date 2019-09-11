import {
    CuepointEngine,
    EventsManager,
    getContribLogger,
    PlayerAPI,
    UpdateTimeResponse
} from "@playkit-js-contrib/common";
import { MessageState, QnaMessage, QnaMessageType } from "./QnaMessage";
import {
    PublicQnaNotificationsEvent,
    PushNotificationEventTypes,
    QnAPushNotificationManager
} from "./QnAPushNotificationManager";
import { Utils } from "./utils";

export enum TimeAlignedNotificationsEventTypes {
    ShowNotification = "ShowNotification",
    HideNotification = "HideNotification"
}

export interface HideNotificationEvent {
    type: TimeAlignedNotificationsEventTypes.HideNotification;
    message: QnaMessage;
}

export interface ShowNotificationEvent {
    type: TimeAlignedNotificationsEventTypes.ShowNotification;
    message: QnaMessage;
}

type Events = HideNotificationEvent | ShowNotificationEvent;

interface TimeAlignedNotificationsManagerOptions {
    qnaPushManger: QnAPushNotificationManager;
    playerApi: PlayerAPI;
}

const logger = getContribLogger({
    class: "TimeAlignedNotificationsManager",
    module: "qna-plugin"
});

const SeekThreshold: number = 7 * 1000;

/**
 * currently handle only AnswerOnAir public objects since they are the only real time relevant objects
 */
export class TimeAlignedNotificationsManager {
    private _playerApi: PlayerAPI | null = null;
    private _qnaPushManger: QnAPushNotificationManager | null = null;
    private _cuePointEngine: CuepointEngine<QnaMessage> | null = null;
    private _currentNotification: QnaMessage | null = null;
    private _events: EventsManager<Events> = new EventsManager<Events>();
    private _lastId3Timestamp: number | null = null;
    private _initialized = false;

    on: EventsManager<Events>["on"] = this._events.on.bind(this._events);
    off: EventsManager<Events>["off"] = this._events.off.bind(this._events);

    public init({ qnaPushManger, playerApi }: TimeAlignedNotificationsManagerOptions) {
        if (this._initialized) {
            logger.warn("TimeAlignedNotificationsManager was already initialized", {
                method: "init"
            });
            return;
        }
        this._playerApi = playerApi;
        this._qnaPushManger = qnaPushManger;
        this._addPlayerListeners();
        this._qnaPushManger.on(
            PushNotificationEventTypes.PublicNotifications,
            this._handlePushPublicResponse
        );
    }

    /**
     * on media unload
     */
    public reset() {
        this._cuePointEngine = new CuepointEngine<QnaMessage>([]);
    }

    /**
     * on Destroy
     * @param qnaMessages
     * @private
     */
    public destroy() {
        logger.info("destroy TimeAlignedNotificationsManager", { method: "destroy" });
        this._removePlayerListeners();
        if (this._qnaPushManger)
            this._qnaPushManger.off(
                PushNotificationEventTypes.PublicNotifications,
                this._handlePushPublicResponse
            );
        this.reset();
    }

    private _handlePushPublicResponse = ({ qnaMessages }: PublicQnaNotificationsEvent): void => {
        logger.debug("handle push notification event", {
            method: "_handlePushPublicResponse",
            data: qnaMessages
        });
        let notifications: QnaMessage[] = qnaMessages.filter((qnaMessage: QnaMessage) => {
            return [QnaMessageType.Announcement, QnaMessageType.AnswerOnAir].includes(
                qnaMessage.type
            );
        });
        this._createCuePointEngine(notifications);
    };

    private _createCuePointEngine(notifications: QnaMessage[]): void {
        let engineMessages: QnaMessage[] = this._cuePointEngine
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
        notifications.forEach((notification: QnaMessage) => {
            let existingIndex = engineMessages.findIndex((item: QnaMessage) => {
                return item.id === notification.id; //find by Id and not reference to support "Annotation_Deleted"
            });
            if (existingIndex === -1) {
                //add new QnaMessage
                wasUpdated = true;
                engineMessages.push(notification);
            } else if (notification.state === MessageState.Deleted) {
                //update current QnaMessage in current cuepoint array
                wasUpdated = true;
                engineMessages.splice(existingIndex, 1);
            }
        });
        if (wasUpdated) {
            this._cuePointEngine = new CuepointEngine<QnaMessage>(engineMessages, {
                reasonableSeekThreshold: SeekThreshold
            });
        }

        this._triggerAndHandleCuepointsData();
    }

    private _triggerAndHandleCuepointsData(): void {
        if (!this._cuePointEngine || !this._lastId3Timestamp) return;

        let engineData: UpdateTimeResponse<QnaMessage> = this._cuePointEngine.updateTime(
            this._lastId3Timestamp,
            false,
            (item: QnaMessage) => {
                //no need to filter at all
                if (this._isLive() && this._isOnLiveEdge()) return true;
                //if DVR / VOD only answer on air
                return item.type === QnaMessageType.AnswerOnAir;
            }
        );

        logger.debug("handle cuepoint engine data", {
            method: "_handleCuepointEngineData",
            data: engineData
        });

        //in case player was reloaded or user seeked the video
        if (engineData.snapshot) {
            this._handleSnapshotData(Utils.getMostRecentMessage(engineData.snapshot));
        } else if (engineData.delta) {
            this._handleDeltaData(engineData.delta.show, engineData.delta.hide);
        }
    }

    private _handleSnapshotData(lastShow: QnaMessage | null) {
        if (lastShow) {
            this._showCurrentNotification(lastShow);
        } else {
            //if there is no announcement to show - make sure to clear current announcement if needed
            // (if user seeked while an announcement was displayed)
            this._hideCurrentNotification();
        }
    }

    private _handleDeltaData(showArray: QnaMessage[], hideArray: QnaMessage[]) {
        let lastToShow = Utils.getMostRecentMessage(showArray);

        if (lastToShow && this._currentNotification !== lastToShow) {
            this._showCurrentNotification(lastToShow);
            return;
        }

        if (!this._currentNotification || !hideArray.includes(this._currentNotification)) {
            return;
        }

        this._hideCurrentNotification();
    }

    private _showCurrentNotification(newMessage: QnaMessage) {
        logger.debug("show notification event", {
            method: "_showCurrentNotification",
            data: newMessage
        });
        if (!this._currentNotification || newMessage.id !== this._currentNotification.id) {
            this._currentNotification = newMessage;
            this._events.emit({
                type: TimeAlignedNotificationsEventTypes.ShowNotification,
                message: this._currentNotification
            });
        }
    }

    private _hideCurrentNotification() {
        if (!this._currentNotification) return;
        logger.debug("hide notification event", {
            method: "_hideCurrentNotification"
        });
        this._events.emit({
            type: TimeAlignedNotificationsEventTypes.HideNotification,
            message: this._currentNotification
        });

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

    /**
     * returns a boolean to detect if player is on live edge with buffer of 2 seconds
     * indication if user is watching DVR mode at the moment
     * @returns {boolean} - is player on live edge
     */
    private _isOnLiveEdge(): boolean {
        if (!this._playerApi) return false;
        return (
            this._playerApi.kalturaPlayer.currentTime >= this._playerApi.kalturaPlayer.duration - 2
        );
    }

    private _isLive(): boolean {
        return this._playerApi !== null && this._playerApi.kalturaPlayer.isLive();
    }
}
