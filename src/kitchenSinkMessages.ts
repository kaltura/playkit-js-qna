import { QnaMessage } from "./qnaMessage";
import { Utils } from "./utils";
import { EventsManager, getContribLogger } from "@playkit-js-contrib/common";
import { KitchenSinkManager } from "@playkit-js-contrib/ui";
import { AoAMessage } from "./aoaAdapter";

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

    //todo [am] not fully implemented yet
    public addPendingQuestion(): void {}

    public add(
        newMessage: QnaMessage,
        options?: { disableUpdateEvent?: boolean; pendingMessageId?: string }
    ): void {
        let existingIndex = Utils.findIndex(this._qnaMessages, this._idComparator(newMessage.id));
        if (existingIndex === -1) {
            this._qnaMessages.push(newMessage);
        }

        //todo [am] handle pending question scenario

        this._sortMessages();

        if (!options || !options.disableUpdateEvent) {
            this.triggerUpdateUIEvent();
        }
    }

    public deleteMessage(messageId: string, disableUpdateEvent?: boolean) {
        let existingIndex = Utils.findIndex(this._qnaMessages, this._idComparator(messageId));
        if (existingIndex > -1) {
            this._qnaMessages.splice(existingIndex, 1);
        }
        this._sortMessages();

        if (!disableUpdateEvent) {
            this.triggerUpdateUIEvent();
        }
    }

    public addReply(parentId: string, reply: QnaMessage, disableUpdateEvent?: boolean): void {
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
        let indexOfReplay = Utils.findIndex(replies, this._idComparator(reply.id));
        if (indexOfReplay === -1) {
            replies.push(reply);
        }

        this._sortReplies(replies);

        if (!disableUpdateEvent) {
            this.triggerUpdateUIEvent();
        }
    }

    public triggerUpdateUIEvent(): void {
        this._events.emit({
            type: KitchenSinkEventTypes.MessagesUpdatedEvent,
            messages: this._qnaMessages
        });
    }

    public updateMessageById(id: string, modifier: (message: QnaMessage) => QnaMessage): void {
        const message = this._getMessageById(id);

        if (!message) {
            return;
        }

        const newMessage = modifier(message);

        if (message !== newMessage) {
            let existingIndex = Utils.findIndex(
                this._qnaMessages,
                this._idComparator(newMessage.id)
            );
            this._qnaMessages.splice(existingIndex, 1, newMessage); // override to the new element
        }
    }

    private _getMessageById(id: string): QnaMessage | undefined {
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

    private _idComparator(id: string): (item: QnaMessage) => boolean {
        return (item): boolean => {
            return item.id === id;
        };
    }
}
