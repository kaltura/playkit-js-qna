import {
    KalturaAnnotation,
    KalturaCuePoint,
    KalturaMetadata,
    KalturaMetadataListResponse,
    KalturaMetadataProfileStatus,
    KalturaMetadataStatus
} from "kaltura-typescript-client/api/types";
import { Utils } from "./utils";
import { log } from "@playkit-js-contrib/common";

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

interface MetadataInfo {
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

    private _logger = this._getLogger("QnaPlugin");

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
            parentId: Utils.getValueFromXml(xmlDoc, "ThreadId")
        };

        return metadataInfo;
    }

    isMasterQuestion(): boolean {
        return this.parentId === null;
    }

    private _getLogger(context: string): Function {
        return (level: "debug" | "log" | "warn" | "error", message: string, ...args: any[]) => {
            log(level, context, message, ...args);
        };
    }
}
