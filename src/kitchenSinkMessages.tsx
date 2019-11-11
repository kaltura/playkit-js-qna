import { MessageDeliveryStatus, QnaMessage } from "./qnaMessageFactory";
import { Utils } from "./utils";
import { EventsManager, getContribLogger } from "@playkit-js-contrib/common";
import { KitchenSinkManager } from "@playkit-js-contrib/ui";

export enum KitchenSinkPluginEventTypes {
    MessagesUpdatedEvent = "MessagesUpdatedEvent"
}

export interface MessagesUpdatedEvent {
    type: KitchenSinkPluginEventTypes.MessagesUpdatedEvent;
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
            let pendingMessageIndex = Utils.findIndex(
                this._qnaMessages,
                this._idComparator(newMessage.pendingMessageId)
            );

            if (
                pendingMessageIndex !== -1 &&
                this._qnaMessages[pendingMessageIndex].deliveryStatus ===
                    MessageDeliveryStatus.SENDING
            ) {
                this._qnaMessages.splice(pendingMessageIndex, 1); // delete if pending message was found
            }
        }

        // Add new message if doesn't exits
        let existingIndex = Utils.findIndex(this._qnaMessages, this._idComparator(newMessage.id));

        // if found: return
        if (existingIndex > -1) {
            return;
        }

        this._qnaMessages.push(newMessage);

        this._sortMessages();

        if (!options || !options.disableUpdateEvent) {
            this.triggerUpdateUIEvent();
        }
    }

    public deleteMessage(messageId: string, disableUpdateEvent?: boolean) {
        let existingIndex = Utils.findIndex(this._qnaMessages, this._idComparator(messageId));
        if (existingIndex > -1) {
            this._qnaMessages.splice(existingIndex, 1);

            this._sortMessages();

            if (!disableUpdateEvent) {
                this.triggerUpdateUIEvent();
            }
        }
    }

    public addReply(
        parentId: string,
        reply: QnaMessage,
        options?: { disableUpdateEvent?: boolean }
    ): void {
        // find if the new reply is a reply for some master question
        let indexOfMaterQuestion = Utils.findIndex(this._qnaMessages, this._idComparator(parentId));
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
            let indexOfPendingReplay = Utils.findIndex(
                replies,
                this._idComparator(reply.pendingMessageId)
            );
            if (
                indexOfPendingReplay !== -1 &&
                replies[indexOfPendingReplay].deliveryStatus === MessageDeliveryStatus.SENDING
            ) {
                replies.splice(indexOfPendingReplay, 1); // delete if pending message was found
            }
        }

        // Add new message if doesn't exits
        let indexOfReplay = Utils.findIndex(replies, this._idComparator(reply.id));

        // if found: return
        if (indexOfReplay > -1) {
            return;
        }

        replies.push(reply);

        this._sortReplies(replies);

        if (!options || !options.disableUpdateEvent) {
            this.triggerUpdateUIEvent();
        }
    }

    public triggerUpdateUIEvent(): void {
        this._events.emit({
            type: KitchenSinkPluginEventTypes.MessagesUpdatedEvent,
            messages: this._qnaMessages
        });
    }

    public updateMessageId(
        currentId: string,
        newId: string,
        parentId: string | null
    ): QnaMessage | undefined {
        return this.updateMessageById(
            currentId,
            parentId,
            message => {
                return {
                    ...message,
                    id: newId
                };
            },
            { disableUpdateEvent: true }
        );
    }

    public updateMessageById(
        id: string,
        parentId: string | null,
        modifier: (message: QnaMessage) => QnaMessage,
        options?: { disableUpdateEvent?: boolean }
    ): QnaMessage | undefined {
        let newMessage = undefined;

        if (parentId) {
            let masterMessage = this.getMasterMessageById(parentId);

            if (!masterMessage) {
                return;
            }

            let replies = masterMessage.replies;

            let indexOfReply = Utils.findIndex(replies, this._idComparator(id));

            if (indexOfReply !== -1) {
                let message = replies[indexOfReply];
                newMessage = modifier(message);
                if (newMessage && message !== newMessage) {
                    replies.splice(indexOfReply, 1, newMessage);
                }
            }
        } else {
            let indexOfMaterQuestion = Utils.findIndex(this._qnaMessages, this._idComparator(id));

            if (indexOfMaterQuestion !== -1) {
                let message = this._qnaMessages[indexOfMaterQuestion];
                newMessage = modifier(message);

                if (newMessage && message !== newMessage) {
                    this._qnaMessages.splice(indexOfMaterQuestion, 1, newMessage);
                }
            }
        }

        if (!options || !options.disableUpdateEvent) {
            this.triggerUpdateUIEvent();
        }

        return newMessage;
    }

    public getMasterMessageById(id: string): QnaMessage | undefined {
        let index = Utils.findIndex(this._qnaMessages, this._idComparator(id));

        if (index === -1) {
            return;
        }

        return this._qnaMessages[index];
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

    private _idComparator(id: string): (item: QnaMessage) => boolean {
        return (item): boolean => {
            return item.id === id;
        };
    }
}
