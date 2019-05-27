import { h, Ref } from "preact";
import { KalturaClient } from "kaltura-typescript-client";
import {
    OverlayItem,
    UIManager,
    OverlayUIModes,
    OverlayItemProps,
    KitchenSinkContentRendererProps
} from "@playkit-js-contrib/ui";
import { PlayerContribPlugin } from "@playkit-js-contrib/plugin";
import { KitchenSink } from "./components/kitchen-sink";
import { MenuIcon } from "./components/menu-icon";

const isDev = true; // TODO - should be provided by Omri Katz as part of the cli implementation
const pluginName = `qna${isDev ? "-local" : ""}`;

export class QnaPlugin extends PlayerContribPlugin {
    static defaultConfig = {};

    private _kalturaClient = new KalturaClient({
        clientTag: "playkit-js-qna",
        endpointUrl: this.getServiceUrl()
    });

    protected _onAddBindings(eventManager: any): void {}

    protected _onMediaLoaded() {
        this._kalturaClient.setDefaultRequestOptions({
            ks: this.getKS()
        });
    }

    protected _onAddOverlays(uiManager: UIManager): void {
        uiManager.kitchenSink.add({
            name: "Q&A",
            iconRenderer: () => <MenuIcon />,
            contentRenderer: this._renderKitchenSinkContent
        });
    }

    protected _onInitMembers(): void {
        this._overlay = null;
    }

    private _renderKitchenSinkContent(props: KitchenSinkContentRendererProps) {
        return <KitchenSink {...props} />;
    }
}

KalturaPlayer.core.registerPlugin(pluginName, QnaPlugin);
