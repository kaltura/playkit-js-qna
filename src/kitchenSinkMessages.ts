import { QnaMessage } from "./qnaMessage";
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

    //todo [am] not fully implemented yet
    public addPendingQuestion(): void {}

    public addOrUpdateMessage(
        newMessage: QnaMessage,
        options?: { disableUpdateEvent?: boolean; pendingMessageId?: string }
    ): void {
        let existingIndex = this._qnaMessages.findIndex(qnaMessage => {
            return qnaMessage.id === newMessage.id;
        });

        if (existingIndex === -1) {
            this._qnaMessages.push(newMessage);
        } else {
            newMessage.replies = this._qnaMessages[existingIndex].replies; //getting current message replies
            this._qnaMessages.splice(existingIndex, 1, newMessage); // override to the new element
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

    public addOrUpdateReply(
        parentId: string,
        reply: QnaMessage,
        disableUpdateEvent?: boolean
    ): void {
        // find if the new reply is a reply for some master question
        let indexOfMaterQuestion = this._qnaMessages.findIndex(qnaMessage => {
            return qnaMessage.id === parentId;
        });
        if (indexOfMaterQuestion === -1) {
            logger.warn("Dropping reply as there is no matching (master) question", {
                method: "addOrUpdateReply",
                data: { reply }
            });
            return;
        }
        // find the old reply and replace old reply with the new one
        let replies = this._qnaMessages[indexOfMaterQuestion].replies;
        let indexOfReplay = replies.findIndex(qnaMessage => {
            return qnaMessage.id === reply.id;
        });
        if (indexOfReplay === -1) {
            replies.push(reply);
        } else {
            replies.splice(indexOfReplay, 1, reply); // replace old reply with the new element
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

    //todo [sa] contrib new impl. in kitchenSinkManager
    public isVisible(): boolean {
        return true;
    }

    private _sortMessages(): void {
        this._qnaMessages.sort((a: QnaMessage, b: QnaMessage) => {
            return Utils.threadTimeCompare(a) - Utils.threadTimeCompare(b);
        });
    }

    private _sortReplies(replies: QnaMessage[]) {
        replies.sort((a: QnaMessage, b: QnaMessage) => {
            return a.time.valueOf() - b.time.valueOf();
        });
    }
}
