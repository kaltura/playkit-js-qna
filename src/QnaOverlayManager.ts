import { EventsManager, getContribLogger, PlayerAPI } from "@playkit-js-contrib/common";
import { QnaMessage } from "./QnaMessage";
import { QnAPushNotificationManager } from "./QnAPushNotificationManager";
import {
    HideNotificationEvent,
    RealTimeNotificationsEventTypes,
    RealTimeNotificationsManager,
    ShowNotificationEvent
} from "./RealTimeNotificationsManager";

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
    qnaPushManger: QnAPushNotificationManager;
    realTimeManager: RealTimeNotificationsManager;
    playerApi: PlayerAPI;
}

export class QnaOverlayManager {
    private _initialized = false;
    private _qnaPushManger: QnAPushNotificationManager | null = null;
    private _realTimeManager: RealTimeNotificationsManager | null = null;
    private _playerApi: PlayerAPI | null = null;
    private _events: EventsManager<Events> = new EventsManager<Events>();
    private _currentOverlayMessage: QnaMessage | null = null;

    on: EventsManager<Events>["on"] = this._events.on.bind(this._events);
    off: EventsManager<Events>["off"] = this._events.off.bind(this._events);

    /**
     * should be called once on pluginSetup
     * @param qnaPushManger
     */
    public init({ qnaPushManger, realTimeManager, playerApi }: InPlayerManagerOptions): void {
        if (this._initialized) {
            logger.warn("OverlayManager was already initialized", {
                method: "init"
            });
            return;
        }
        this._initialized = true;
        this._qnaPushManger = qnaPushManger;
        this._realTimeManager = realTimeManager;
        this._playerApi = playerApi;
        this._realTimeManager.on(
            RealTimeNotificationsEventTypes.HideNotification,
            this._hideInPlayerNotification
        );
        this._realTimeManager.on(
            RealTimeNotificationsEventTypes.ShowNotification,
            this._showInPlayerNotification
        );
    }

    /**
     * should be called on media unload
     */
    public reset(): void {}

    /**
     * should be called on pluginDestroy
     * @param qnaPushManger
     */
    public destroy(): void {
        logger.info("destroy OverlayManager", { method: "destroy" });
        if (this._realTimeManager) {
            this._realTimeManager.off(
                RealTimeNotificationsEventTypes.HideNotification,
                this._hideInPlayerNotification
            );
            this._realTimeManager.off(
                RealTimeNotificationsEventTypes.ShowNotification,
                this._showInPlayerNotification
            );
        }
        this.reset();
    }

    private _showInPlayerNotification = ({ message }: ShowNotificationEvent) => {
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

    private _hideInPlayerNotification = ({ message }: HideNotificationEvent) => {
        logger.debug("hide in player overlay notification event", {
            method: "_hideInPlayerNotification"
        });
        this._currentOverlayMessage = null;
        this._events.emit({ type: OverlayEventTypes.HideInPlayer, message });
    };
}
