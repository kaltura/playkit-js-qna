import { KitchenSinkMessages } from "./kitchenSinkMessages";
import {
    PublicQnaNotificationsEvent,
    PushNotificationEventTypes,
    QnaPushNotification
} from "./qnaPushNotification";
import { MessageState, QnaMessage, QnaMessageType } from "./qnaMessage";
import { getContribLogger } from "@playkit-js-contrib/common";
import {
    KitchenSinkExpandModes,
    KitchenSinkManager,
    KitchenSinkPositions,
    ToastSeverity,
    ToastsManager
} from "@playkit-js-contrib/ui";
import { ToastIcon, ToastsType } from "./components/toast-icon";
import { h } from "preact";

export interface AnnouncementsAdapterOptions {
    kitchenSinkMessages: KitchenSinkMessages;
    qnaPushNotification: QnaPushNotification;
    kitchenSinkManager: KitchenSinkManager;
    toastsManager: ToastsManager;
    toastDuration: number;
}

const logger = getContribLogger({
    class: "AnnouncementsAdapter",
    module: "qna-plugin"
});

const NewReplyTimeDelay = 2000;

export class AnnouncementsAdapter {
    private _kitchenSinkMessages: KitchenSinkMessages;
    private _qnaPushNotification: QnaPushNotification;
    private _kitchenSinkManager: KitchenSinkManager;
    private _toastsManager: ToastsManager;
    private _toastDuration: number;

    private _initialize = false;

    constructor(options: AnnouncementsAdapterOptions) {
        this._kitchenSinkMessages = options.kitchenSinkMessages;
        this._qnaPushNotification = options.qnaPushNotification;
        this._kitchenSinkManager = options.kitchenSinkManager;
        this._toastsManager = options.toastsManager;
        this._toastDuration = options.toastDuration;
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
                if (qnaMessage.createdAt.getTime() >= new Date().getTime() - NewReplyTimeDelay) {
                    this._showAnnouncementToast();
                }
            }
        });
    };

    private _showAnnouncementToast() {
        if (
            this._kitchenSinkManager.getSidePanelMode(KitchenSinkPositions.Right) ===
            KitchenSinkExpandModes.Hidden
        ) {
            this._toastsManager.add({
                title: "Notifications",
                text: "New Announcement",
                icon: <ToastIcon type={ToastsType.ANNOUNCEMENT} />,
                duration: this._toastDuration,
                severity: ToastSeverity.INFO,
                onClick: () => {
                    this._kitchenSinkManager.expand(
                        KitchenSinkPositions.Right,
                        KitchenSinkExpandModes.OverTheVideo
                    );
                }
            });
        }
    }
}
