import { h, Ref } from "preact";
import { KalturaClient } from "kaltura-typescript-client";
import {
    OverlayItem,
    UIManager,
    OverlayUIModes,
    OverlayItemProps,
    KitchenSinkContentRendererProps,
    KitchenSinkItem
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

import { log, EventManager } from "@playkit-js-contrib/common";
import { ThreadManager } from "./ThreadManager";
import { QnaMessage } from "./QnaMessage";

const isDev = true; // TODO - should be provided by Omri Katz as part of the cli implementation
const pluginName = `qna${isDev ? "-local" : ""}`;

export class QnaPlugin extends PlayerContribPlugin
    implements OnMediaLoad, OnPluginSetup, OnRegisterUI, OnMediaUnload {
    static defaultConfig = {};

    private _logger = this._getLogger("QnaPlugin");
    private _kalturaClient = new KalturaClient();
    private _threadManager: ThreadManager | null = null;
    private _messageEventManager: EventManager | null = null;
    private _kitchenSinkItem: KitchenSinkItem | null = null;
    private _threads: QnaMessage[] | [] = [];
    private _hasError: boolean = false;
    private _loading: boolean = true;

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

        const entryId = "1_s8s12id6"; // this.getEntryId()  // todo wrong config.entryId
        const userId = "Shimi"; // this.getUserName() // todo

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
    }

    private _onQnaMessage(qnaMessages: QnaMessage[]) {
        this._hasError = false;
        this._loading = false;
        this._threads = qnaMessages;
        if (this._kitchenSinkItem) {
            this._kitchenSinkItem.update();
        }
    }

    private _onQnaError() {
        this._loading = false;
        this._hasError = true;
        if (this._kitchenSinkItem) {
            this._kitchenSinkItem.update();
        }
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
            />
        );
    };

    private _getLogger(context: string): Function {
        return (level: "debug" | "log" | "warn" | "error", message: string, ...args: any[]) => {
            log(level, context, message, ...args);
        };
    }

    // Todo need to add onDestroyPlugin lifecycle method
}

KalturaPlayer.core.registerPlugin(pluginName, QnaPlugin);
