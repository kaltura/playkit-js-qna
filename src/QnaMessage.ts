import { KalturaAnnotation } from "kaltura-typescript-client/api/types/KalturaAnnotation";
import { KalturaMetadataListResponse } from "kaltura-typescript-client/api/types/KalturaMetadataListResponse";
import { Utils } from "./utils";

export enum QnaMessageType {
    Question = "Question",
    Answer = "Answer",
    Announcement = "Announcement"
}

export enum MessageStatusEnum {
    CREATED = "CREATED",
    SENDING = "SENDING",
    SEND_FAILED = "SEND_FAILED",
    SENT = "SENT"
}

export interface MetadataInfo {
    type: QnaMessageType;
    parentId: string | null; // on masterQuestion the parentId xml metadata not always exits.
}

export interface QnaMessageParams {
    metadataInfo: MetadataInfo;
    id: string;
    time: Date;
}

export class QnaMessage {
    public id: string;
    public time: Date;
    public messageContent: string | null = null;
    public type: QnaMessageType;
    public parentId: string | null;
    public replies: QnaMessage[];
    public deliveryStatus: MessageStatusEnum | null = null;

    public static create(cuePoint: KalturaAnnotation): QnaMessage | null {
        try {
            // throw parsing errors
            const qnaMessageParams: QnaMessageParams = {
                metadataInfo: this.getMetadata(cuePoint),
                id: cuePoint.id,
                time: cuePoint.createdAt
            };

            const result = new QnaMessage(qnaMessageParams);

            // add optional if any
            result.messageContent = cuePoint.text;
            result.deliveryStatus = cuePoint.createdAt
                ? MessageStatusEnum.CREATED
                : MessageStatusEnum.SENDING;

            return result;
        } catch (e) {
            // todo static logging to this;
            console.warn(`Error: couldn't create QnaMessage, mandatory field(s) are missing`, e);
            return null;
        }
    }

    public static createPendingMessage(cuePoint: KalturaAnnotation) {
        const qnaMessageParams: QnaMessageParams = {
            metadataInfo: {
                type: QnaMessageType.Question,
                parentId: null
            },
            id: cuePoint.id,
            time: cuePoint.createdAt
        };

        const result = new QnaMessage(qnaMessageParams);

        result.messageContent = cuePoint.text;
        result.deliveryStatus = MessageStatusEnum.SENDING;

        return result;
    }

    constructor(qnaMessageParams: QnaMessageParams) {
        this.id = qnaMessageParams.id;
        this.time = qnaMessageParams.time;
        this.parentId = qnaMessageParams.metadataInfo.parentId;
        this.type = qnaMessageParams.metadataInfo.type;
        this.replies = [];
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

        // Always reference this threadId in metadata for parentId as moderator won't send parentId
        const parentId = Utils.getValueFromXml(xmlDoc, "ThreadId");

        const metadataInfo: MetadataInfo = {
            type: type,
            parentId: parentId
        };

        return metadataInfo;
    }

    isMasterQuestion(): boolean {
        return this.parentId == null;
    }
}
