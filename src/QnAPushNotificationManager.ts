import { getContribLogger } from "@playkit-js-contrib/common";
const uuidv1 = require("uuid/v1");

import {
    PushNotifications,
    PushNotificationsOptions,
    PrepareRegisterRequestConfig
} from "@playkit-js-contrib/push-notifications";
import { QnaMessage } from "./QnaMessage";
import { KalturaAnnotation } from "kaltura-typescript-client/api/types";

export enum PushNotificationEventsTypes {
    PublicNotifications = "PUBLIC_QNA_NOTIFICATIONS",
    UserNotifications = "USER_QNA_NOTIFICATIONS"
}

export interface Handler {
    uuid: string;
    handlerObj: PushNotificationHandler;
}

export interface PushNotificationHandler {
    type: PushNotificationEventsTypes;
    handleFunc: (qnaMessages: QnaMessage[]) => void;
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

    private _pushServerNotifications: PushNotifications | null = null;
    private _handlers: Handler[] = [];
    private _registeredToPushServer = false;

    private constructor(options: PushNotificationsOptions) {
        this._pushServerNotifications = PushNotifications.getInstance(options);
    }

    public static getInstance(options: PushNotificationsOptions) {
        if (!QnAPushNotificationManager._instance) {
            QnAPushNotificationManager._instance = new QnAPushNotificationManager(options);
        }
        return QnAPushNotificationManager._instance;
    }

    public registerToPushServer(entryId: string, userId: string | undefined) {
        if (this._registeredToPushServer) {
            logger.error("Multiple registration error", { method: "registerToPushServer" });
            throw new Error("Already register to push server");
        }

        logger.info("Registering for push notifications server", {
            method: "registerToPushServer"
        });

        // TODO [am] temp solutions for userId need to handle anonymous user id
        if (!this._pushServerNotifications) {
            return; // TODO [am] change state to error
        }
        // Announcement objects
        const publicQnaRequestConfig = this._registerPublicQnaNotification(entryId);
        // user related QnA objects
        const privateQnaRequestConfig = this._registerUserQnaNotification(entryId, userId);

        this._pushServerNotifications
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
                    logger.error("Registration for push notification error", {
                        method: "registerToPushServer",
                        data: err
                    });
                }
            );
    }

    /**
     * event handlers that will register after 'registerToPushServer'
     * will get only future push notifications (ont the initial bulk).
     * @param type
     * @param handlerObj
     * @return uuid - unique id for current handler
     */
    public addEventHandler(handlerObj: PushNotificationHandler): string {
        let uuid: string = uuidv1();
        this._handlers.push({ uuid, handlerObj });
        return uuid;
    }

    /**
     * remove event handler
     * @param uuid event unique id
     */
    public removeEventHandler(uuid: string) {
        let handlerIndex = this._handlers.findIndex((handlerObj: Handler) => {
            return handlerObj.uuid === uuid;
        });
        if (handlerIndex > -1) {
            this._handlers.splice(handlerIndex, 1);
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
                this._callRegisteredHandlers(
                    PushNotificationEventsTypes.PublicNotifications,
                    this._createQnaMessagesArray(response)
                );
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
                this._callRegisteredHandlers(
                    PushNotificationEventsTypes.UserNotifications,
                    this._createQnaMessagesArray(response)
                );
            }
        };
    }

    private _callRegisteredHandlers(type: PushNotificationEventsTypes, pushResponse: QnaMessage[]) {
        const handlers = this._handlers.filter((handler: Handler) => {
            return handler.handlerObj.type === type;
        });

        handlers.forEach((handler: Handler) => {
            handler.handlerObj.handleFunc(pushResponse);
        });
    }

    private _createQnaMessagesArray(pushResponse: any[]): QnaMessage[] {
        return pushResponse.reduce((qnaMessages: QnaMessage[], item: any) => {
            if (item.objectType === "KalturaAnnotation") {
                const kalturaAnnotation: KalturaAnnotation = new KalturaAnnotation();
                kalturaAnnotation.fromResponseObject(item);
                let qnaMessage = QnaMessage.create(kalturaAnnotation);
                if (qnaMessage) {
                    qnaMessages.push(qnaMessage);
                }
            }
            return qnaMessages;
        }, []);
    }
}
