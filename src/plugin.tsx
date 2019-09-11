import { h } from "preact";
import {
    KalturaClient,
    KalturaMultiRequest,
    KalturaMultiResponse,
    KalturaRequest
} from "kaltura-typescript-client";
import {
    KitchenSinkContentRendererProps,
    KitchenSinkExpandModes,
    KitchenSinkItem,
    KitchenSinkPositions,
    UIManager
} from "@playkit-js-contrib/ui";
import {
    ContribConfig,
    OnMediaLoad,
    OnMediaLoadConfig,
    OnMediaUnload,
    OnPluginSetup,
    OnRegisterUI,
    PlayerContribPlugin
} from "@playkit-js-contrib/plugin";
import { DateFormats, KitchenSink } from "./components/kitchen-sink";
import { MenuIcon } from "./components/menu-icon";

import { MessagesUpdatedEvent, ThreadManager, ThreadManagerEventTypes } from "./ThreadManager";
import { QnaMessage, QnaMessageType } from "./QnaMessage";
import { Utils } from "./utils";
import { CuePointAddAction } from "kaltura-typescript-client/api/types/CuePointAddAction";
import { CuePointUpdateAction } from "kaltura-typescript-client/api/types/CuePointUpdateAction";
import {
    KalturaAnnotation,
    KalturaAnnotationArgs
} from "kaltura-typescript-client/api/types/KalturaAnnotation";
import { KalturaMetadataObjectType } from "kaltura-typescript-client/api/types/KalturaMetadataObjectType";
import { MetadataAddAction } from "kaltura-typescript-client/api/types/MetadataAddAction";
import { KalturaMetadataProfileFilter } from "kaltura-typescript-client/api/types/KalturaMetadataProfileFilter";
import { MetadataProfileListAction } from "kaltura-typescript-client/api/types/MetadataProfileListAction";
import { getContribLogger } from "@playkit-js-contrib/common";
import {
    PushNotificationEventTypes,
    QnAPushNotificationManager
} from "./QnAPushNotificationManager";
import {
    HideAnnouncementEvent,
    OverlayEventTypes,
    QnAFloatingNotificationsManager,
    ShowAnnouncementEvent
} from "./QnAFloatingNotificationsManager";
import { AnswerOnAirIcon } from "./components/answer-on-air-icon";
import { TimeAlignedNotificationsManager } from "./TimeAlignedNotificationsManager";

const isDev = true; // TODO - should be provided by Omri Katz as part of the cli implementation
const pluginName = `qna${isDev ? "-local" : ""}`;

const logger = getContribLogger({
    class: "QnaPlugin",
    module: "qna-plugin"
});

interface SubmitRequestParams {
    requests: KalturaRequest<any>[];
    missingProfileId: boolean;
    requestIndexCorrection: number;
}

