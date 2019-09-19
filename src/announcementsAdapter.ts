import { KitchenSinkMessages } from "./kitchenSinkMessages";
import {
    PublicQnaNotificationsEvent,
    PushNotificationEventTypes,
    QnaPushNotification
} from "./qnaPushNotification";
import { MessageState, QnaMessage, QnaMessageType } from "./qnaMessage";
import { getContribLogger } from "@playkit-js-contrib/common";

export interface AnnouncementsAdapterOptions {
    kitchenSinkMessages: KitchenSinkMessages;
    qnaPushNotification: QnaPushNotification;
    //todo [sa] toastsManager from contrib
}

const logger = getContribLogger({
    class: "AnnouncementsAdapter",
    module: "qna-plugin"
});

export class AnnouncementsAdapter {
    private _kitchenSinkMessages: KitchenSinkMessages;
    private _qnaPushNotification: QnaPushNotification;
    private _initialize = false;

    constructor(options: AnnouncementsAdapterOptions) {
        this._kitchenSinkMessages = options.kitchenSinkMessages;
        this._qnaPushNotification = options.qnaPushNotification;
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
            }
        });
    };
}
