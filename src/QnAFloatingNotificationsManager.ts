import { EventsManager, getContribLogger, PlayerAPI } from "@playkit-js-contrib/common";
import { QnaMessage } from "./QnaMessage";
import {
    HideNotificationEvent,
    TimeAlignedNotificationsEventTypes,
    TimeAlignedNotificationsManager,
    ShowNotificationEvent
} from "./TimeAlignedNotificationsManager";

const logger = getContribLogger({
    class: "OverlayManager",
    module: "qna-plugin"
});

export enum OverlayEventTypes {
    ShowInPlayer = "ShowInPlayer",
    HideInPlayer = "HideInPlayer"
}

export interface HideAnnouncementEvent {
    type: OverlayEventTypes.HideInPlayer;
    message: QnaMessage;
}

export interface ShowAnnouncementEvent {
    type: OverlayEventTypes.ShowInPlayer;
    message: QnaMessage;
}

type Events = HideAnnouncementEvent | ShowAnnouncementEvent;

export interface InPlayerManagerOptions {
    realTimeManager: TimeAlignedNotificationsManager;
    playerApi: PlayerAPI;
}

export class QnAFloatingNotificationsManager {
    private _initialized = false;
    private _timeAlignedNotificationManager: TimeAlignedNotificationsManager | null = null;
    private _playerApi: PlayerAPI | null = null;
    private _events: EventsManager<Events> = new EventsManager<Events>();
    private _currentOverlayMessage: QnaMessage | null = null;

    on: EventsManager<Events>["on"] = this._events.on.bind(this._events);
    off: EventsManager<Events>["off"] = this._events.off.bind(this._events);

    /**
     * should be called once on pluginSetup
     * @param qnaPushManger
     */
    public init({ realTimeManager, playerApi }: InPlayerManagerOptions): void {
        if (this._initialized) {
            logger.warn("OverlayManager was already initialized", {
                method: "init"
            });
            return;
        }
        this._initialized = true;
        this._timeAlignedNotificationManager = realTimeManager;
        this._playerApi = playerApi;
        this._timeAlignedNotificationManager.on(
            TimeAlignedNotificationsEventTypes.HideNotification,
            this._hideFloatingNotification
        );
        this._timeAlignedNotificationManager.on(
            TimeAlignedNotificationsEventTypes.ShowNotification,
            this._showFloatingNotification
        );
    }

    /**
     * should be called on media unload
     */
    public reset(): void {}

    /**
     * should be called on pluginDestroy
     */
    public destroy(): void {
        logger.info("destroy OverlayManager", { method: "destroy" });
        if (this._timeAlignedNotificationManager) {
            this._timeAlignedNotificationManager.off(
                TimeAlignedNotificationsEventTypes.HideNotification,
                this._hideFloatingNotification
            );
            this._timeAlignedNotificationManager.off(
                TimeAlignedNotificationsEventTypes.ShowNotification,
                this._showFloatingNotification
            );
        }
        this.reset();
    }

    private _showFloatingNotification = ({ message }: ShowNotificationEvent) => {
        logger.debug("show in player overlay notification event", {
            method: "_showCurrentNotification",
            data: message
        });
        this._currentOverlayMessage = message;
        this._events.emit({
            type: OverlayEventTypes.ShowInPlayer,
            message
        });
    };

    private _hideFloatingNotification = ({ message }: HideNotificationEvent) => {
        logger.debug("hide in player overlay notification event", {
            method: "_hideFloatingNotification"
        });
        this._currentOverlayMessage = null;
        this._events.emit({ type: OverlayEventTypes.HideInPlayer, message });
    };
}
