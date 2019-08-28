import { getContribLogger } from "@playkit-js-contrib/common";
const uuidv1 = require("uuid/v1");

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
    private static _instance: QnAPushNotificationManager | null = null;

    private _pushNotifications: PushNotifications | null = null;
    private _notificationsHandlers: Map<
        PushNotificationEvents,
        Array<[string, pushNotificationHandler]>
    > = new Map<PushNotificationEvents, Array<[string, pushNotificationHandler]>>();
    private _registeredToPushServer = false;

    private constructor(options: PushNotificationsOptions) {
        this._pushNotifications = PushNotifications.getInstance(options);
    }

    public static getInstance(options: PushNotificationsOptions) {
        if (!QnAPushNotificationManager._instance) {
            QnAPushNotificationManager._instance = new QnAPushNotificationManager(options);
        }
        return QnAPushNotificationManager._instance;
    }

    public destroyPushServerRegistration() {
        logger.info("Unregister push notification", { method: "destroyPushServerRegistration" });
        if (this._pushNotifications) {
            this._pushNotifications.reset();
            this._registeredToPushServer = false;
        }
    }

    public registerToPushServer(entryId: string, userId: string | undefined) {
        if (this._registeredToPushServer) {
            logger.error("Multiple registration error", { method: "registerToPushServer" });
            throw new Error("Already register to push server");
        }

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
                () => {
                    this._registeredToPushServer = true;
                },
                (err: any) => {
                    // todo [am] Something bad happen (push server or more are down)
                    // if (this._messageEventManager) {
                    //     this._messageEventManager.emit("OnQnaError");
                    // }
                }
            );
    }

    /**
     * event handlers that will register after 'registerToPushServer'
     * will get only future push notifications (ont the initial bulk).
     * @param event
     * @param handler
     * @return uuid - unique id for current handler
     */
    public addEventHandler(
        event: PushNotificationEvents,
        handler: pushNotificationHandler
    ): string {
        let uuid: string = uuidv1();
        if (!this._notificationsHandlers.has(event)) {
            this._notificationsHandlers.set(event, []);
        }
        let notificationsGroup = this._notificationsHandlers.get(event);
        if (notificationsGroup) {
            notificationsGroup.push([uuid, handler]);
        }
        return uuid;
    }

    /**
     * remove event handler
     * @param event event type
     * @param uuid event unique id
     */
    public removeEventHandler(uuid: string, event: PushNotificationEvents) {
        let eventHandlersTuples = this._notificationsHandlers.get(event);
        if (eventHandlersTuples) {
            let handlerIndex = eventHandlersTuples.findIndex(
                (handlerTuple: [string, pushNotificationHandler]) => {
                    return uuid === handlerTuple[0];
                }
            );
            if (handlerIndex > -1) {
                eventHandlersTuples.splice(handlerIndex, 1);
            }
        }
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
            onMessage: (response: any[]) => {
                this._callRegisteredHandlers(PushNotificationEvents.PublicNotifications, response);
            }
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
        const handlersTuples = this._notificationsHandlers.get(event) || [];
        handlersTuples.forEach((handlerTuple: [string, pushNotificationHandler]) => {
            let handler = handlerTuple[1];
            handler(pushResponse);
        });
    }
}
