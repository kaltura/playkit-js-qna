import {
    CuepointEngine,
    UpdateTimeResponse,
    EventsManager,
    getContribLogger,
    PlayerAPI
} from "@playkit-js-contrib/common";
import { QnaMessage, QnaMessageType } from "./QnaMessage";
import {
    PublicQnaNotificationsEvent,
    PushNotificationEventTypes,
    QnAPushNotificationManager
} from "./QnAPushNotificationManager";

const logger = getContribLogger({
    class: "InPlayerNotificationsManager",
    module: "qna-plugin"
});

const SeekThreshold: number = 7 * 1000;

export enum InPlayerNotificationsEventTypes {
    ShowAnnouncement = "ShowAnnouncement",
    HideAnnouncement = "HideAnnouncement"
}

export interface HideAnnouncementEvent {
    type: InPlayerNotificationsEventTypes.HideAnnouncement;
}

export interface ShowAnnouncementEvent {
    type: InPlayerNotificationsEventTypes.ShowAnnouncement;
    message: QnaMessage;
}

type Events = HideAnnouncementEvent | ShowAnnouncementEvent;

export class InPlayerNotificationsManager {
    private _initialized = false;
    private _events: EventsManager<Events> = new EventsManager<Events>();
    private _cuePointEngine: CuepointEngine<QnaMessage> | null = null;
    private _playerApi: PlayerAPI | null = null;
    private _currentNotification: QnaMessage | null = null;
    private _lastId3Timestamp: number | null = null;

    on = this._events.on.bind(this._events);
    off = this._events.off.bind(this._events);

    /**
     * should be called once on pluginSetup
     * @param qnaPushManger
     */
    public init(qnaPushManger: QnAPushNotificationManager, playerApi: PlayerAPI): void {
        if (this._initialized) {
            logger.warn("InPlayerNotificationsManager was already initialized", {
                method: "init"
            });
            return;
        }
        this._initialized = true;
        this._playerApi = playerApi;
        this._addPlayerListeners();
        qnaPushManger.on(PushNotificationEventTypes.PublicNotifications, this._handlePushResponse);
    }

    /**
     * should be called on media unload
     */
    public reset(): void {
        this._cuePointEngine = new CuepointEngine<QnaMessage>([]);
    }

    /**
     * should be called on pluginDestroy
     * @param qnaPushManger
     */
    public destroy(qnaPushManger: QnAPushNotificationManager | null): void {
        logger.info("destroy InPlayerNotificationsManager", { method: "destroy" });
        if (qnaPushManger) {
            qnaPushManger.off(
                PushNotificationEventTypes.PublicNotifications,
                this._handlePushResponse
            );
        }
        this._removePlayerListeners();
        this.reset();
    }

    private _handlePushResponse = ({ qnaMessages }: PublicQnaNotificationsEvent): void => {
        logger.debug("handle push notification event", {
            method: "_handlePushResponse",
            data: qnaMessages
        });
        let notifications: QnaMessage[] = qnaMessages.filter((qnaMessage: QnaMessage) => {
            return [QnaMessageType.Announcement, QnaMessageType.AnswerOnAir].includes(
                qnaMessage.type
            );
        });
        this._createCuePointEngine(notifications);
    };

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
            } else if (notification.tags.indexOf("Annotation_Deleted") > -1) {
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
            this._handleSnapshotData(this._getMostRecentObject(engineData.snapshot));
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
        let lastToShow = this._getMostRecentObject(showArray);

        if (lastToShow && this._currentNotification !== lastToShow) {
            this._showCurrentNotification(lastToShow);
            return;
        }

        if (!this._currentNotification || !hideArray.includes(this._currentNotification)) {
            return;
        }

        this._hideCurrentNotification();
    }

    private _getMostRecentObject(messages: QnaMessage[]): QnaMessage | null {
        let sortedLastFirst = messages.sort((a: QnaMessage, b: QnaMessage) => {
            return b.startTime - a.startTime;
        });
        return sortedLastFirst && sortedLastFirst[0] ? sortedLastFirst[0] : null;
    }

    private _showCurrentNotification(newMessage: QnaMessage) {
        logger.debug("show notification event", {
            method: "_showCurrentNotification",
            data: newMessage
        });
        if (!this._currentNotification || newMessage.id !== this._currentNotification.id) {
            this._currentNotification = newMessage;
            this._events.emit({
                type: InPlayerNotificationsEventTypes.ShowAnnouncement,
                message: this._currentNotification
            });
        }
    }

    private _hideCurrentNotification() {
        logger.debug("hide notification event", {
            method: "_hideCurrentNotification"
        });
        this._currentNotification = null;
        this._events.emit({ type: InPlayerNotificationsEventTypes.HideAnnouncement });
    }

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
