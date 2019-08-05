import {
    PushNotifications,
    PushNotificationsOptions,
    PrepareRegisterRequestConfig,
    RegisterNotificationsParams
} from "@playkit-js-contrib/push-notifications";
import { EventManager } from "@playkit-js-contrib/common";
import { QnaMessage, QnaMessageType } from "./QnaMessage";
import { KalturaAnnotation } from "kaltura-typescript-client/api/types";
import { getContribLogger } from "@playkit-js-contrib/common";
export interface ThreadManagerParams {
    ks: string;
    serviceUrl: string;
    playerAPI: {
        player: any;
        eventManager: any;
    };
}

const logger = getContribLogger({
    class: "ThreadManager",
    module: "qna-plugin"
});

export class ThreadManager {
    private _pushNotifications: PushNotifications | null = null;
    private _qnaMessages: QnaMessage[] = [];
    private _messageEventManager: EventManager = new EventManager();

    public get messageEventManager(): EventManager {
        return this._messageEventManager;
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
    }

    public unregister() {
        if (this._pushNotifications) {
            this._pushNotifications.reset();
        }

        this._qnaMessages = [];
    }

    public register(entryId: string, userId: string) {
        logger.info("register to entry message", {
            method: "register",
            data: {
                entryId
            }
        });

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
                    // Something bad happen (push server or more are down)
                    if (this._messageEventManager) {
                        this._messageEventManager.emit("OnQnaError");
                    }
                }
            );
    }

    private _processMessages(response: any): void {
        response
            .reduce((filtered: KalturaAnnotation[], res: any) => {
                if (res.objectType !== "KalturaAnnotation") {
                    logger.warn(
                        "invalid message type, message cuePoint should be of type: KalturaAnnotation",
                        {
                            method: "_processMessages",
                            data: {}
                        }
                    );
                } else {
                    // Transform the result into KalturaAnnotation object
                    const result: KalturaAnnotation = new KalturaAnnotation();
                    result.fromResponseObject(res);
                    filtered.push(result);
                }

                return filtered;
            }, [])
            .forEach((cuePoint: KalturaAnnotation) => {
                let newMessage: QnaMessage | null = QnaMessage.create(cuePoint);

                if (!newMessage) {
                    // todo we can indicate a small error Just on this render qnaMessage
                    return;
                }

                if (newMessage.isMasterQuestion()) {
                    this._processMasterQuestion(newMessage);
                    return;
                }

                this._processReply(newMessage);
            });

        if (this._messageEventManager) {
            this._messageEventManager.emit("OnQnaMessage", this._qnaMessages);
        }
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
        } else {
            newMessage.replies = this._qnaMessages[indexOfMasterQuestion].replies;
            this._qnaMessages.splice(indexOfMasterQuestion, 1, newMessage); // override to the new element
        }

        // todo throttling to this sort
        this.sortMasterQuestions();
    }

    private sortMasterQuestions() {
        this._qnaMessages.sort((a: QnaMessage, b: QnaMessage) => {
            return this.threadTimeCompare(a) - this.threadTimeCompare(b);
        });
    }

    /**
     * Take the time of the newest QnaMessage
     */
    threadTimeCompare(qnaMessage: QnaMessage): number {
        if (qnaMessage.type === QnaMessageType.Announcement) {
            return qnaMessage.time.valueOf();
        }

        let q_time, a_time;

        if (qnaMessage.type === QnaMessageType.Answer) {
            a_time = qnaMessage.time.valueOf();
        }

        if (qnaMessage.type === QnaMessageType.Question) {
            q_time = qnaMessage.time.valueOf();
        }

        for (let i = 0; i < qnaMessage.replies.length; ++i) {
            let reply: QnaMessage = qnaMessage.replies[i];
            if (reply.type === QnaMessageType.Announcement) {
                if (!a_time) a_time = reply.time.valueOf();
                else if (reply.time.valueOf() > a_time) a_time = reply.time.valueOf();
            }
        }

        if (!a_time && !q_time) {
            // todo log("both a_time and q_time are undefined - data error");
            return 0;
        }

        if (!a_time) {
            return q_time || 0;
        }

        if (!q_time) {
            return a_time || 0;
        }

        return Math.max(a_time, q_time);
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
            logger.warn("Dropping reply as there is no matching (master) question", {
                method: "_processReply",
                data: {
                    newMessage
                }
            });
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

        // todo throttling to this sort
        this._sortReplies(replies);
    }

    private _sortReplies(replies: QnaMessage[]) {
        replies.sort((a: QnaMessage, b: QnaMessage) => {
            return a.time.valueOf() - b.time.valueOf();
        });
    }
}
