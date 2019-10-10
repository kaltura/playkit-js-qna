import { KitchenSinkMessages } from "./kitchenSinkMessages";
import {
    PublicQnaNotificationsEvent,
    PushNotificationEventTypes,
    QnaPushNotification
} from "./qnaPushNotification";
import { MessageState, QnaMessage, QnaMessageType } from "./qnaMessageFactory";
import { getContribLogger } from "@playkit-js-contrib/common";
import { ToastItemData, ToastSeverity } from "@playkit-js-contrib/ui";
import { ToastIcon, ToastsType } from "./components/toast-icon";
import { h } from "preact";
import { Utils } from "./utils";

export interface AnnouncementsAdapterOptions {
    kitchenSinkMessages: KitchenSinkMessages;
    qnaPushNotification: QnaPushNotification;
    isKitchenSinkActive: () => boolean;
    displayToast: ({ text, icon, severity }: Partial<ToastItemData>) => void;
}

const logger = getContribLogger({
    class: "AnnouncementsAdapter",
    module: "qna-plugin"
});

export class AnnouncementsAdapter {
    private _kitchenSinkMessages: KitchenSinkMessages;
    private _qnaPushNotification: QnaPushNotification;
    private _isKitchenSinkActive: () => boolean;
    private _displayToast: ({ text, icon, severity }: Partial<ToastItemData>) => void;

    private _initialize = false;

    constructor(options: AnnouncementsAdapterOptions) {
        this._kitchenSinkMessages = options.kitchenSinkMessages;
        this._qnaPushNotification = options.qnaPushNotification;
        this._isKitchenSinkActive = options.isKitchenSinkActive;
        this._displayToast = options.displayToast;
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
                    this._showAnnouncementToast();
                }
            }
        });
    };

    private _showAnnouncementToast() {
        if (!this._isKitchenSinkActive()) {
            this._displayToast({
                text: "New Announcement",
                icon: <ToastIcon type={ToastsType.Announcement} />,
                severity: ToastSeverity.Info
            });
        }
    }
}
