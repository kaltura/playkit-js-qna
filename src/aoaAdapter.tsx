import { KitchenSinkMessages } from "./kitchenSinkMessages";
import {
    PublicQnaNotificationsEvent,
    PushNotificationEventTypes,
    QnaPushNotification
} from "./qnaPushNotification";
import { BannerManager, VisibilityMode, BannerState, ToastSeverity } from "@playkit-js-contrib/ui";
import { CuepointEngine, getContribLogger, UpdateTimeResponse } from "@playkit-js-contrib/common";
import { MessageState, QnaMessage, QnaMessageType } from "./qnaMessageFactory";
import { ToastIcon, ToastsType } from "./components/toast-icon";
import { h } from "preact";
import { Utils } from "./utils";
import { DisplayToast } from "./qna-plugin";

export interface AoaAdapterOptions {
    kitchenSinkMessages: KitchenSinkMessages;
    qnaPushNotification: QnaPushNotification;
    bannerManager: BannerManager;
    isKitchenSinkActive: () => boolean;
    updateMenuIcon: (indicatorState: boolean) => void;
    displayToast: DisplayToast;
    kalturaPlayer: KalturaPlayerTypes.Player;
    delayedEndTime: number;
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
    private _isKitchenSinkActive: () => boolean;
    private _updateMenuIcon: (indicatorState: boolean) => void;
    private _displayToast: DisplayToast;
    private _kalturaPlayer: KalturaPlayerTypes.Player;
    private _delayedEndTime: number;

    private _cuePointEngine: CuepointEngine<AoAMessage> | null = null;
    private _currentNotification: AoAMessage | null = null;
    private _lastId3Timestamp: number | null = null;

    private _initialize = false;
    // messages that will be displayed in the kitchenSink according to current ID3 timestamp
    private _pendingKsMessages: AoAMessage[] = [];

    constructor(options: AoaAdapterOptions) {
        this._kitchenSinkMessages = options.kitchenSinkMessages;
        this._qnaPushNotification = options.qnaPushNotification;
        this._bannerManager = options.bannerManager;
        this._isKitchenSinkActive = options.isKitchenSinkActive;
        this._updateMenuIcon = options.updateMenuIcon;
        this._displayToast = options.displayToast;
        this._kalturaPlayer = options.kalturaPlayer;
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
        let aoaMessages: AoAMessage[] = qnaMessages
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
        this._addPendingKSMessages(aoaMessages);
        this._createCuePointEngine(aoaMessages);
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
            let existingIndex = Utils.findIndex(engineMessages, item => {
                return item.id === notification.id;
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
            const currentBannerState = this._bannerManager.add({
                content: {
                    text: newMessage.qnaMessage.messageContent
                        ? newMessage.qnaMessage.messageContent
                        : ""
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
                text: "New Audience asks",
                icon: <ToastIcon type={ToastsType.AOA} />,
                severity: ToastSeverity.Info
            });
        }
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
        if (!this._kalturaPlayer) return;
        this._removePlayerListeners();
        this._kalturaPlayer.addEventListener(
            this._kalturaPlayer.Event.TIMED_METADATA,
            this._onTimedMetadataLoaded
        );
    }

    private _removePlayerListeners() {
        if (!this._kalturaPlayer) return;
        this._kalturaPlayer.removeEventListener(
            this._kalturaPlayer.Event.TIMED_METADATA,
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
                this._handlePendingKsMessages();
                this._triggerAndHandleCuepointsData();
            } catch (e) {
                logger.debug("failed retrieving id3 tag metadata", {
                    method: "_onTimedMetadataLoaded",
                    data: e
                });
            }
        }
    };

    private _addPendingKSMessages(messages: AoAMessage[]) {
        if (this._pendingKsMessages.length === 0) {
            this._pendingKsMessages = [...messages];
        } else {
            messages.forEach(newMessage => {
                let foundIndex = Utils.findIndex(this._pendingKsMessages, item => {
                    return item.id === newMessage.id;
                });
                if (foundIndex === -1) {
                    this._pendingKsMessages.push({ ...newMessage });
                }
            });
        }
        this._pendingKsMessages.sort((a, b) => {
            return a.startTime - b.startTime;
        });
    }

    private _handlePendingKsMessages(): void {
        if (!this._lastId3Timestamp || this._pendingKsMessages.length === 0) return;

        let closestIndex = this._binarySearch(this._pendingKsMessages, this._lastId3Timestamp);
        if (closestIndex !== null && closestIndex > -1) {
            this._pendingKsMessages.splice(0, closestIndex + 1).forEach(aoaMessage => {
                this._kitchenSinkMessages.add(aoaMessage.qnaMessage);
            });
        }
    }

    private _getMostRecentMessage(messages: AoAMessage[]): AoAMessage | null {
        let sortedLastFirst = messages.sort((a: AoAMessage, b: AoAMessage) => {
            return b.startTime - a.startTime;
        });
        return sortedLastFirst && sortedLastFirst[0] ? sortedLastFirst[0] : null;
    }

    private _binarySearch(items: AoAMessage[], target: number): number | null {
        if (!items || items.length === 0) {
            // empty array, no index to return
            return null;
        }

        if (target < items[0].startTime) {
            // value less then the first item. return -1
            return -1;
        }
        if (target > items[items.length - 1].startTime) {
            // value bigger then the last item, return last item index
            return items.length - 1;
        }

        let lo = 0;
        let hi = items.length - 1;

        while (lo <= hi) {
            let mid = Math.floor((hi + lo + 1) / 2);

            if (target < items[mid].startTime) {
                hi = mid - 1;
            } else if (target > items[mid].startTime) {
                lo = mid + 1;
            } else {
                return mid;
            }
        }

        return Math.min(lo, hi); // return the lowest index which represent the last visual item
    }
}
