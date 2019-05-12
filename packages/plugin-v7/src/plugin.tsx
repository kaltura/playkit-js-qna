import { h, Ref } from "preact";
import Stage, { Props as StageProps } from "@plugin/shared/components/Stage";
import { KalturaClient } from "kaltura-typescript-client";
import {
    OverlayUI,
    OverlayUIProps,
    OverlayUIModes,
    OVPBasePlugin,
    UIManager
} from "@playkit-js/playkit-js-ovp-v7";

export class QnaPlugin extends OVPBasePlugin {
    static defaultConfig = {};

    private _overlay: OverlayUI<Stage> | null = null;
    private _kalturaClient = new KalturaClient({
        clientTag: "playkit-js-qna",
        endpointUrl: this.getServiceUrl()
    });

    protected _onAddBindings(eventManager: any): void {
        this.eventManager.listenOnce(this.player, this.player.Event.MEDIA_LOADED, () => {
            this._loadCuePoints();
        });
    }

    protected _onAddOverlays(uiManager: UIManager): void {
        this._overlay = uiManager.add(
            new OverlayUI<Stage>({
                mode: OverlayUIModes.FirstPlay,
                renderer: this._renderRoot
            })
        );
    }

    protected _onInitMembers(): void {
        this._overlay = null;
    }

    private _renderRoot = (setRef: Ref<Stage>, overlayUIProps: OverlayUIProps): any => {
        const props: StageProps = {
            ...overlayUIProps
        };

        return <Stage {...props} ref={setRef} key={"stage"} />;
    };
}

KalturaPlayer.core.registerPlugin("qna", QnaPlugin);
