import { KalturaAnnotation } from "kaltura-typescript-client/api/types/KalturaAnnotation";
import { KalturaMetadataListResponse } from "kaltura-typescript-client/api/types/KalturaMetadataListResponse";
import { Utils } from "./utils";

export enum QnaMessageType {
    Question = "Question",
    Answer = "Answer",
    Announcement = "Announcement",
    AnswerOnAir = "AnswerOnAir"
}

export enum MessageStatusEnum {
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

export class QnaMessage {
    public id: string;
    public createdAt: Date;
    public messageContent: string | null = null;
    public type: QnaMessageType;
    public state: MessageState;
    public parentId: string | null;
    public replies: QnaMessage[];
    public deliveryStatus: MessageStatusEnum | null = null;
    public userId: string | null = null;
    public isAoAAutoReply: boolean = false;
    public willBeAnsweredOnAir: boolean = false;
    public unRead: boolean = false;

    public static create(cuePoint: KalturaAnnotation): QnaMessage | null {
        try {
            // throw parsing errors
            const qnaMessageParams: QnaMessageParams = {
                metadataInfo: this.getMetadata(cuePoint),
                id: cuePoint.id,
                createdAt: cuePoint.createdAt,
                tags: cuePoint.tags ? cuePoint.tags.split(",").map(value => value.trim()) : []
            };

            const result = new QnaMessage(qnaMessageParams);

            // add optional if any
            result.messageContent = cuePoint.text;
            result.deliveryStatus = cuePoint.createdAt
                ? MessageStatusEnum.CREATED
                : MessageStatusEnum.SENDING;

            result.userId = cuePoint.userId;

            return result;
        } catch (e) {
            // todo [am] static logging to this;
            console.warn(`Error: couldn't create QnaMessage, mandatory field(s) are missing`, e);
            return null;
        }
    }

    public static createPendingMessage(cuePoint: KalturaAnnotation, threadId?: string) {
        const qnaMessageParams: QnaMessageParams = {
            metadataInfo: {
                type: QnaMessageType.Question,
                parentId: threadId ? threadId : null,
                state: MessageState.Pending
            },
            id: cuePoint.id,
            createdAt: cuePoint.createdAt,
            tags: cuePoint.tags ? cuePoint.tags.split(",").map(value => value.trim()) : []
        };

        const result = new QnaMessage(qnaMessageParams);

        result.messageContent = cuePoint.text;
        result.deliveryStatus = MessageStatusEnum.SENDING;

        return result;
    }

    constructor(qnaMessageParams: QnaMessageParams) {
        this.id = qnaMessageParams.id;
        this.createdAt = qnaMessageParams.createdAt;
        this.parentId = qnaMessageParams.metadataInfo.parentId;
        this.type = qnaMessageParams.metadataInfo.type;
        this.state = qnaMessageParams.metadataInfo.state;
        this.replies = [];
        this.isAoAAutoReply = qnaMessageParams.tags.indexOf(AOAAutoReplyTag) > -1;
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

        let parser = new DOMParser();
        let xmlDoc = parser.parseFromString(metadata.xml, "text/xml");

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
