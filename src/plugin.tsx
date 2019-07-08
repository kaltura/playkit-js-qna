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
import {
    PushNotifications,
    PushNotificationsOptions,
    PrepareRegisterRequest
} from "@playkit-js-contrib/push-notifications";

const isDev = true; // TODO - should be provided by Omri Katz as part of the cli implementation
const pluginName = `qna${isDev ? "-local" : ""}`;

export class QnaPlugin extends PlayerContribPlugin
    implements OnMediaLoad, OnPluginSetup, OnRegisterUI, OnMediaUnload {
    static defaultConfig = {};

    private _kalturaClient = new KalturaClient();
    private _pushNotifications: PushNotifications | null = null;

    onPluginSetup(config: ContribConfig): void {
        this._kalturaClient.setOptions({
            clientTag: "playkit-js-qna",
            endpointUrl: config.server.serviceUrl
        });

        this._kalturaClient.setDefaultRequestOptions({
            ks: config.server.ks
        });

        let pushNotificationsOptions: PushNotificationsOptions = {
            ks: config.server.ks,
            serviceUrl: config.server.serviceUrl,
            clientTag: "QnaPlugin_V7", // todo: Is this the clientTag we want
            playerAPI: {
                kalturaPlayer: this.player,
                eventManager: this.eventManager
            }
        };

        // Todo: should use plugin instance
        this._pushNotifications = PushNotifications.getInstance(pushNotificationsOptions);
    }

    onMediaUnload(): void {}

    onMediaLoad(config: OnMediaLoadConfig): void {}

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
}

KalturaPlayer.core.registerPlugin(pluginName, QnaPlugin);
