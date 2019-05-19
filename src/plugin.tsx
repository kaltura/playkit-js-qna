import { h, Ref } from "preact";
import Stage, { Props as StageProps } from "./components/Stage";
import { KalturaClient } from "kaltura-typescript-client";
import {
    OverlayItem,
    UIManager,
    OverlayUIModes,
    OverlayItemProps,
    UpperBarUIProps
} from "@playkit-js/ovp-ui";
import { OVPBasePlugin } from "@playkit-js/ovp-plugin";

const isDev = true; // TODO - should be provided by Omri Katz as part of the cli implementation
const pluginName = `qna${isDev ? "-local" : ""}`;

export class QnaPlugin extends OVPBasePlugin {
    static defaultConfig = {};

    private _overlay: OverlayItem<Stage> | null = null;
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
        this._overlay = uiManager.overlay.add({
            name: "hotspots",
            mode: OverlayUIModes.FirstPlay,
            renderer: this._renderRoot
        });

        const icon = (
            <svg width="32" height="32" viewBox="0 0 32 32">
                <g fill="none" fill-rule="evenodd" opacity=".8" transform="translate(3 5)">
                    <path
                        stroke="#FFF"
                        stroke-width="2"
                        d="M7 21.51L11.575 17H22a3 3 0 0 0 3-3V4a3 3 0 0 0-3-3H4a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h3v4.51z"
                    />
                    <rect width="15" height="2" x="6" y="6" fill="#FFF" rx="1" />
                    <rect width="11" height="2" x="6" y="10" fill="#FFF" rx="1" />
                </g>
            </svg>
        );

        uiManager.kitchenSink.add({
            name: "Q&A",
            iconRenderer: () => icon
        });
    }

    protected _onInitMembers(): void {
        this._overlay = null;
    }

    private _renderRoot = (overlayUIProps: OverlayItemProps): any => {
        const props: StageProps = {
            ...overlayUIProps
        };

        return <Stage {...props} key={"stage"} />;
    };
}

KalturaPlayer.core.registerPlugin(pluginName, QnaPlugin);
