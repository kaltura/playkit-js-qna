import { h, Ref } from "preact";
import { KalturaClient } from "kaltura-typescript-client";
import {
    OverlayItem,
    UIManager,
    OverlayUIModes,
    OverlayItemProps,
    KitchenSinkContentRendererProps
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

import { log } from "@playkit-js-contrib/common";
import { ThreadManager } from "./ThreadManager";

const isDev = true; // TODO - should be provided by Omri Katz as part of the cli implementation
const pluginName = `qna${isDev ? "-local" : ""}`;

export class QnaPlugin extends PlayerContribPlugin
    implements OnMediaLoad, OnPluginSetup, OnRegisterUI, OnMediaUnload {
    static defaultConfig = {};

    private _logger = this._getLogger("QnaPlugin");
    private _kalturaClient = new KalturaClient();
    private _threadManager: ThreadManager | null = null;

    onPluginSetup(config: ContribConfig): void {
        this._kalturaClient.setOptions({
            clientTag: "playkit-js-qna",
            endpointUrl: config.server.serviceUrl
        });

        this._kalturaClient.setDefaultRequestOptions({
            ks: config.server.ks
        });

        this._threadManager = new ThreadManager({
            ...config,
            player: this.player,
            eventManager: this.eventManager
        });
    }

    onMediaUnload(): void {
        if (this._threadManager) this._threadManager.unregister();
    }

    onMediaLoad(config: OnMediaLoadConfig): void {
        if (this._threadManager) this._threadManager.registerToQnaPushNotificationEvents();
    }

    onRegisterUI(uiManager: UIManager): void {
        uiManager.kitchenSink.add({
            name: "Q&A",
            iconRenderer: () => <MenuIcon />,
            contentRenderer: this._renderKitchenSinkContent
        });
    }

    private _renderKitchenSinkContent(props: KitchenSinkContentRendererProps) {
        return <KitchenSink {...props} />;
    }

    private _getLogger(context: string): Function {
        return (level: "debug" | "log" | "warn" | "error", message: string, ...args: any[]) => {
            log(level, context, message, ...args);
        };
    }
}

KalturaPlayer.core.registerPlugin(pluginName, QnaPlugin);