export class QnaPlugin extends PlayerContribPlugin
    implements OnMediaLoad, OnPluginSetup, OnRegisterUI, OnMediaUnload {
    static defaultConfig = {};

    private _kalturaClient = new KalturaClient();

    private _qnaPushNotificationManager: QnAPushNotificationManager | null = null;

    private _threadManager: ThreadManager = new ThreadManager();
    private _qnaOverlayManager: QnAFloatingNotificationsManager = new QnAFloatingNotificationsManager();
    private _timedAlignedNotificationManager: TimeAlignedNotificationsManager = new TimeAlignedNotificationsManager();
    private _kitchenSinkItem: KitchenSinkItem | null = null;
    private _threads: QnaMessage[] | [] = [];
    private _hasError: boolean = false;
    private _loading: boolean = true;
    private _metadataProfileId: number | null = null;

    public static readonly LOADING_TIME_END = 3000;

    onPluginSetup(config: ContribConfig): void {
        this._kalturaClient.setOptions({
            clientTag: "playkit-js-qna",
            endpointUrl: config.server.serviceUrl
        });

        this._kalturaClient.setDefaultRequestOptions({
            ks: config.server.ks
        });

        this._initPluginManagers();
    }

    onMediaLoad(config: OnMediaLoadConfig): void {
        const { server }: ContribConfig = this.getContribConfig();
        this._loading = true;
        this._hasError = false;
        this._metadataProfileId = null;
        //push notification event handlers were set during pluginSetup,
        //on each media load we need to register for relevant entryId / userId notifications
        if (this._qnaPushNotificationManager) {
            this._qnaPushNotificationManager.registerToPushServer(
                config.entryId,
                server.userId || ""
            );
        }
    }

    onMediaUnload(): void {
        this._hasError = false;
        this._loading = true;
        this._threads = [];
        //reset managers
        if (this._qnaPushNotificationManager) {
            this._qnaPushNotificationManager.reset();
        }
        this._threadManager.reset();
        this._qnaOverlayManager.reset();
        this._timedAlignedNotificationManager.reset();
    }

    //todo [sakal] add onPluginDestroy
    onPluginDestroy(): void {
        this._hasError = false;
        this._loading = true;
        this._threads = [];
        //destroy managers
        if (this._qnaPushNotificationManager) {
            this._qnaPushNotificationManager.destroy();
        }
        this._threadManager.destroy();
        this._threadManager.off(ThreadManagerEventTypes.MessagesUpdatedEvent, this._onQnaMessage);
        this._qnaOverlayManager.destroy();
        this._qnaOverlayManager.off(
            OverlayEventTypes.ShowInPlayer,
            this._onInPlayerNotificationShow
        );
        this._qnaOverlayManager.off(
            OverlayEventTypes.HideInPlayer,
            this._onInPlayerNotificationHide
        );
        this._timedAlignedNotificationManager.destroy();
    }

    private _initPluginManagers(): void {
        const { server }: ContribConfig = this.getContribConfig();

        // should be created once on pluginSetup (entryId/userId registration will be called onMediaLoad)
        this._qnaPushNotificationManager = QnAPushNotificationManager.getInstance({
            ks: server.ks,
            serviceUrl: server.serviceUrl,
            clientTag: "QnaPlugin_V7", // todo: [am] Is this the clientTag we want
            playerAPI: {
                kalturaPlayer: this.player,
                eventManager: this.eventManager
            }
        });

        this._qnaPushNotificationManager.on(
            PushNotificationEventTypes.PushNotificationsError,
            this._onQnaError
        );

        this._timedAlignedNotificationManager.init({
            qnaPushManger: this._qnaPushNotificationManager,
            playerApi: {
                kalturaPlayer: this.player,
                eventManager: this.eventManager
            }
        });

        this._threadManager.init({
            qnaPushManger: this._qnaPushNotificationManager,
            realTimeManager: this._timedAlignedNotificationManager
        });
        this._qnaOverlayManager.init({
            qnaPushManger: this._qnaPushNotificationManager,
            realTimeManager: this._timedAlignedNotificationManager,
            playerApi: {
                kalturaPlayer: this.player,
                eventManager: this.eventManager
            }
        });

        this._threadManager.on(ThreadManagerEventTypes.MessagesUpdatedEvent, this._onQnaMessage);
        this._qnaOverlayManager.on(
            OverlayEventTypes.ShowInPlayer,
            this._onInPlayerNotificationShow
        );
        this._qnaOverlayManager.on(
            OverlayEventTypes.HideInPlayer,
            this._onInPlayerNotificationHide
        );

        this._delayedGiveUpLoading();
    }

    private _delayedGiveUpLoading() {
        setTimeout(() => {
            this._loading = false;
            this._updateKitchenSink();
        }, QnaPlugin.LOADING_TIME_END);
    }

    private _updateKitchenSink() {
        if (this._kitchenSinkItem) {
            this._kitchenSinkItem.update();
        }
    }

    private _onQnaMessage = ({ messages }: MessagesUpdatedEvent) => {
        this._hasError = false;
        this._loading = false;
        this._threads = messages;
        this._updateKitchenSink();
    };

    private _onQnaError = () => {
        this._loading = false;
        this._hasError = true;
        this._updateKitchenSink();
    };

    private _onInPlayerNotificationShow = ({ message }: ShowAnnouncementEvent) => {
        this.uiManager.floatingNotification.add({
            content: {
                text: message.messageContent ? message.messageContent : ""
            }
        });
    };

    private _onInPlayerNotificationHide = (event: HideAnnouncementEvent) => {
        this.uiManager.floatingNotification.remove();
    };

    onRegisterUI(uiManager: UIManager): void {
        this._kitchenSinkItem = uiManager.kitchenSink.add({
            label: "Q&A",
            expandMode: KitchenSinkExpandModes.OverTheVideo,
            renderIcon: () => <MenuIcon />,
            position: KitchenSinkPositions.Right,
            renderContent: this._renderKitchenSinkContent
        });
    }

    _renderKitchenSinkContent = (props: KitchenSinkContentRendererProps) => {
        if (!this._threadManager) {
            return <div />;
        }

        // todo: get this from KMS / KMC etc'...
        const formatting = {
            dateFormatting: DateFormats.European
        };

        return (
            <KitchenSink
                {...props}
                formatting={formatting}
                threads={this._threads}
                hasError={this._hasError}
                loading={this._loading}
                onSubmit={this._submitQuestion}
            />
        );
    };

    private _prepareSubmitRequest(question: string, thread?: QnaMessage): SubmitRequestParams {
        const requests: KalturaRequest<any>[] = [];
        const missingProfileId = !this._metadataProfileId;
        const requestIndexCorrection = missingProfileId ? 1 : 0;
        const contribConfig: ContribConfig = this.getContribConfig();

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
            entryId: this.entryId,
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
        metadata.ThreadCreatorId = contribConfig.server.userId!; // TODO temp solutions for userId need to handle anonymous user id

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

    private _submitQuestion = async (question: string, thread?: QnaMessage) => {
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

            if (this.entryId !== cuePoint.entryId) {
                // drop this cuePoint as it doesn't belong to this entryId
                logger.info("dropping cuePoint as it it doesn't belong to this entryId", {
                    method: "_submitQuestion",
                    data: {
                        entryId: cuePoint.entryId,
                        cuePointEntryId: cuePoint.entryId
                    }
                });
            }

            if (this._threadManager) {
                this._threadManager.addPendingCuePointToThread(cuePoint, thread && thread.id);
            }
        } catch (err) {
            // TODO handle Error then submitting a question
            logger.error("Failed to submit new question", {
                method: "_submitQuestion",
                data: {
                    err
                }
            });
        }
    };
}

KalturaPlayer.core.registerPlugin(pluginName, QnaPlugin);
