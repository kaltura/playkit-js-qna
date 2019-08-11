import { getContribLogger } from "@playkit-js-contrib/common";

import {
    PushNotifications,
    PushNotificationsOptions,
    PrepareRegisterRequestConfig
} from "@playkit-js-contrib/push-notifications";

export enum PushNotificationEvents {
    PublicNotifications = "PUBLIC_QNA_NOTIFICATIONS",
    UserNotifications = "USER_QNA_NOTIFICATIONS"
}

export interface pushNotificationHandler {
    (pushResponse: any[]): void;
}

const logger = getContribLogger({
    class: "QnAPushNotificationManager",
    module: "qna-plugin"
});

/**
 * handles push notification registration and results.
 */
export class QnAPushNotificationManager {
    private _pushNotifications: PushNotifications | null = null;
    private _notificationsHandlers: Map<
        PushNotificationEvents,
        Array<pushNotificationHandler>
    > = new Map<PushNotificationEvents, Array<pushNotificationHandler>>();

    constructor(options: PushNotificationsOptions) {
        this._pushNotifications = PushNotifications.getInstance(options);
    }

    public unregisterPushNotification() {
        logger.info("Unregister push notification", { method: "unregister" });

        if (this._pushNotifications) this._pushNotifications.reset();
    }

    public registerPushNotification(entryId: string, userId: string | undefined) {
        // TODO [am] temp solutions for userId need to handle anonymous user id
        if (!this._pushNotifications) {
            return; // TODO [am] change state to error
        }
        // Announcement objects
        const publicQnaRequestConfig = this._registerPublicQnaNotification(entryId);
        // user related QnA objects
        const privateQnaRequestConfig = this._registerUserQnaNotification(entryId, userId);

        this._pushNotifications
            .registerNotifications({
                prepareRegisterRequestConfigs: [publicQnaRequestConfig, privateQnaRequestConfig],
                onSocketReconnect: () => {}
            })
            .then(
                () => {}, // todo [am]
                (err: any) => {
                    // todo [am] Something bad happen (push server or more are down)
                    // if (this._messageEventManager) {
                    //     this._messageEventManager.emit("OnQnaError");
                    // }
                }
            );
    }

    public registerEventHandler(
        event: PushNotificationEvents,
        handler: pushNotificationHandler
    ): void {
        if (!this._notificationsHandlers.has(event)) {
            this._notificationsHandlers.set(event, []);
        }
        this._notificationsHandlers.get(event)!.push(handler);
    }

    private _registerPublicQnaNotification(entryId: string): PrepareRegisterRequestConfig {
        logger.info("Register public QnA notification", {
            method: "_registerPublicQnaNotification",
            data: { entryId }
        });

        return {
            eventName: "PUBLIC_QNA_NOTIFICATIONS",
            eventParams: {
                entryId: entryId
            },
            onMessage: (response: any[]) => {}
        };
    }

    private _registerUserQnaNotification(
        entryId: string,
        userId: string | undefined
    ): PrepareRegisterRequestConfig {
        // TODO [am] temp solutions for userId need to handle anonymous user id
        logger.info("Register User QnA notification", {
            method: "_registerUserQnaNotification",
            data: { entryId, userId }
        });

        return {
            eventName: "USER_QNA_NOTIFICATIONS",
            eventParams: {
                entryId: entryId,
                userId: userId // TODO [am] temp solutions for userId need to handle anonymous user id
            },
            onMessage: (response: any[]) => {
                this._callRegisteredHandlers(PushNotificationEvents.UserNotifications, response);
            }
        };
    }

    private _callRegisteredHandlers(event: PushNotificationEvents, pushResponse: any[]) {
        const handlers = this._notificationsHandlers.get(event) || [];
        handlers.forEach((handler: pushNotificationHandler) => {
            handler(pushResponse);
        });
    }
}
