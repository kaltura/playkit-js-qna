import { KitchenSinkMessages } from "./kitchenSinkMessages";
import {
    PushNotificationEventTypes,
    QnaPushNotification,
    UserQnaNotificationsEvent
} from "./qnaPushNotification";
import { getContribLogger } from "@playkit-js-contrib/common";
import { QnaMessage, QnaMessageType } from "./qnaMessage";
import {
    KalturaClient,
    KalturaMultiRequest,
    KalturaMultiResponse,
    KalturaRequest
} from "kaltura-typescript-client";
import { ContribConfig } from "@playkit-js-contrib/plugin";
import {
    CuePointAddAction,
    CuePointUpdateAction,
    KalturaAnnotation,
    KalturaAnnotationArgs,
    KalturaMetadataObjectType,
    KalturaMetadataProfileFilter,
    MetadataAddAction,
    MetadataProfileListAction
} from "kaltura-typescript-client/api/types";
import { Utils } from "./utils";

export interface ChatMessagesAdapterOptions {
    kitchenSinkMessages: KitchenSinkMessages;
    qnaPushNotification: QnaPushNotification;
    config: ContribConfig;
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
    private _config: ContribConfig;

    private _userId: string | undefined;
    private _entryId: string | undefined;
    private _metadataProfileId: number | null = null;

    private _initialize = false;

    constructor(options: ChatMessagesAdapterOptions) {
        this._kitchenSinkMessages = options.kitchenSinkMessages;
        this._qnaPushNotification = options.qnaPushNotification;
        this._config = options.config;
    }

    public init(): void {
        if (this._initialize) return;

        this._initialize = true;
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

    public submitQuestion = async (question: string, thread?: QnaMessage) => {
        const { requests, missingProfileId, requestIndexCorrection } = this._prepareSubmitRequest(
            question,
            thread
        );

        const multiRequest = new KalturaMultiRequest(...requests);

        try {
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

            if (this._entryId !== cuePoint.entryId) {
                // drop this cuePoint as it doesn't belong to this entryId
                logger.info("dropping cuePoint as it it doesn't belong to this entryId", {
                    method: "_submitQuestion",
                    data: {
                        entryId: cuePoint.entryId,
                        cuePointEntryId: cuePoint.entryId
                    }
                });
            }
            //todo [am] actually handle pending message
        } catch (err) {
            // TODO [am] handle Error then submitting a question
            logger.error("Failed to submit new question", {
                method: "_submitQuestion",
                data: {
                    err
                }
            });
        }
    };

    private _prepareSubmitRequest(question: string, thread?: QnaMessage): SubmitRequestParams {
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
        const kalturaAnnotationArgs: KalturaAnnotationArgs = {
            entryId: this._entryId,
            startTime: Date.now(), // TODO get server/player time
            text: question,
            isPublic: 1, // TODO verify with backend team
            searchableOnEntry: 0
        };

        if (thread) {
            const parentId = thread.replies.length
                ? thread.replies[thread.replies.length - 1].id
                : thread.id;
            kalturaAnnotationArgs.parentId = parentId;
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
        //todo [am] handle pending
        //todo [sa] handle toasts
        qnaMessages.forEach((qnaMessage: QnaMessage) => {
            if (qnaMessage.isMasterQuestion()) {
                this._kitchenSinkMessages.addOrUpdateMessage(qnaMessage);
            } else if (qnaMessage.parentId) {
                this._kitchenSinkMessages.addOrUpdateReply(qnaMessage.parentId, qnaMessage);
            }
        });
    };
}
