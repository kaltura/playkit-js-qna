import {
    CuepointEngine,
    UpdateTimeResponse,
    EventManager,
    getContribLogger,
    PlayerAPI
} from "@playkit-js-contrib/common";
import { QnaMessage, QnaMessageType } from "./QnaMessage";
import {
    PushNotificationEventsTypes,
    QnAPushNotificationManager
} from "./QnAPushNotificationManager";

const logger = getContribLogger({
    class: "InPlayerNotificationsManager",
    module: "qna-plugin"
});

const SeekThreshold: number = 7 * 1000;

const AnnouncementAutoCloseDuration: number = 60 * 1000;

const AnnotationDeleted = "Annotation_Deleted";

export class InPlayerNotificationsManager {
    private _initialized = false;
    private _messageEventManager: EventManager = new EventManager();
    private _cuePointEngine: CuepointEngine<QnaMessage> | null = null;
    private _playerApi: PlayerAPI;
    private _currentNotification: QnaMessage | null = null;
    private _eventHandlersUUIds: string[] = [];
    private _lastIdsTimestamp: number | null = null;

    public get messageEventManager(): EventManager {
        return this._messageEventManager;
    }

    constructor(playerApi: PlayerAPI) {
        this._playerApi = playerApi;
    }

    public init(qnaPushManger: QnAPushNotificationManager): void {
        if (this._initialized) return;
        logger.info("init InPlayerNotificationsManager", { method: "init" });
        this._addPlayerListeners();
        this._addPushNotificationEventHandlers(qnaPushManger);
        this._initialized = true;
    }

    public reset(qnaPushManger: QnAPushNotificationManager | null): void {
        logger.info("destroy InPlayerNotificationsManager", { method: "destroy" });
        if (qnaPushManger) {
            this._removePushNotificationEventHandlers(qnaPushManger);
        }
        this._removePlayerListeners();
        this._cuePointEngine = new CuepointEngine<QnaMessage>([]);
        this._initialized = false;
    }

    private _addPushNotificationEventHandlers(qnaPushManger: QnAPushNotificationManager): void {
        if (this._initialized) return;
        logger.info("Adding in player notifications event handler", {
            method: "_addPushNotificationEventHandlers"
        });

        let uuid = qnaPushManger.addEventHandler({
            type: PushNotificationEventsTypes.PublicNotifications,
            handleFunc: this._handlePushResponse.bind(this)
        });
        this._eventHandlersUUIds.push(uuid);
    }

    private _removePushNotificationEventHandlers(qnaPushManger: QnAPushNotificationManager): void {
        this._eventHandlersUUIds.forEach(uuid => {
            qnaPushManger.removeEventHandler(uuid);
        });
    }

    private _handlePushResponse(qnaMessages: QnaMessage[]): void {
        let notifications: QnaMessage[] = qnaMessages.filter((qnaMessage: QnaMessage) => {
            this._updateQnaMessageEndTime(qnaMessage);
            return [QnaMessageType.Announcement, QnaMessageType.AnswerOnAir].includes(
                qnaMessage.type
            );
        });
        this._createCuePointEngine(notifications);
    }

    private _addPlayerListeners() {
        if (this._initialized) return;
        const { kalturaPlayer, eventManager } = this._playerApi;
        eventManager.listen(
            kalturaPlayer,
            kalturaPlayer.Event.TIMED_METADATA,
            this._onTimedMetadataLoaded
        );
    }

