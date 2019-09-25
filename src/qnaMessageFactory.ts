import { KalturaAnnotation } from "kaltura-typescript-client/api/types/KalturaAnnotation";
import { KalturaMetadataListResponse } from "kaltura-typescript-client/api/types/KalturaMetadataListResponse";
import { Utils } from "./utils";

export enum QnaMessageType {
    Question = "Question",
    Answer = "Answer",
    Announcement = "Announcement",
    AnswerOnAir = "AnswerOnAir"
}

export enum MessageDeliveryStatus {
    CREATED = "CREATED",
    SENDING = "SENDING",
    SEND_FAILED = "SEND_FAILED"
}

export enum MessageState {
    Pending = "Pending",
    Answered = "Answered",
    Deleted = "Deleted",
    None = "None"
}

export interface MetadataInfo {
    type: QnaMessageType;
    state: MessageState;
    parentId: string | null; // on masterQuestion the parentId xml metadata not always exits.
}

export interface QnaMessageParams {
    metadataInfo: MetadataInfo;
    id: string;
    createdAt: Date;
    tags: string[];
}

const AOAAutoReplyTag = "aoa_auto_reply";

export interface PendingQnaMessageOptions {
    parentId?: string;
    id: string;
    text: string;
    createdAt: Date;
}

export interface QnaMessage {
    id: string;
    createdAt: Date;
    messageContent?: string;
    type: QnaMessageType;
    state: MessageState;
    parentId: string | null;
    replies: QnaMessage[];
    deliveryStatus?: MessageDeliveryStatus;
    userId: string | null;
    isAoAAutoReply: boolean;
    willBeAnsweredOnAir: boolean;
    pendingMessageId: string | null;
}

export class QnaMessageFactory {
    public static create(cuePoint: KalturaAnnotation, metadataXml: string): QnaMessage | null {
        try {
            const metadata = QnaMessageFactory._parseXml(metadataXml);
            const tags = cuePoint.tags ? cuePoint.tags.split(",").map(value => value.trim()) : [];

            const qnaMessage: QnaMessage = {
                id: cuePoint.id,
                createdAt: cuePoint.createdAt,
                parentId: metadata.parentId,
                type: metadata.type,
                state: metadata.state,
                replies: [],
                isAoAAutoReply: tags.indexOf(AOAAutoReplyTag) > -1,
                userId: cuePoint.userId,
                willBeAnsweredOnAir: false,
                messageContent: cuePoint.text,
                deliveryStatus: cuePoint.createdAt
                    ? MessageDeliveryStatus.CREATED
                    : MessageDeliveryStatus.SENDING,
                pendingMessageId: cuePoint.systemName
            };

            return qnaMessage;
        } catch (e) {
            // todo [am] static logging to this;
            console.warn(`Error: couldn't create QnaMessage, mandatory field(s) are missing`, e);
            return null;
        }
    }

    public static createPendingQnaMessage(pendingQnaMessageOptions: PendingQnaMessageOptions) {
        const qnaMessage: QnaMessage = {
            id: pendingQnaMessageOptions.id,
            createdAt: pendingQnaMessageOptions.createdAt,
            parentId: pendingQnaMessageOptions.parentId ? pendingQnaMessageOptions.parentId : null,
            type: QnaMessageType.Question,
            state: MessageState.Pending,
            replies: [],
            isAoAAutoReply: false,
            messageContent: pendingQnaMessageOptions.text,
            userId: null,
            willBeAnsweredOnAir: false,
            deliveryStatus: MessageDeliveryStatus.SEND_FAILED,
            pendingMessageId: null
        };

        return qnaMessage;
    }

    private static _parseXml(metadata: string) {
        let parser = new DOMParser();
        let xmlDoc = parser.parseFromString(metadata, "text/xml");

        const typeString = Utils.getValueFromXml(xmlDoc, "Type");
        if (!typeString) {
            throw new Error("Type is missing at metadata xml");
        }
        const type = Utils.getEnumByEnumValue(QnaMessageType, typeString);
        if (!type) {
            throw new Error(`Unknown QnA type: ${typeString}`);
        }

        const stateString = Utils.getValueFromXml(xmlDoc, "State");
        const state = Utils.getEnumByEnumValue(MessageState, stateString || "None");

        // Always reference this threadId in metadata for parentId as moderator won't send parentId
        const parentId = Utils.getValueFromXml(xmlDoc, "ThreadId");

        const metadataInfo: MetadataInfo = {
            type: type,
            parentId: parentId,
            state: state
        };

        return metadataInfo;
    }
}
