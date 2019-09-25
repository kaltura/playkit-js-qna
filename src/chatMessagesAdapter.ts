import { KitchenSinkMessages } from "./kitchenSinkMessages";
import {
    PushNotificationEventTypes,
    QnaPushNotification,
    UserQnaNotificationsEvent
} from "./qnaPushNotification";
import { getContribLogger } from "@playkit-js-contrib/common";
import {
    MessageDeliveryStatus,
    QnaMessage,
    QnaMessageFactory,
    QnaMessageType
} from "./qnaMessageFactory";
import {
    KalturaClient,
    KalturaMultiRequest,
    KalturaMultiResponse,
    KalturaRequest
} from "kaltura-typescript-client";
import { ContribConfig } from "@playkit-js-contrib/plugin";
import { CuePointAddAction } from "kaltura-typescript-client/api/types/CuePointAddAction";
import { CuePointUpdateAction } from "kaltura-typescript-client/api/types/CuePointUpdateAction";
import {
    KalturaAnnotation,
    KalturaAnnotationArgs
} from "kaltura-typescript-client/api/types/KalturaAnnotation";
import { KalturaMetadataObjectType } from "kaltura-typescript-client/api/types/KalturaMetadataObjectType";
import { KalturaMetadataProfileFilter } from "kaltura-typescript-client/api/types/KalturaMetadataProfileFilter";
import { MetadataAddAction } from "kaltura-typescript-client/api/types/MetadataAddAction";
import { MetadataProfileListAction } from "kaltura-typescript-client/api/types/MetadataProfileListAction";
import { Utils } from "./utils";

export interface ChatMessagesAdapterOptions {
    kitchenSinkMessages: KitchenSinkMessages;
    qnaPushNotification: QnaPushNotification;
    //todo [sa] toastsManager from contrib
}

interface SubmitRequestParams {
    requests: KalturaRequest<any>[];
    missingProfileId: boolean;
    requestIndexCorrection: number;
}

const logger = getContribLogger({
    class: "ChatMessagesAdapter",
    module: "qna-plugin"
});

export class ChatMessagesAdapter {
    private _kalturaClient = new KalturaClient();
    private _kitchenSinkMessages: KitchenSinkMessages;
    private _qnaPushNotification: QnaPushNotification;

    private _config: ContribConfig | null = null;
    private _userId: string | undefined;
    private _entryId: string | undefined;
    private _metadataProfileId: number | null = null;

    private _initialize = false;

    constructor(options: ChatMessagesAdapterOptions) {
        this._kitchenSinkMessages = options.kitchenSinkMessages;
        this._qnaPushNotification = options.qnaPushNotification;
    }

    public init(config: ContribConfig): void {
        if (this._initialize) return;

        this._initialize = true;
        this._config = config;
        this._kalturaClient.setOptions({
            clientTag: "playkit-js-qna",
            endpointUrl: this._config.server.serviceUrl
        });

        this._kalturaClient.setDefaultRequestOptions({
            ks: this._config.server.ks
        });
        this._qnaPushNotification.on(
            PushNotificationEventTypes.UserNotifications,
            this._processMessages
        );
    }

    public onMediaLoad(userId: string, entryId: string): void {
        this._userId = userId;
        this._entryId = entryId;
    }

    public reset(): void {
        this._metadataProfileId = null;
        this._entryId = undefined;
        this._userId = undefined;
    }

    public destroy(): void {
        this._qnaPushNotification.off(
            PushNotificationEventTypes.UserNotifications,
            this._processMessages
        );
        this.reset();
    }

    public submitQuestion = async (question: string, parentId?: string) => {
        // todo [am] temp
        const uuid = Date.now().toString(); // todo [am] $$$ shai uuid

        const pendingQnaMessage = QnaMessageFactory.createPendingQnaMessage({
            id: uuid,
            text: question + "___Pending", // todo [am] remove
            parentId: parentId ? parentId : undefined,
            createdAt: new Date()
        });

        this._addOrUpdateQnaMessage([pendingQnaMessage]);

        try {
            await this._multiRequestForAddMessage(uuid, question, parentId);
        } catch (err) {
            this._handleMultiRequestsError(err, uuid, pendingQnaMessage);
        }
    };

    private async _multiRequestForAddMessage(uuid: string, question: string, parentId?: string) {
        const { requests, missingProfileId, requestIndexCorrection } = this._prepareSubmitRequest(
            uuid,
            question,
            parentId
        );

        const multiRequest = new KalturaMultiRequest(...requests);

        let responses: KalturaMultiResponse | null = await this._kalturaClient.multiRequest(
            multiRequest
        );

        if (!responses) {
            logger.error("no response", {
                method: "_submitQuestion",
                data: {
                    responses
                }
            });
            throw new Error("no response");
        }

        if (responses.hasErrors() || !responses.length) {
            const firstError = responses.getFirstError();
            logger.error("Add cue point multi-request failed", {
                method: "_submitQuestion",
                data: {
                    firstError
                }
            });
            throw new Error("Add cue point multi-request failed");
        }

        if (missingProfileId) {
            this._metadataProfileId = responses[0].result.objects[0].id;
        }

        const index = 0 + requestIndexCorrection;
        const hasCuePoint = responses.length > index + 1;

        if (!hasCuePoint) {
            throw new Error(
                "Add cue-point multi-request error: There is no cue-point object added"
            );
        }

        const cuePoint = responses[index].result;

        if (!cuePoint || !(cuePoint instanceof KalturaAnnotation)) {
            throw new Error(
                "Add cue-point multi-request error: There is no KalturaAnnotation cue-point object added"
            );
        }
    }

