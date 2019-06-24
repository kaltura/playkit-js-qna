import {
    KalturaAnnotation,
    KalturaMetadata,
    KalturaMetadataListResponse
} from "kaltura-typescript-client/api/types";

enum MessageStatusEnum {
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
    public status: MessageStatusEnum;
    public messageContent: string;
    public time: Date;
    public parentId: string | null;
    public replies: QnaMessage[];

    constructor(cuePoint: KalturaAnnotation) {
        this.id = cuePoint.id;
        this.time = cuePoint.createdAt;
        this.messageContent = cuePoint.text;
        this.parentId = cuePoint.parentId || null;
        this.replies = [];
        this.status = cuePoint.createdAt ? MessageStatusEnum.CREATED : MessageStatusEnum.SENDING;
    }

    public isMasterQuestion(): boolean {
        return this.parentId === "0";
    }

    // private parseMetadata(cuePoint: KalturaAnnotation): Metadata | null {
    //     const relatedObject = cuePoint.relatedObjects['QandA_ResponseProfile'];
    //
    //     if (!(relatedObject instanceof KalturaMetadataListResponse)) {
    //         // todo
    //         return null;
    //     }
    //
    //     if (relatedObject.objects.length === 0) {
    //         return null;
    //     }
    //
    //     const metadata = relatedObject.objects[0];
    //
    //     try {
    //         if (!isWindowHasDomParser(window)) {
    //             // TODO log
    //             return null;
    //         }
    //
    //         let parser = new DOMParser();
    //         let xmlDoc = parser.parseFromString(metadata.xml, "text/xml");
    //
    //         return {
    //             Type: xmlDoc.getElementsByTagName("Type")[0].childNodes[0].nodeValue,
    //             ThreadCreatorId: xmlDoc.getElementsByTagName("ThreadCreatorId")[0].childNodes[0].nodeValue
    //         }
    //     } catch (e) {
    //         // todo log error
    //         return null;
    //     }
    // }
}
