import {
    PushNotifications,
    PushNotificationsOptions,
    PrepareRegisterRequestConfig,
    RegisterNotificationsParams
} from "@playkit-js-contrib/push-notifications";
import { log } from "@playkit-js-contrib/common";
import { QnaMessage } from "./QnaMessage";
import { KalturaAnnotation } from "kaltura-typescript-client/api/types";

export interface ThreadManagerParams {
    server: {
        ks: string;
        partnerId: number;
        serviceUrl: string;
    };
    player: any;
    eventManager: any;
}

export class ThreadManager {
    private _pushNotifications: PushNotifications | null = null;
    private logger = this._getLogger("QnaPlugin");
    private _qnaMessages: QnaMessage[] = [];

    constructor(config: ThreadManagerParams) {
        let pushNotificationsOptions: PushNotificationsOptions = {
            ks: config.server.ks,
            serviceUrl: config.server.serviceUrl,
            clientTag: "QnaPlugin_V7", // todo: Is this the clientTag we want
            playerAPI: {
                kalturaPlayer: config.player,
                eventManager: config.eventManager
            }
        };

        // Todo: should use plugin instance
        this._pushNotifications = PushNotifications.getInstance(pushNotificationsOptions);
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

    public registerToQnaPushNotificationEvents() {
        this.logger("log", "registerToQnaPushNotificationEvents");

        if (!this._pushNotifications) {
            // TODO change state to error
            return;
        }

        const entryId = "1_s8s12id6"; // this.getEntryId()  // todo wrong config.entryId
        const userId = "Shimi"; // this.getUserName() // todo

        let codeQnaRequestConfig: PrepareRegisterRequestConfig = {
            eventName: "CODE_QNA_NOTIFICATIONS",
            eventParams: {
                entryId: entryId
            },
            onMessage: (cuePoints: KalturaAnnotation[]) => {}
        };

        let publicQnaRequestConfig: PrepareRegisterRequestConfig = {
            eventName: "PUBLIC_QNA_NOTIFICATIONS",
            eventParams: {
                entryId: entryId
            },
            onMessage: (cuePoints: KalturaAnnotation[]) => {}
        };

        let privateQnaRequestConfig: PrepareRegisterRequestConfig = {
            eventName: "USER_QNA_NOTIFICATIONS",
            eventParams: {
                entryId: entryId,
                userId: userId
            },
            onMessage: (cuePoints: KalturaAnnotation[]) => {
                this._processMessages(cuePoints);
            }
        };

        let registerNotifications: RegisterNotificationsParams = {
            prepareRegisterRequestConfigs: [
                codeQnaRequestConfig,
                publicQnaRequestConfig,
                privateQnaRequestConfig
            ],
            onSocketReconnect: () => {}
        };

        this._pushNotifications.registerNotifications(registerNotifications).then(
            () => {
                // todo
            },
            (err: any) => {
                // todo
            }
        );
    }

    private _processMessages(cuePoints: KalturaAnnotation[]): void {
        cuePoints.forEach((cuePoint: KalturaAnnotation) => {
            let newMessage: QnaMessage = new QnaMessage(cuePoint);

            if (newMessage.isMasterQuestion()) {
                this._processMasterQuestion(newMessage);
                return;
            }

            this._processReply(newMessage);
        });
    }

    /**
     * Add Or Override old master question
     * @param newMessage
     * @private
     */
    private _processMasterQuestion(newMessage: QnaMessage): void {
        let indexOfQuestion = this._qnaMessages.findIndex(qnaMessage => {
            return qnaMessage.id === newMessage.id;
        });

        if (indexOfQuestion === -1) {
            this._qnaMessages.push(newMessage);
            return;
        }

        newMessage.replies = this._qnaMessages[indexOfQuestion].replies;
        this._qnaMessages.splice(indexOfQuestion, 1, newMessage); // override to the new element
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
            this.logger(
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
