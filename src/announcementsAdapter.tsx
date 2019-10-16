import { KitchenSinkMessages } from "./kitchenSinkMessages";
import {
    PublicQnaNotificationsEvent,
    PushNotificationEventTypes,
    QnaPushNotification
} from "./qnaPushNotification";
import { MessageState, QnaMessage, QnaMessageType } from "./qnaMessageFactory";
import { getContribLogger } from "@playkit-js-contrib/common";
import { ToastSeverity, ToastManager } from "@playkit-js-contrib/ui";
import { ToastIcon, ToastsType } from "./components/toast-icon";
import { h } from "preact";
import { Utils } from "./utils";

export interface AnnouncementsAdapterOptions {
    kitchenSinkMessages: KitchenSinkMessages;
    qnaPushNotification: QnaPushNotification;
    activateKitchenSink: () => void;
    isKitchenSinkActive: () => boolean;
    toastManager: ToastManager;
    updateMenuIcon: (indicatorState: boolean) => void;
    toastDuration: number;
}

const logger = getContribLogger({
    class: "AnnouncementsAdapter",
    module: "qna-plugin"
});

export class AnnouncementsAdapter {
    private _kitchenSinkMessages: KitchenSinkMessages;
    private _qnaPushNotification: QnaPushNotification;
    private _activateKitchenSink: () => void;
    private _isKitchenSinkActive: () => boolean;
    private _updateMenuIcon: (indicatorState: boolean) => void;
    private _toastManager: ToastManager;
    private _toastDuration: number;

    private _initialize = false;

    constructor(options: AnnouncementsAdapterOptions) {
        this._kitchenSinkMessages = options.kitchenSinkMessages;
        this._qnaPushNotification = options.qnaPushNotification;
        this._activateKitchenSink = options.activateKitchenSink;
        this._isKitchenSinkActive = options.isKitchenSinkActive;
        this._toastManager = options.toastManager;
        this._toastDuration = options.toastDuration;
        this._updateMenuIcon = options.updateMenuIcon;
    }

    public init(): void {
        if (this._initialize) return;

        this._initialize = true;
        this._qnaPushNotification.on(
            PushNotificationEventTypes.PublicNotifications,
            this._processAnnouncements
        );
    }

    public destroy(): void {
        this._qnaPushNotification.off(
            PushNotificationEventTypes.PublicNotifications,
            this._processAnnouncements
        );
    }

    private _processAnnouncements = ({ qnaMessages }: PublicQnaNotificationsEvent): void => {
        //todo [sa] handle toasts
        let announcements: QnaMessage[] = qnaMessages.filter((qnaMessage: QnaMessage) => {
            return qnaMessage.type === QnaMessageType.Announcement;
        });
        announcements.forEach((qnaMessage: QnaMessage) => {
            if (qnaMessage.state === MessageState.Deleted) {
                this._kitchenSinkMessages.deleteMessage(qnaMessage.id);
            } else {
                this._kitchenSinkMessages.add(qnaMessage);
                //display toasts only for newly created messages
                if (Utils.isMessageInTimeFrame(qnaMessage)) {
                    this._showAnnouncementNotifications();
                }
            }
        });
    };

    private _showAnnouncementNotifications() {
        if (!this._isKitchenSinkActive()) {
            //menu icon indication
            this._updateMenuIcon(true);
            //toast indication
            this._toastManager.add({
                title: "Notifications",
                text: "New Announcement",
                icon: <ToastIcon type={ToastsType.Announcement} />,
                duration: this._toastDuration,
                severity: ToastSeverity.Info,
                onClick: () => {
                    this._activateKitchenSink();
                }
            });
        }
    }
}
