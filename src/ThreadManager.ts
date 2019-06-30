import {
    PushNotifications,
    PushNotificationsOptions,
    PrepareRegisterRequestConfig,
    RegisterNotificationsParams
} from "@playkit-js-contrib/push-notifications";
import { EventManager, log } from "@playkit-js-contrib/common";
import { QnaMessage } from "./QnaMessage";
import { KalturaAnnotation } from "kaltura-typescript-client/api/types";

export interface ThreadManagerParams {
    ks: string;
    serviceUrl: string;
    playerAPI: {
        player: any;
        eventManager: any;
    };
    messageEventManager: EventManager;
}

export class ThreadManager {
    private _pushNotifications: PushNotifications | null = null;
    private _qnaMessages: QnaMessage[] = [];
    private _logger = this._getLogger("QnaPlugin");
    private _messageEventManager: EventManager | null;

    public get messages(): QnaMessage[] {
        return this._qnaMessages;
    }

    constructor(config: ThreadManagerParams) {
        let pushNotificationsOptions: PushNotificationsOptions = {
            ks: config.ks,
            serviceUrl: config.serviceUrl,
            clientTag: "QnaPlugin_V7", // todo: Is this the clientTag we want
            playerAPI: {
                kalturaPlayer: config.playerAPI.player,
                eventManager: config.playerAPI.eventManager
            }
        };

        // Todo: should use plugin instance
        this._pushNotifications = PushNotifications.getInstance(pushNotificationsOptions);

        this._messageEventManager = config.messageEventManager;
    }

    private _getLogger(context: string): Function {
        return (level: "debug" | "log" | "warn" | "error", message: string, ...args: any[]) => {
            log(level, context, message, ...args);
        };
    }

    public unregister() {
        if (this._pushNotifications) {
            this._pushNotifications.reset();
        }

        this._qnaMessages = [];
    }

    public register(entryId: string, userId: string) {
        this._logger("log", "registerToQnaPushNotificationEvents");

        if (!this._pushNotifications) {
            // TODO change state to error
            return;
        }

        let publicQnaRequestConfig: PrepareRegisterRequestConfig = {
            eventName: "PUBLIC_QNA_NOTIFICATIONS",
            eventParams: {
                entryId: entryId
            },
            onMessage: (response: any[]) => {}
        };

        let privateQnaRequestConfig: PrepareRegisterRequestConfig = {
            eventName: "USER_QNA_NOTIFICATIONS",
            eventParams: {
                entryId: entryId,
                userId: userId
            },
            onMessage: (response: any[]) => {
                this._processMessages(response);
                if (this._messageEventManager) {
                    this._messageEventManager.emit("OnPrivateMessage", this._qnaMessages);
                }
            }
        };

        this._pushNotifications
            .registerNotifications({
                prepareRegisterRequestConfigs: [publicQnaRequestConfig, privateQnaRequestConfig],
                onSocketReconnect: () => {}
            })
            .then(
                () => {
                    // todo
                },
                (err: any) => {
                    // todo
                }
            );
    }

    private _processMessages(response: any): void {
        // convert to KalturaAnnotation[] Typescript object
        let cuePoints: KalturaAnnotation[] = response.map((res: any) => {
            const result = new KalturaAnnotation();
            result.fromResponseObject(res);
            return result;
        });

        // parse data
        cuePoints.forEach((cuePoint: KalturaAnnotation) => {
            let newMessage: QnaMessage = new QnaMessage(cuePoint);

            if (newMessage.isMasterQuestion()) {
                this._processMasterQuestion(newMessage);
                return;
            }

            this._processReply(newMessage);
        });

        this._qnaMessages.sort((a: QnaMessage, b: QnaMessage) => {
            return b.timeCompareFunction() - a.timeCompareFunction();
        });
    }

    /**
     * Add Or Override old master question
     * @param newMessage
     * @private
     */
    private _processMasterQuestion(newMessage: QnaMessage): void {
        let indexOfMasterQuestion = this._qnaMessages.findIndex(qnaMessage => {
            return qnaMessage.id === newMessage.id;
        });

        if (indexOfMasterQuestion === -1) {
            this._qnaMessages.push(newMessage);
            return;
        }

        newMessage.replies = this._qnaMessages[indexOfMasterQuestion].replies;
        this._qnaMessages.splice(indexOfMasterQuestion, 1, newMessage); // override to the new element
    }

    /**
     * Add Or Override old reply answer
     * @param newMessage
     * @private
     */
    private _processReply(newMessage: QnaMessage): void {
        if (newMessage.isMasterQuestion()) {
            return;
        }

        // try to find if the new message is a replay for some master question
        let indexOfMaterQuestion = this._qnaMessages.findIndex(qnaMessage => {
            return qnaMessage.id === newMessage.parentId;
        });

        if (indexOfMaterQuestion === -1) {
            this._logger(
                "warn",
                "Dropping reply as there is no matching (master) question",
                newMessage
            );
            return;
        }

        // find the old replay and switch old reply with new reply
        let replies = this._qnaMessages[indexOfMaterQuestion].replies;
        let indexOfReplay = replies.findIndex(qnaMessage => {
            return qnaMessage.id === newMessage.id;
        });

        if (indexOfReplay === -1) {
            replies.push(newMessage);
        }

        replies.splice(indexOfReplay, 1, newMessage); // override to the new element
    }
}
