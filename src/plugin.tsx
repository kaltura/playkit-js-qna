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

import { ThreadManager } from "./ThreadManager";
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
import { QnAPushNotificationManager } from "./QnAPushNotificationManager";
import { InPlayerNotificationsManager } from "./InPlayerNotificationsManager";

const isDev = true; // TODO - should be provided by Omri Katz as part of the cli implementation
const pluginName = `qna${isDev ? "-local" : ""}`;

const logger = getContribLogger({
    class: "QnaPlugin",
    module: "qna-plugin"
});

export class QnaPlugin extends PlayerContribPlugin
    implements OnMediaLoad, OnPluginSetup, OnRegisterUI, OnMediaUnload {
    static defaultConfig = {};

    private _kalturaClient = new KalturaClient();

    private _qnaPushNotificationManager: QnAPushNotificationManager | null = null;

    private _uiManager: UIManager | null = null;
    private _threadManager: ThreadManager | null = null;
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
    }

    onMediaLoad(config: OnMediaLoadConfig): void {
        this._loading = true;
        this._hasError = false;
        this._metadataProfileId = null;
        this._initPluginManagers();
    }

    private _initPluginManagers(): void {
        const { server }: ContribConfig = this.getContribConfig();

        this._qnaPushNotificationManager = QnAPushNotificationManager.getInstance({
            ks: server.ks,
            serviceUrl: server.serviceUrl,
            clientTag: "QnaPlugin_V7", // todo: [am] Is this the clientTag we want
            playerAPI: {
                kalturaPlayer: this.player,
                eventManager: this.eventManager
            }
        });

        this._threadManager = new ThreadManager();
        this._threadManager.addPushNotificationEventHandlers(this._qnaPushNotificationManager);
        // register messages
        this._threadManager.messageEventManager.on("OnQnaMessage", this._onQnaMessage.bind(this));
        this._threadManager.messageEventManager.on("OnQnaError", this._onQnaError.bind(this));

        let announcementManger = new InPlayerNotificationsManager({
            kalturaPlayer: this.player,
            eventManager: this.eventManager
        });
        announcementManger.addPushNotificationEventHandlers(this._qnaPushNotificationManager);
        // register messages
        announcementManger.messageEventManager.on("showAnnouncement", (data: QnaMessage) => {
            if (this._uiManager)
                this._uiManager.announcement.add({
                    content: {
                        text: data.messageContent ? data.messageContent : ""
                    }
                });
        });
        announcementManger.messageEventManager.on("hideAnnouncement", () => {
            if (this._uiManager) this._uiManager.announcement.remove();
        });

        //registering only after all handlers were added to make sure all data will be handled
        this._qnaPushNotificationManager.registerToPushServer(this.entryId, server.userId);

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

    private _onQnaMessage(qnaMessages: QnaMessage[]) {
        this._hasError = false;
        this._loading = false;
        this._threads = qnaMessages;
        this._updateKitchenSink();
    }

    private _onQnaError() {
        this._loading = false;
        this._hasError = true;
        this._updateKitchenSink();
    }

    onMediaUnload(): void {
        this._hasError = false;
        this._loading = true;
        this._destroyThreadManager();
    }

    private _destroyThreadManager(): void {
        if (!this._threadManager) {
            return;
        }

        // unregister to messages
        this._threadManager.messageEventManager.off("OnQnaMessage", this._onQnaMessage);
        this._threadManager.messageEventManager.off("OnQnaError", this._onQnaError);

        // unregister socket and event name
        if (this._threadManager) {
            this._threadManager.unregister();
        }

        //TODO destroy inPlayerNotificaitons....
    }

    onRegisterUI(uiManager: UIManager): void {
        this._uiManager = uiManager;
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

    private _submitQuestion = async (question: string, parentId?: string) => {
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

        if (parentId) {
            kalturaAnnotationArgs.parentId = parentId;
        }

        const addAnnotationCuePointRequest = new CuePointAddAction({
            cuePoint: new KalturaAnnotation(kalturaAnnotationArgs)
        });

        /*
            3 - Prepare to add metadata
         */
        const metadata: Record<string, string> = {
            Type: QnaMessageType.Question,
            ThreadCreatorId: contribConfig.server.userId! // TODO temp solutions for userId need to handle anonymous user id
        };

        if (parentId) {
            metadata.ThreadId = parentId;
        }

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
                this._threadManager.addPendingCuePointToThread(cuePoint);
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

    // Todo need to add onDestroyPlugin lifecycle method
}

KalturaPlayer.core.registerPlugin(pluginName, QnaPlugin);
