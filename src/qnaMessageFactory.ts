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
    SEND_FAILED = "SEND_FAILED",
    SENT = "SENT"
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
    threadId?: string;
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
}

export class QnaMessageFactory {
    public static create(cuePoint: KalturaAnnotation): QnaMessage | null {
        try {
            const metadata = QnaMessageFactory.getMetadata(cuePoint);
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
                    : MessageDeliveryStatus.SENDING
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
            parentId: pendingQnaMessageOptions.threadId ? pendingQnaMessageOptions.threadId : null,
            type: QnaMessageType.Question,
            state: MessageState.Pending,
            replies: [],
            isAoAAutoReply: false,
            messageContent: pendingQnaMessageOptions.text,
            userId: null,
            willBeAnsweredOnAir: false,
            deliveryStatus: MessageDeliveryStatus.SEND_FAILED
        };

        return qnaMessage;
    }

    private static getMetadata(cuePoint: KalturaAnnotation): MetadataInfo {
        if (!cuePoint.relatedObjects || !cuePoint.relatedObjects["QandA_ResponseProfile"]) {
            throw new Error("Missing QandA_ResponseProfile at cuePoint.relatedObjects");
        }

        const relatedObject = cuePoint.relatedObjects["QandA_ResponseProfile"];

        if (!(relatedObject instanceof KalturaMetadataListResponse)) {
            throw new Error("QandA_ResponseProfile expected to be KalturaMetadataListResponse");
        }

        if (relatedObject.objects.length === 0) {
            throw new Error("There are no metadata objects xml at KalturaMetadataListResponse");
        }

        const metadata = relatedObject.objects[0];

        if (!("DOMParser" in window)) {
            throw new Error("DOMParser is not exits at window, cant parse the metadata xml");
        }

        return this._parseXml(metadata.xml);
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
