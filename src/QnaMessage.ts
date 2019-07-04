import {
    KalturaAnnotation,
    KalturaMetadata,
    KalturaMetadataListResponse,
    KalturaMetadataProfileStatus,
    KalturaMetadataStatus
} from "kaltura-typescript-client/api/types";
import { Utils } from "./utils";

export enum QnaMessageType {
    QUESTION = "Question",
    ANNOUNCEMENT = "Announcement",
    ANSWER = "Answer"
}

export enum MessageStatusEnum {
    CREATED = "CREATED",
    SENDING = "SENDING",
    SEND_FAILED = "SEND_FAILED",
    SENT = "SENT"
}

interface Window extends Record<string, any> {}

export function isWindowHasDomParser(window: any): window is Window {
    return "DOMParser" in window;
}

export class QnaMessage {
    public id: string;
    public deliveryStatus: MessageStatusEnum;
    public messageContent: string;
    public time: Date;
    public parentId: string | null = null;
    public replies: QnaMessage[];
    public type: QnaMessageType | null = null;
    public threadCreatorId: string | null = null;

    constructor(cuePoint: KalturaAnnotation) {
        this.addMetadata(cuePoint);

        this.id = cuePoint.id;
        this.time = cuePoint.createdAt;
        this.messageContent = cuePoint.text;
        this.replies = [];
        this.deliveryStatus = cuePoint.createdAt
            ? MessageStatusEnum.CREATED
            : MessageStatusEnum.SENDING;
    }

    isMasterQuestion(): boolean {
        return this.parentId === null;
    }

    private addMetadata(cuePoint: KalturaAnnotation) {
        const relatedObject = cuePoint.relatedObjects["QandA_ResponseProfile"];

        if (!(relatedObject instanceof KalturaMetadataListResponse)) {
            // todo
            return null;
        }

        if (relatedObject.objects.length === 0) {
            return null;
        }

        const metadata = relatedObject.objects[0];

        try {
            if (!isWindowHasDomParser(window)) {
                // TODO log
                return;
            }

            let parser = new DOMParser();
            let xmlDoc = parser.parseFromString(metadata.xml, "text/xml");

            const type = Utils.getValueFromXml(xmlDoc, "Type");
            this.type = type ? Utils.getEnumByEnumValue(QnaMessageType, type) : null; // noImplicitAny

            this.threadCreatorId = Utils.getValueFromXml(xmlDoc, "ThreadCreatorId");

            // Always reference threadId in metadata for parentId as moderator won't send parentId
            this.parentId = Utils.getValueFromXml(xmlDoc, "ThreadId");
        } catch (e) {
            // todo log error
            return null;
        }
    }

    /**
     * Take the time of the newest QnaMessage
     */
    threadTimeCompareFunction(): number {
        if (this.type === QnaMessageType.ANNOUNCEMENT) {
            return this.time.valueOf();
        }

        let q_time, a_time;

        if (this.type === QnaMessageType.ANSWER) {
            a_time = this.time.valueOf();
        }

        if (this.type === QnaMessageType.QUESTION) {
            q_time = this.time.valueOf();
        }

        for (let i = 0; i < this.replies.length; ++i) {
            let reply: QnaMessage = this.replies[i];
            if (reply.type === QnaMessageType.ANSWER) {
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
}
