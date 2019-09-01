import {
    CuepointEngine,
    EventManager,
    getContribLogger,
    PlayerAPI
} from "@playkit-js-contrib/common";
import { QnaMessage, QnaMessageType } from "./QnaMessage";
import { PushNotificationEvents, QnAPushNotificationManager } from "./QnAPushNotificationManager";
import { Utils } from "./utils";
import { KalturaAnnotation } from "kaltura-typescript-client/api/types/KalturaAnnotation";

export interface CuepointEngineResponse {
    snapshot?: any[];
    delta?: {
        show: any[];
        hide: any[];
    };
}

const logger = getContribLogger({
    class: "InPlayerNotificationsManager",
    module: "qna-plugin"
});

const ReasonableSeekThreshold: number = 7 * 1000;

const AnnouncementAutoCloseDuration: number = 60 * 1000;

//TODO [sa] add log messages
export class InPlayerNotificationsManager {
    private _messageEventManager: EventManager = new EventManager();
    private _cuePointEngine: CuepointEngine<QnaMessage> | null = null;
    private _playerApi: PlayerAPI;
    private _announcements: QnaMessage[] = [];
    private _answersOnAir: QnaMessage[] = [];
    private _currentNotification: QnaMessage | null = null;
    private _eventHandlersUUIds: [string, PushNotificationEvents][] = [];

    public get messageEventManager(): EventManager {
        return this._messageEventManager;
    }

    constructor(playerApi: PlayerAPI) {
        this._playerApi = playerApi;
        this._addPlayerListeners();
    }

    public addPushNotificationEventHandlers(qnaPushManger: QnAPushNotificationManager): void {
        this._eventHandlersUUIds.push([
            qnaPushManger.addEventHandler(
                PushNotificationEvents.PublicNotifications,
                this._handlePushResponse.bind(this)
            ),
            PushNotificationEvents.PublicNotifications
        ]);
    }

    public removePushNotificationEventHandlers(
        qnaPushManger: QnAPushNotificationManager | null
    ): void {
        if (qnaPushManger)
            this._eventHandlersUUIds.forEach(eventTuple => {
                qnaPushManger.removeEventHandler(...eventTuple);
            });
    }

    public unregister() {
        this._announcements = [];
        this._answersOnAir = [];
        this._cuePointEngine = new CuepointEngine<QnaMessage>([]);
    }

    private _handlePushResponse(response: any) {
        let wasUpdated = false;
        response
            .reduce(Utils.getkalturaAnnotationReducer(logger), [])
            .map((cuePoint: KalturaAnnotation) => {
                return QnaMessage.create(cuePoint);
            })
            .forEach((newMessage: QnaMessage) => {
                if (
                    [QnaMessageType.Announcement, QnaMessageType.AnswerOnAir].includes(
                        newMessage.type
                    )
                ) {
                    wasUpdated = wasUpdated || this._handleQnaMessage(newMessage);
                }
            });
        if (wasUpdated) {
            this._cuePointEngine = new CuepointEngine<QnaMessage>(
                this._getNotificationsForHandling(),
                ReasonableSeekThreshold
            );
        }
    }

    private _addPlayerListeners() {
        const { kalturaPlayer, eventManager } = this._playerApi;
        eventManager.listen(kalturaPlayer, kalturaPlayer.Event.TIMED_METADATA, (event: any) => {
            this._onTimedMetadataLoaded(event);
        });
        eventManager.listen(kalturaPlayer, kalturaPlayer.Event.SEEKING, (event: any) => {
            this._cuePointEngine = new CuepointEngine<QnaMessage>(
                this._getNotificationsForHandling(),
                ReasonableSeekThreshold
            );
        });
    }

    private _handleQnaMessage(newQnaMessage: QnaMessage): boolean {
        let wasUpdated = false;
        let notificationIndex = this._getRelevantNotificationArray(newQnaMessage).findIndex(
            qnaMessage => {
                return qnaMessage.id === newQnaMessage.id;
            }
        );

        if (notificationIndex === -1) {
            this._updateQnaMessageEndTime(newQnaMessage);
            this._getRelevantNotificationArray(newQnaMessage).push(newQnaMessage);
            wasUpdated = true;
        }
        return wasUpdated;
    }

    private _updateQnaMessageEndTime(qnaMessage: QnaMessage) {
        qnaMessage.endTime =
            qnaMessage.tags.indexOf("Annotation_Deleted") > -1
                ? qnaMessage.startTime + 1 //need to remove at once (adding one to ease the sorting by end/start time)
                : qnaMessage.startTime + AnnouncementAutoCloseDuration; //one minute after start time (for hiding the announcement in player)
    }

    private _onTimedMetadataLoaded(event: any): void {
        if (this._cuePointEngine) {
            const id3TagCues = event.payload.cues.filter(
                (cue: any) => cue.value && cue.value.key === "TEXT"
            );
            if (id3TagCues.length) {
                try {
                    let timestamp = JSON.parse(id3TagCues[id3TagCues.length - 1].value.data)
                        .timestamp;
                    this._handleCuepointEngineData(this._cuePointEngine.updateTime(timestamp));
                } catch (e) {
                    console.log(e); //TODO [sa] handle errors
                }
            }
        }
    }

    private _handleCuepointEngineData(data: CuepointEngineResponse) {
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
     * Announcement should only be visible during live streaming (not in VOD / DVR mode)
     * AnswerOnAir should be visible always
     * @return QnaMessage[] : AnswerOnAir only / All
     */
    private _getNotificationsForHandling() {
        //if user is currently watching live streaming (not DVR / VOD)
        if (this._isLive() && this._isOnLiveEdge()) {
            return this._announcements.concat(this._answersOnAir);
        }
        //if user is in DVR mode / VOD
        return this._answersOnAir;
    }

    private _getRelevantNotificationArray(qnaMessage: QnaMessage) {
        return qnaMessage.type === QnaMessageType.Announcement
            ? this._announcements
            : this._answersOnAir;
    }

    /**
     * returns a boolean to detect if player is on live edge with buffer of 1 second
     * indication if user is watching DVR mode at the moment
     * @returns {boolean} - is player on live edge
     */
    private _isOnLiveEdge(): boolean {
        return (
            this._playerApi.kalturaPlayer.currentTime >= this._playerApi.kalturaPlayer.duration - 1
        );
    }

    private _isLive(): boolean {
        return this._playerApi.kalturaPlayer.isLive();
    }
}
