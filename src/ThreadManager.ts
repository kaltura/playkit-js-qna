import { EventsManager, getContribLogger } from "@playkit-js-contrib/common";
import { QnaMessage, QnaMessageType } from "./QnaMessage";
import { KalturaAnnotation } from "kaltura-typescript-client/api/types/KalturaAnnotation";
import {
    PublicQnaNotificationsEvent,
    PushNotificationEventTypes,
    QnAPushNotificationManager,
    UserQnaNotificationsEvent
} from "./QnAPushNotificationManager";

const logger = getContribLogger({
    class: "ThreadManager",
    module: "qna-plugin"
});

export enum ThreadManagerEventTypes {
    MessagesUpdatedEvent = "MessagesUpdatedEvent"
}

export interface MessagesUpdatedEvent {
    type: ThreadManagerEventTypes.MessagesUpdatedEvent;
    messages: QnaMessage[];
}

export class ThreadManager {
    private _initialized = false;
    private _qnaMessages: QnaMessage[] = [];
    private _events: EventsManager<MessagesUpdatedEvent> = new EventsManager<
        MessagesUpdatedEvent
    >();

    on: EventsManager<MessagesUpdatedEvent>["on"] = this._events.on.bind(this._events);
    off: EventsManager<MessagesUpdatedEvent>["off"] = this._events.off.bind(this._events);

    /**
     * should be called once on pluginSetup
     * @param qnaPushManger
     */
    public init(qnaPushManger: QnAPushNotificationManager): void {
        if (this._initialized) {
            logger.warn("ThreadManager was already initialized", {
                method: "init"
            });
            return;
        }
        this._initialized = true;
        qnaPushManger.on(PushNotificationEventTypes.UserNotifications, this._processResponse);
        qnaPushManger.on(PushNotificationEventTypes.PublicNotifications, this._processResponse);
    }

    /**
     * should be called on each media unload
     */
    public reset(): void {
        this._qnaMessages = [];
    }

    /**
     * should be called on pluginDestroy
     * @param qnaPushManger
     */
    public destroy(qnaPushManger: QnAPushNotificationManager | null): void {
        this.reset();
        if (qnaPushManger) {
            qnaPushManger.off(PushNotificationEventTypes.UserNotifications, this._processResponse);
            qnaPushManger.off(
                PushNotificationEventTypes.PublicNotifications,
                this._processResponse
            );
        }
    }

    private _processResponse = ({
        qnaMessages
    }: UserQnaNotificationsEvent | PublicQnaNotificationsEvent): void => {
        qnaMessages.forEach((qnaMessage: QnaMessage) => {
            this.processQnaMessage(qnaMessage);
        });

        this._events.emit({
            type: ThreadManagerEventTypes.MessagesUpdatedEvent,
            messages: this._qnaMessages
        });
    };

    private processQnaMessage(newMessage: QnaMessage) {
        if (newMessage.type === QnaMessageType.Announcement) {
            this._processAnnouncement(newMessage);
        } else if (newMessage.type === QnaMessageType.AnswerOnAir) {
            //todo [sa] impl. in different ticket
        } else if (newMessage.isMasterQuestion()) {
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

    private _processAnnouncement(newMessage: QnaMessage): void {
        let existingIndex = this._qnaMessages.findIndex(qnaMessage => {
            return qnaMessage.id === newMessage.id;
        });

        if (existingIndex === -1) {
            this._qnaMessages.push(newMessage);
        } else if (newMessage.tags.indexOf("Annotation_Deleted") > -1) {
            this._qnaMessages.splice(existingIndex, 1);
        }

        // todo throttling to this sort
        this.sortMasterQuestions();
    }

    private sortMasterQuestions(): void {
        this._qnaMessages.sort((a: QnaMessage, b: QnaMessage) => {
            return this.threadTimeCompare(a) - this.threadTimeCompare(b);
        });
    }

    public addPendingCuePointToThread(cuePoint: KalturaAnnotation, threadId?: string): void {
        let newMessage: QnaMessage | null = QnaMessage.createPendingMessage(cuePoint);
        if (threadId) {
            newMessage.parentId = threadId;
        }
        this.processQnaMessage(newMessage);

        this._events.emit({
            type: ThreadManagerEventTypes.MessagesUpdatedEvent,
            messages: this._qnaMessages
        });
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
