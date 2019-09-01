import { EventManager, getContribLogger } from "@playkit-js-contrib/common";
import { QnaMessage, QnaMessageType } from "./QnaMessage";
import { KalturaAnnotation } from "kaltura-typescript-client/api/types/KalturaAnnotation";
import { PushNotificationEvents, QnAPushNotificationManager } from "./QnAPushNotificationManager";
import { Utils } from "./utils";

const logger = getContribLogger({
    class: "ThreadManager",
    module: "qna-plugin"
});

export class ThreadManager {
    private _qnaMessages: QnaMessage[] = [];
    private _messageEventManager: EventManager = new EventManager();
    //holds tuples of eventUUID and eventType for easy removal from our QNAPushNotificaitonManager
    private _eventHandlersUUIds: [string, PushNotificationEvents][] = [];

    public get messageEventManager(): EventManager {
        return this._messageEventManager;
    }

    public init(qnaPushManger: QnAPushNotificationManager): void {
        this._addPushNotificationEventHandlers(qnaPushManger);
    }

    public destroy(qnaPushManger: QnAPushNotificationManager | null): void {
        this._qnaMessages = [];
        if (qnaPushManger) {
            this._removePushNotificationEventHandlers(qnaPushManger);
        }
    }

    private _addPushNotificationEventHandlers(qnaPushManger: QnAPushNotificationManager): void {
        this._eventHandlersUUIds.push([
            qnaPushManger.addEventHandler(
                PushNotificationEvents.UserNotifications,
                this._processResponse.bind(this)
            ),
            PushNotificationEvents.UserNotifications
        ]);
    }

    private _removePushNotificationEventHandlers(qnaPushManger: QnAPushNotificationManager): void {
        this._eventHandlersUUIds.forEach(eventTuple => {
            qnaPushManger.removeEventHandler(...eventTuple);
        });
    }

    private _processResponse(response: any): void {
        response
            .reduce(Utils.getkalturaAnnotationReducer(logger), [])
            .forEach((cuePoint: KalturaAnnotation) => {
                let newMessage: QnaMessage | null = QnaMessage.create(cuePoint);

                this.processQnaMessage(newMessage);
            });

        if (this._messageEventManager) {
            this._messageEventManager.emit("OnQnaMessage", this._qnaMessages);
        }
    }

    private processQnaMessage(newMessage: QnaMessage | null) {
        if (!newMessage) {
            logger.warn(
                "No newMessage to process - Create QnaMessage from cuePoint return nothing",
                {
                    method: "processQnaMessage",
                    data: {}
                }
            );
            return;
        }

        if (newMessage.isMasterQuestion()) {
            this._processMasterQuestion(newMessage);
        } else {
            this._processReply(newMessage);
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

    private sortMasterQuestions(): void {
        this._qnaMessages.sort((a: QnaMessage, b: QnaMessage) => {
            return this.threadTimeCompare(a) - this.threadTimeCompare(b);
        });
    }

    public addPendingCuePointToThread(cuePoint: KalturaAnnotation): void {
        let newMessage: QnaMessage | null = QnaMessage.createPendingMessage(cuePoint);
        this.processQnaMessage(newMessage);

        if (this._messageEventManager) {
            this._messageEventManager.emit("OnQnaMessage", this._qnaMessages);
        }
    }

    /**
     * Take the time of the newest QnaMessage
     */
    public threadTimeCompare(qnaMessage: QnaMessage): number {
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
