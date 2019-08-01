import { h } from "preact";
import {
    KalturaClient,
    KalturaMultiRequest,
    KalturaMultiResponse,
    KalturaRequest
} from "kaltura-typescript-client";
import {
    KitchenSinkContentRendererProps,
    KitchenSinkItem,
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

import { log } from "@playkit-js-contrib/common";
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
import {
    KalturaMetadataProfileFilter,
    MetadataProfileListAction
} from "kaltura-typescript-client/api/types";

const isDev = true; // TODO - should be provided by Omri Katz as part of the cli implementation
const pluginName = `qna${isDev ? "-local" : ""}`;

export class QnaPlugin extends PlayerContribPlugin
    implements OnMediaLoad, OnPluginSetup, OnRegisterUI, OnMediaUnload {
    static defaultConfig = {};

    private _logger = this._getLogger("QnaPlugin");
    private _kalturaClient = new KalturaClient();
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
        this._registerThreadManager();

        // TODO remove once replacing this temporary standalond player with support of the new API
        KalturaPlayer.getPlayer("player-div").setSidePanelMode("EXPANDED");
    }

    private _registerThreadManager(): void {
        const contribConfig: ContribConfig = this.getContribConfig();

        this._threadManager = new ThreadManager({
            ks: contribConfig.server.ks,
            serviceUrl: contribConfig.server.serviceUrl,
            playerAPI: {
                player: this.player,
                eventManager: this.eventManager
            }
        });

        const entryId = this._getMockData().entryId; // this.getEntryId()  // todo wrong config.entryId
        const userId = this._getMockData().userId; // this.getUserName() // todo

        // register to events
        this._hasError = false;

        if (!this._threadManager) {
            return;
        }

        // register socket ans event names
        this._threadManager.register(entryId, userId);

        // register messages
        this._threadManager.messageEventManager.on("OnQnaMessage", this._onQnaMessage.bind(this));
        this._threadManager.messageEventManager.on("OnQnaError", this._onQnaError.bind(this));

        this._delayedGiveUpLoading();
    }

    private _getMockData(): { entryId: string; userId: string } {
        return {
            entryId: "1_s8s12id6",
            userId: "Shimi"
        };
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
    }

    onRegisterUI(uiManager: UIManager): void {
        this._kitchenSinkItem = uiManager.kitchenSink.add({
            name: "Q&A",
            iconRenderer: () => <MenuIcon />,
            contentRenderer: this._renderKitchenSinkContent
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

    private _getLogger(context: string): Function {
        return (level: "debug" | "log" | "warn" | "error", message: string, ...args: any[]) => {
            log(level, context, message, ...args);
        };
    }

    private _submitQuestion = async (question: string, parentId?: string) => {
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
            entryId: this._getMockData().entryId,
            startTime: Date.now(),
            text: question,
            isPublic: 1,
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
            ThreadCreatorId: this._getMockData().userId
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
            4 - Prepare to update metadata with Tags
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
                this._logger("error", "no response");
                throw new Error("no response");
            }

            if (responses.hasErrors() || !responses.length) {
                this._logger(
                    "error",
                    "Add cue point multi-request failed",
                    responses.getFirstError()
                );
                throw new Error("Add cue point multi-request failed");
            }

            if (missingProfileId) {
                this._metadataProfileId = responses[0].result.objects[0].id;
            }

            const index = 0 + requestIndexCorrection;
            const cuePoint = responses.length > index + 1 && responses[index].result;

            if (!cuePoint || !(cuePoint instanceof KalturaAnnotation)) {
                throw new Error(
                    "Add cue-point multi-request error: There is no KalturaAnnotation cue-point object added"
                );
            }

            if (this._threadManager) {
                this._threadManager.addPendingCuePointToThread(cuePoint);
            }
        } catch (err) {
            this._logger("error", err);
        }
    };

    // Todo need to add onDestroyPlugin lifecycle method
}

KalturaPlayer.core.registerPlugin(pluginName, QnaPlugin);