    private _handleMultiRequestsError(err: any, oldUuid: string, pendingQnaMessage: QnaMessage) {
        logger.error("Failed to submit new question", {
            method: "_submitQuestion",
            data: {
                err
            }
        });

        const newUuid = Date.now().toString();
        const newMessage = this._kitchenSinkMessages.updateMessageId(
            oldUuid,
            newUuid,
            pendingQnaMessage.parentId
        );

        if (!newMessage) {
            return;
        }

        newMessage.deliveryStatus = MessageDeliveryStatus.SEND_FAILED;
        this._addOrUpdateQnaMessage([newMessage]);

        // $$$$ todo [am] Add toast
    }

    public async resendQuestion(qnaMessage: QnaMessage, parentId?: string) {
        if (!qnaMessage.messageContent) {
            return;
        }

        try {
            await this._multiRequestForAddMessage(
                qnaMessage.id,
                qnaMessage.messageContent,
                parentId
            );
        } catch (err) {
            this._handleMultiRequestsError(err, qnaMessage.id, qnaMessage);
        }
    }

    private _prepareSubmitRequest(
        uuid: string,
        question: string,
        parentId?: string
    ): SubmitRequestParams {
        const requests: KalturaRequest<any>[] = [];
        const missingProfileId = !this._metadataProfileId;
        const requestIndexCorrection = missingProfileId ? 1 : 0;
        /*
            1 - Conditional: Prepare get meta data profile request
         */
        if (missingProfileId) {
            const metadataProfileListAction = new MetadataProfileListAction({
                filter: new KalturaMetadataProfileFilter({
                    systemNameEqual: "Kaltura-QnA"
                })
            });

            requests.push(metadataProfileListAction);
        }

        /*
            2 - Prepare to add annotation cuePoint request
         */
        if (!this._entryId) {
            throw new Error("Can't make requests without entryId");
        }

        const kalturaAnnotationArgs: KalturaAnnotationArgs = {
            entryId: this._entryId,
            startTime: Date.now(), // TODO get server/player time
            text: question,
            isPublic: 1, // TODO verify with backend team
            searchableOnEntry: 0,
            systemName: uuid
        };

        let thread;
        if (parentId) {
            thread = this._kitchenSinkMessages._getMasterMessageById(parentId);

            if (!thread) {
                throw new Error("Can't make reply requests without thread");
            }

            // create a created Reply List that omit all the failed/ pending message leaving with the created only
            const createdReplyList = thread.replies.filter((qnaMessage: QnaMessage) => {
                return qnaMessage.deliveryStatus === MessageDeliveryStatus.CREATED;
            });
            const cuePointParentId = createdReplyList.length
                ? createdReplyList[createdReplyList.length - 1].id
                : thread.id;
            kalturaAnnotationArgs.parentId = cuePointParentId;
        }

        const addAnnotationCuePointRequest = new CuePointAddAction({
            cuePoint: new KalturaAnnotation(kalturaAnnotationArgs)
        });

        /*
            3 - Prepare to add metadata
         */
        const metadata: Record<string, string> = {};

        if (thread) {
            metadata.ThreadId = thread.id;
        }

        metadata.Type = QnaMessageType.Question;
        metadata.ThreadCreatorId = this._userId!; // TODO temp solutions for userId need to handle anonymous user id

        const xmlData = Utils.createXmlFromObject(metadata);

        const addMetadataRequest = new MetadataAddAction({
            metadataProfileId: this._metadataProfileId ? this._metadataProfileId : 0,
            objectType: KalturaMetadataObjectType.annotation,
            objectId: "",
            xmlData: xmlData
        }).setDependency(["objectId", 0 + requestIndexCorrection, "id"]);

        if (missingProfileId) {
            addMetadataRequest.setDependency(["metadataProfileId", 0, "objects:0:id"]);
        }

        /*
            4 - Prepare to update cuePoint with Tags
         */
        const updateCuePointAction = new CuePointUpdateAction({
            id: "",
            cuePoint: new KalturaAnnotation({
                tags: "qna"
            })
        }).setDependency(["id", 0 + requestIndexCorrection, "id"]);

        // Prepare the multi request
        requests.push(...[addAnnotationCuePointRequest, addMetadataRequest, updateCuePointAction]);

        const submitRequestParams: SubmitRequestParams = {
            requests,
            missingProfileId,
            requestIndexCorrection
        };

        return submitRequestParams;
    }

    private _processMessages = ({ qnaMessages }: UserQnaNotificationsEvent): void => {
        //todo [sa] handle toasts
        this._addOrUpdateQnaMessage(qnaMessages);
    };

    private _addOrUpdateQnaMessage = (qnaMessages: QnaMessage[]): void => {
        qnaMessages.forEach((qnaMessage: QnaMessage) => {
            //is master question
            if (qnaMessage.parentId === null) {
                this._kitchenSinkMessages.add(qnaMessage);
            } else if (qnaMessage.parentId) {
                this._kitchenSinkMessages.addReply(qnaMessage.parentId, qnaMessage);
                this._setWillBeAnsweredOnAir(qnaMessage.parentId);
            }
        });
    };

    private _setWillBeAnsweredOnAir(messageId: string): void {
        this._kitchenSinkMessages.updateMessageById(messageId, (message: QnaMessage) => {
            if (message.willBeAnsweredOnAir) {
                return message;
            }
            let aoaReplyIndex = (message.replies || []).findIndex((reply: QnaMessage) => {
                return reply.isAoAAutoReply;
            });
            if (aoaReplyIndex > -1) {
                return { ...message, willBeAnsweredOnAir: true };
            }
            return message;
        });
    }
}
