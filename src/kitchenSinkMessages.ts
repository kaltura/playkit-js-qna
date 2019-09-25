import { QnaMessage } from "./qnaMessageFactory";
import { Utils } from "./utils";
import { EventsManager, getContribLogger } from "@playkit-js-contrib/common";
import { KitchenSinkManager } from "@playkit-js-contrib/ui";

export enum KitchenSinkEventTypes {
    MessagesUpdatedEvent = "MessagesUpdatedEvent"
}

export interface MessagesUpdatedEvent {
    type: KitchenSinkEventTypes.MessagesUpdatedEvent;
    messages: QnaMessage[];
}

export interface KitchenSinkMessagesOptions {
    kitchenSinkManager: KitchenSinkManager;
}

const logger = getContribLogger({
    class: "KitchenSinkMessagesManager",
    module: "qna-plugin"
});

export class KitchenSinkMessages {
    private _kitchenSinkManager: KitchenSinkManager;

    //should it contain the contrib component ?
    private _qnaMessages: QnaMessage[] = [];
    private _events: EventsManager<MessagesUpdatedEvent> = new EventsManager<
        MessagesUpdatedEvent
    >();

    on: EventsManager<MessagesUpdatedEvent>["on"] = this._events.on.bind(this._events);
    off: EventsManager<MessagesUpdatedEvent>["off"] = this._events.off.bind(this._events);

    constructor(options: KitchenSinkMessagesOptions) {
        this._kitchenSinkManager = options.kitchenSinkManager;
    }

    public reset(): void {
        this._qnaMessages = [];
    }

    public destroy(): void {
        this.reset();
    }

    public add(newMessage: QnaMessage, options?: { disableUpdateEvent?: boolean }): void {
        // if there is pending message in _qnaMessages delete it
        if (newMessage.pendingMessageId) {
            let pendingMessageIndex = this._qnaMessages.findIndex(qnaMessage => {
                return qnaMessage.id === newMessage.pendingMessageId;
            });

            if (pendingMessageIndex !== -1) {
                this._qnaMessages.splice(pendingMessageIndex, 1); // delete if pending message was found
            }
        }

        // Add new message if doesn't exits
        let existingIndex = this._qnaMessages.findIndex(qnaMessage => {
            return qnaMessage.id === newMessage.id;
        });

        if (existingIndex === -1) {
            this._qnaMessages.push(newMessage);
        }

        this._sortMessages();

        if (!options || !options.disableUpdateEvent) {
            this.triggerUpdateUIEvent();
        }
    }

    public deleteMessage(messageId: string, disableUpdateEvent?: boolean) {
        let existingIndex = this._qnaMessages.findIndex(qnaMessage => {
            return qnaMessage.id === messageId;
        });
        if (existingIndex > -1) {
            this._qnaMessages.splice(existingIndex, 1);
        }
        this._sortMessages();

        if (!disableUpdateEvent) {
            this.triggerUpdateUIEvent();
        }
    }

    public addReply(
        parentId: string,
        reply: QnaMessage,
        options?: { disableUpdateEvent?: boolean }
    ): void {
        // find if the new reply is a reply for some master question
        let indexOfMaterQuestion = this._qnaMessages.findIndex(qnaMessage => {
            return qnaMessage.id === parentId;
        });
        if (indexOfMaterQuestion === -1) {
            logger.warn("Dropping reply as there is no matching (master) question", {
                method: "addReply",
                data: { reply }
            });
            return;
        }

        let replies = this._qnaMessages[indexOfMaterQuestion].replies;

        // if there is pending reply in _qnaMessages delete it
        if (reply.pendingMessageId) {
            let indexOfPendingReplay = replies.findIndex(qnaMessage => {
                return qnaMessage.id === reply.pendingMessageId;
            });

            if (indexOfPendingReplay !== -1) {
                this._qnaMessages.splice(indexOfPendingReplay, 1); // delete if pending message was found
            }
        }

        // Add new message if doesn't exits
        let indexOfReplay = replies.findIndex(qnaMessage => {
            return qnaMessage.id === reply.id;
        });

        if (indexOfReplay === -1) {
            replies.push(reply);
        }

        this._sortReplies(replies);

        if (!options || !options.disableUpdateEvent) {
            this.triggerUpdateUIEvent();
        }
    }

    public triggerUpdateUIEvent(): void {
        this._events.emit({
            type: KitchenSinkEventTypes.MessagesUpdatedEvent,
            messages: this._qnaMessages
        });
    }

    public updateMessageId(
        currentId: string,
        newId: string,
        parentId?: string | null
    ): QnaMessage | null {
        let newMessage = null;

        if (parentId) {
            let indexOfMaterQuestion = this._qnaMessages.findIndex(qnaMessage => {
                return qnaMessage.id === parentId;
            });
            let replies = this._qnaMessages[indexOfMaterQuestion].replies;

            let indexOfReply = replies.findIndex(qnaMessage => {
                return qnaMessage.id === currentId;
            });

            if (indexOfReply !== -1) {
                newMessage = {
                    ...replies[indexOfReply],
                    id: newId
                };
                this._qnaMessages.splice(indexOfReply, 1, newMessage);
            }
        } else {
            let indexOfMaterQuestion = this._qnaMessages.findIndex(qnaMessage => {
                return qnaMessage.id === currentId;
            });

            if (indexOfMaterQuestion !== -1) {
                newMessage = {
                    ...this._qnaMessages[indexOfMaterQuestion],
                    id: newId
                };
                this._qnaMessages.splice(indexOfMaterQuestion, 1, newMessage);
            }
        }

        return newMessage;
    }

    public updateMessageById(
        id: string,
        modifier: (message: QnaMessage) => QnaMessage,
        options?: { disableUpdateEvent?: boolean }
    ): void {
        const message = this._getMasterMessageById(id);

        if (!message) {
            return;
        }

        const newMessage = modifier(message);

        if (message !== newMessage) {
            let existingIndex = this._qnaMessages.findIndex(qnaMessage => {
                return qnaMessage.id === newMessage.id;
            });
            this._qnaMessages.splice(existingIndex, 1, newMessage); // override to the new element

            if (!options || !options.disableUpdateEvent) {
                this.triggerUpdateUIEvent();
            }
        }
    }

    public _getMasterMessageById(id: string): QnaMessage | undefined {
        return this._qnaMessages.find(qnaMessage => {
            return qnaMessage.id === id;
        });
    }

    private _sortMessages(): void {
        this._qnaMessages.sort((a: QnaMessage, b: QnaMessage) => {
            return Utils.threadTimeCompare(a) - Utils.threadTimeCompare(b);
        });
    }

    private _sortReplies(replies: QnaMessage[]) {
        replies.sort((a: QnaMessage, b: QnaMessage) => {
            return a.createdAt.valueOf() - b.createdAt.valueOf();
        });
    }
}
