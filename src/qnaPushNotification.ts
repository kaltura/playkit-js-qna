import { EventsManager, getContribLogger } from "@playkit-js-contrib/common";

import {
    PrepareRegisterRequestConfig,
    PushNotifications,
    PushNotificationsOptions
} from "@playkit-js-contrib/push-notifications";
import { QnaMessage, QnaMessageFactory } from "./qnaMessageFactory";
import { KalturaAnnotation } from "kaltura-typescript-client/api/types/KalturaAnnotation";

export enum PushNotificationEventTypes {
    PublicNotifications = "PUBLIC_QNA_NOTIFICATIONS",
    UserNotifications = "USER_QNA_NOTIFICATIONS",
    PushNotificationsError = "PUSH_NOTIFICATIONS_ERROR"
}

export interface UserQnaNotificationsEvent {
    type: PushNotificationEventTypes.UserNotifications;
    qnaMessages: QnaMessage[];
}

export interface PublicQnaNotificationsEvent {
    type: PushNotificationEventTypes.PublicNotifications;
    qnaMessages: QnaMessage[];
}

export interface QnaNotificationsErrorEvent {
    type: PushNotificationEventTypes.PushNotificationsError;
    error: string;
}

type Events = UserQnaNotificationsEvent | PublicQnaNotificationsEvent | QnaNotificationsErrorEvent;

const logger = getContribLogger({
    class: "qnaPushNotification",
    module: "qna-plugin"
});

/**
 * handles push notification registration and results.
 */
export class QnaPushNotification {
    private _pushServerInstance: PushNotifications | null = null;

    private _registeredToQnaMessages = false;

    private _events: EventsManager<Events> = new EventsManager<Events>();

    private _initialized = false;

    on: EventsManager<Events>["on"] = this._events.on.bind(this._events);
    off: EventsManager<Events>["off"] = this._events.off.bind(this._events);

    public init(pushServerOptions: PushNotificationsOptions) {
        if (this._initialized) return;

        this._initialized = true;
        this._pushServerInstance = PushNotifications.getInstance(pushServerOptions);
    }

    /**
     * should be called on mediaUnload
     */
    public reset() {
        //todo [sa] once implemented - unregister from current entryId / userId push-notifications on mediaUnload
        this._registeredToQnaMessages = false;
    }

    /**
     * should be called on pluginDestroy
     */
    public destroy() {
        //todo [sa] once implemented better - add destroy method to kill push-server etc...
    }

    /**
     * registering push server notifications for retrieving user/public qna messages for current entry id and userId
     * note: should be registered on mediaLoad to get relevant notification data.
     * @param entryId
     * @param userId
     */
    public registerToPushServer(entryId: string, userId: string) {
        if (this._registeredToQnaMessages) {
            logger.error("Multiple registration error", { method: "registerToPushServer" });
            throw new Error("Already register to push server");
        }

        logger.info("Registering for push notifications server", {
            method: "registerToPushServer",
            data: { entryId, userId }
        });

        // TODO [am] temp solutions for userId need to handle anonymous user id
        if (!this._pushServerInstance) {
            return; // TODO [am] change state to error
        }
        // Announcement objects
        const publicQnaRequestConfig = this._createPublicQnaRegistration(entryId);
        // user related QnA objects
        const privateQnaRequestConfig = this._createUserQnaRegistration(entryId, userId);

        this._pushServerInstance
            .registerNotifications({
                prepareRegisterRequestConfigs: [publicQnaRequestConfig, privateQnaRequestConfig],
                onSocketReconnect: () => {}
            })
            .then(
                () => {
                    logger.info("Registered push notification service", {
                        method: "registerToPushServer"
                    });
                    this._registeredToQnaMessages = true;
                },
                (err: any) => {
                    logger.error("Registration for push notification error", {
                        method: "registerToPushServer",
                        data: err
                    });
                    this._events.emit({
                        type: PushNotificationEventTypes.PushNotificationsError,
                        error: err
                    });
                }
            );
    }

    private _createPublicQnaRegistration(entryId: string): PrepareRegisterRequestConfig {
        logger.info("Register public QnA notification", {
            method: "_createPublicQnaRegistration",
            data: { entryId }
        });
        return {
            eventName: PushNotificationEventTypes.PublicNotifications,
            eventParams: {
                entryId: entryId
            },
            onMessage: (response: any[]) => {
                this._events.emit({
                    type: PushNotificationEventTypes.PublicNotifications,
                    qnaMessages: this._createQnaMessagesArray(response)
                });
            }
        };
    }

    private _createUserQnaRegistration(
        entryId: string,
        userId: string
    ): PrepareRegisterRequestConfig {
        // TODO [am] temp solutions for userId need to handle anonymous user id
        logger.info("Register User QnA notification", {
            method: "_createUserQnaRegistration",
            data: { entryId, userId }
        });
        return {
            eventName: PushNotificationEventTypes.UserNotifications,
            eventParams: {
                entryId: entryId,
                userId: userId // TODO [am] temp solutions for userId need to handle anonymous user id
            },
            onMessage: (response: any[]) => {
                this._events.emit({
                    type: PushNotificationEventTypes.UserNotifications,
                    qnaMessages: this._createQnaMessagesArray(response)
                });
            }
        };
    }

    private _createQnaMessagesArray(pushResponse: any[]): QnaMessage[] {
        return pushResponse.reduce((qnaMessages: QnaMessage[], item: any) => {
            if (item.objectType === "KalturaAnnotation") {
                const kalturaAnnotation: KalturaAnnotation = new KalturaAnnotation();
                kalturaAnnotation.fromResponseObject(item);
                let qnaMessage = QnaMessageFactory.create(kalturaAnnotation);
                if (qnaMessage) {
                    qnaMessages.push(qnaMessage);
                }
            }
            return qnaMessages;
        }, []);
    }
}
