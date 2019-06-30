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
import { KitchenSink } from "./components/kitchen-sink";
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

    onPluginSetup(config: ContribConfig): void {
        this._kalturaClient.setOptions({
            clientTag: "playkit-js-qna",
            endpointUrl: config.server.serviceUrl
        });

        this._kalturaClient.setDefaultRequestOptions({
            ks: config.server.ks
        });

        this._messageEventManager = new EventManager();
        this._messageEventManager.on("OnPrivateMessage", (qnaMessages: QnaMessage[]) => {
            this._threads = qnaMessages;
            if (this._kitchenSinkItem) {
                this._kitchenSinkItem.update();
            }
        });

        this._threadManager = new ThreadManager({
            ks: config.server.ks,
            serviceUrl: config.server.serviceUrl,
            playerAPI: {
                player: this.player,
                eventManager: this.eventManager
            },
            messageEventManager: this._messageEventManager
        });
    }

    onMediaUnload(): void {
        if (this._threadManager) this._threadManager.unregister();
    }

    onMediaLoad(config: OnMediaLoadConfig): void {
        // todo: send this.entryId but it is wrong

        const entryId = "1_s8s12id6"; // this.getEntryId()  // todo wrong config.entryId
        const userId = "Shimi"; // this.getUserName() // todo

        if (this._threadManager) this._threadManager.register(entryId, userId);

        // TODO remove once replacing this temporary standalond player with support of the new API
        KalturaPlayer.getPlayer("player-div").setSidePanelMode("EXPANDED");
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
        return <KitchenSink {...props} threads={this._threads} />;
    };

    private _getLogger(context: string): Function {
        return (level: "debug" | "log" | "warn" | "error", message: string, ...args: any[]) => {
            log(level, context, message, ...args);
        };
    }
}

KalturaPlayer.core.registerPlugin(pluginName, QnaPlugin);