    private _removePlayerListeners() {
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
                this._lastIdsTimestamp = JSON.parse(
                    id3TagCues[id3TagCues.length - 1].value.data
                ).timestamp;
                logger.debug(
                    `Calling cuepoint engine updateTime with id3 timestamp: ${
                        this._lastIdsTimestamp
                    }`,
                    {
                        method: "_onTimedMetadataLoaded"
                    }
                );
                this._triggerCuepointsUpdateTime();
            } catch (e) {
                console.log(e); //TODO [sa] handle errors
            }
        }
    };

    private _createCuePointEngine(notifications: QnaMessage[]): void {
        if (!this._cuePointEngine || this._cuePointEngine.cuepoints.length === 0) {
            this._cuePointEngine = new CuepointEngine<QnaMessage>(notifications, {
                reasonableSeekThreshold: SeekThreshold
            });
        } else {
            let engineMessages: QnaMessage[] = this._cuePointEngine.cuepoints;
            let wasUpdated = false;
            notifications.forEach((notification: QnaMessage) => {
                let existingIndex = engineMessages.findIndex((item: QnaMessage) => {
                    return item.id === notification.id;
                });
                if (existingIndex === -1) {
                    //add new QnaMessage
                    wasUpdated = true;
                    engineMessages.push(notification);
                } else if (notification.tags.indexOf(AnnotationDeleted) > -1) {
                    //update current QnaMessage in current cuepoint array
                    wasUpdated = true;
                    engineMessages[existingIndex].tags = notification.tags;
                    this._updateQnaMessageEndTime(engineMessages[existingIndex]);
                }
            });
            if (wasUpdated) {
                this._cuePointEngine = new CuepointEngine<QnaMessage>(engineMessages, {
                    reasonableSeekThreshold: SeekThreshold
                });
            }
        }

        this._triggerCuepointsUpdateTime();
    }

    private _triggerCuepointsUpdateTime(): void {
        if (this._cuePointEngine && this._lastIdsTimestamp) {
            let engineData: UpdateTimeResponse<QnaMessage> = this._cuePointEngine.updateTime(
                this._lastIdsTimestamp,
                false,
                (item: QnaMessage) => {
                    //no need to filter at all
                    if (this._isLive() && this._isOnLiveEdge()) return true;
                    //if DVR / VOD only answer on air
                    return item.type === QnaMessageType.AnswerOnAir;
                }
            );
            logger.debug("Triggering updateTime", {
                method: "_triggerCuepointsUpdateTime",
                data: engineData
            });
            this._handleCuepointEngineData(engineData);
        }
    }

    private _updateQnaMessageEndTime(qnaMessage: QnaMessage): void {
        qnaMessage.endTime =
            qnaMessage.tags.indexOf("Annotation_Deleted") > -1
                ? qnaMessage.startTime + 1 //need to remove at once (adding one to ease the sorting by end/start time)
                : qnaMessage.startTime + AnnouncementAutoCloseDuration; //one minute after start time (for hiding the announcement in player)
    }

    private _handleCuepointEngineData(data: UpdateTimeResponse<QnaMessage>) {
        //in case player was reloaded or user seeked the video
        if (data.snapshot) {
            this._handleSnapshotData(this._getMostRecentObject(data.snapshot));
        } else if (data.delta) {
            this._handleDeltaData(data.delta.show, data.delta.hide);
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
        let lastToHide = this._getMostRecentObject(hideArray);
        // only show objects
        if (!lastToHide && lastToShow) {
            this._showCurrentNotification(lastToShow);
        }
        // only hide objects + displaying a notification in player (if we are not displaying there is nothing to be done)
        if (!lastToShow && lastToHide && this._currentNotification) {
            //check if current displayed object should be removed (if in current hide array)
            let currentToRemove = hideArray.find(message => {
                return this._currentNotification
                    ? message.id === this._currentNotification.id
                    : false;
            });
            if (currentToRemove) {
                this._hideCurrentNotification();
            }
        }
        // if exist both show and hide objects
        if (lastToHide && lastToShow) {
            // if most recent object is a show object
            if (lastToShow.startTime > lastToHide.startTime) {
                // since this message comes from the delta object if must be at least as recent as our current displayed notification
                this._showCurrentNotification(lastToShow);
            } else {
                if (lastToShow.id === lastToHide.id) {
                    //since current displayed message, if exists, must be older than the data returned from the delta object -  we can remove all
                    this._hideCurrentNotification();
                } else {
                    let lastShowToRemove = hideArray.find(message => {
                        return lastToShow ? lastToShow.id === message.id : false;
                    });
                    lastShowToRemove
                        ? // if lastShow was found in hide array we need to hide everything because lastToShow is more recent than the current displayed notification
                          // so if need to hide it - our current notification should be removed as well.
                          this._hideCurrentNotification()
                        : // if lastToShow wasn't fount in hide array, there is no need to hide it yet - so will need to show it.
                          this._showCurrentNotification(lastToShow);
                }
            }
        }
    }

    private _getMostRecentObject(messages: QnaMessage[]): QnaMessage | null {
        let sortedLastFirst = messages.sort((a: QnaMessage, b: QnaMessage) => {
            return b.startTime - a.startTime;
        });
        return sortedLastFirst && sortedLastFirst[0] ? sortedLastFirst[0] : null;
    }

    private _showCurrentNotification(newMessage: QnaMessage) {
        if (!this._currentNotification || newMessage.id !== this._currentNotification.id) {
            this._currentNotification = newMessage;
            if (this._messageEventManager) {
                this._messageEventManager.emit("showAnnouncement", this._currentNotification);
            }
        }
    }

    private _hideCurrentNotification() {
        this._currentNotification = null;
        if (this._messageEventManager) {
            this._messageEventManager.emit("hideAnnouncement");
        }
    }

    /**
     * returns a boolean to detect if player is on live edge with buffer of 2 seconds
     * indication if user is watching DVR mode at the moment
     * @returns {boolean} - is player on live edge
     */
    private _isOnLiveEdge(): boolean {
        return (
            this._playerApi.kalturaPlayer.currentTime >= this._playerApi.kalturaPlayer.duration - 2
        );
    }

    private _isLive(): boolean {
        return this._playerApi.kalturaPlayer.isLive();
    }
}
