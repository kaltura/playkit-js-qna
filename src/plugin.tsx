import { h } from "preact";
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
import { KitchenSink } from "./components/kitchen-sink";
import { MenuIcon } from "./components/menu-icon";
import { QnaMessage } from "./qnaMessageFactory";
import { getContribLogger } from "@playkit-js-contrib/common";
import { PushNotificationEventTypes, QnaPushNotification } from "./qnaPushNotification";
import { AoaAdapter } from "./aoaAdapter";
import { AnnouncementsAdapter } from "./announcementsAdapter";
import { ChatMessagesAdapter } from "./chatMessagesAdapter";
import {
    KitchenSinkEventTypes,
    KitchenSinkMessages,
    MessagesUpdatedEvent
} from "./kitchenSinkMessages";

const isDev = true; // TODO - should be provided by Omri Katz as part of the cli implementation
const pluginName = `qna${isDev ? "-local" : ""}`;
const DefaultBannerDuration: number = 60 * 1000;
const DefaultToastDuration: number = 5 * 1000;
const MinBannerDuration: number = 5 * 1000;
const MinToastDuration: number = 5 * 1000;

const logger = getContribLogger({
    class: "QnaPlugin",
    module: "qna-plugin"
});

export class QnaPlugin extends PlayerContribPlugin
    implements OnMediaLoad, OnPluginSetup, OnRegisterUI, OnMediaUnload {
    static defaultConfig = {
        bannerDuration: DefaultBannerDuration,
        toastDuration: DefaultToastDuration,
        dateFormat: "dd/mm/yyyy"
    };

    private _kitchenSinkItem: KitchenSinkItem | null = null;
    private _threads: QnaMessage[] | [] = [];
    private _hasError: boolean = false;
    private _loading: boolean = true;
    private _qnaPushNotification: QnaPushNotification;
    private _aoaAdapter: AoaAdapter;
    private _announcementAdapter: AnnouncementsAdapter;
    private _chatMessagesAdapter: ChatMessagesAdapter;
    private _kitchenSinkMessages: KitchenSinkMessages;

    public static readonly LOADING_TIME_END = 3000;

    constructor(...args: any) {
        //padding args to player core via PlayerContribPlugin
        // @ts-ignore
        super(...args);
        let bannerDuration =
            this.config.bannerDuration && this.config.bannerDuration >= MinBannerDuration
                ? this.config.bannerDuration
                : DefaultBannerDuration;
        let toastDuration =
            this.config.toastDuration && this.config.toastDuration >= MinToastDuration
                ? this.config.toastDuration
                : DefaultToastDuration;
        //adapters
        this._qnaPushNotification = new QnaPushNotification();
        this._kitchenSinkMessages = new KitchenSinkMessages({
            kitchenSinkManager: this.uiManager.kitchenSink
        });
        this._aoaAdapter = new AoaAdapter({
            kitchenSinkMessages: this._kitchenSinkMessages,
            qnaPushNotification: this._qnaPushNotification,
            bannerManager: this.uiManager.banner,
            playerApi: {
                kalturaPlayer: this.player,
                eventManager: this.eventManager
            },
            delayedEndTime: bannerDuration,
            activateKitchenSink: this._activateKitchenSink,
            isKitchenSinkActive: this._isKitchenSinkActive,
            toastsManager: this.uiManager.toast,
            toastDuration: toastDuration
        });
        this._announcementAdapter = new AnnouncementsAdapter({
            kitchenSinkMessages: this._kitchenSinkMessages,
            qnaPushNotification: this._qnaPushNotification,
            activateKitchenSink: this._activateKitchenSink,
            isKitchenSinkActive: this._isKitchenSinkActive,
            toastsManager: this.uiManager.toast,
            toastDuration: toastDuration
        });
        this._chatMessagesAdapter = new ChatMessagesAdapter({
            kitchenSinkMessages: this._kitchenSinkMessages,
            qnaPushNotification: this._qnaPushNotification,
            activateKitchenSink: this._activateKitchenSink,
            isKitchenSinkActive: this._isKitchenSinkActive,
            toastsManager: this.uiManager.toast,
            toastDuration: toastDuration
        });
        //listeners
        this._constructPluginListener();
    }

    onPluginSetup(config: ContribConfig): void {
        this._initPluginManagers();
    }

    onMediaLoad(config: OnMediaLoadConfig): void {
        const { server }: ContribConfig = this.getContribConfig();
        this._loading = true;
        this._hasError = false;
        //push notification event handlers were set during pluginSetup,
        //on each media load we need to register for relevant entryId / userId notifications
        this._qnaPushNotification.registerToPushServer(config.entryId, server.userId || "");
        this._chatMessagesAdapter.onMediaLoad(server.userId || "", this.entryId);
    }

    onMediaUnload(): void {
        this._hasError = false;
        this._loading = true;
        this._threads = [];
        //reset managers
        this._qnaPushNotification.reset();
        this._aoaAdapter.reset();
        this._kitchenSinkMessages.reset();
        this._chatMessagesAdapter.reset();
    }

    //todo [sakal] add onPluginDestroy
    onPluginDestroy(): void {
        this._hasError = false;
        this._loading = true;
        this._threads = [];
        //destroy managers
        this._qnaPushNotification.off(
            PushNotificationEventTypes.PushNotificationsError,
            this._onQnaError
        );
        this._qnaPushNotification.destroy();
        this._aoaAdapter.destroy();
        this._announcementAdapter.destroy();
        this._chatMessagesAdapter.destroy();
        this._kitchenSinkMessages.destroy();
        //remove listeners
        this._kitchenSinkMessages.off(
            KitchenSinkEventTypes.MessagesUpdatedEvent,
            this._onQnaMessage
        );
    }

    private _constructPluginListener(): void {
        this._qnaPushNotification.on(
            PushNotificationEventTypes.PushNotificationsError,
            this._onQnaError
        );
        //register to kitchenSink updated qnaMessages array
        this._kitchenSinkMessages.on(
            KitchenSinkEventTypes.MessagesUpdatedEvent,
            this._onQnaMessage
        );
    }

    private _initPluginManagers(): void {
        const { server }: ContribConfig = this.getContribConfig();
        // should be created once on pluginSetup (entryId/userId registration will be called onMediaLoad)
        this._qnaPushNotification.init({
            ks: server.ks,
            serviceUrl: server.serviceUrl,
            clientTag: "QnaPlugin_V7",
            playerAPI: {
                kalturaPlayer: this.player,
                eventManager: this.eventManager
            }
        });
        this._aoaAdapter.init();
        this._announcementAdapter.init();
        this._chatMessagesAdapter.init(this.getContribConfig());
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

    private _isKitchenSinkActive = (): boolean => {
        if (!this._kitchenSinkItem) return false;
        return this._kitchenSinkItem.isActive();
    };

    private _activateKitchenSink = (): void => {
        if (this._kitchenSinkItem) {
            this._kitchenSinkItem.activate();
        }
    };

    private _parseExpandMode(value: string): KitchenSinkExpandModes {
        switch (value) {
            case "OverTheVideo":
                return KitchenSinkExpandModes.OverTheVideo;
            default:
                return KitchenSinkExpandModes.AlongSideTheVideo;
        }
    }

    onRegisterUI(uiManager: UIManager): void {
        const config = this.getContribConfig();
        const expandMode = this._parseExpandMode(config.kitchenSink.expandMode);

        this._kitchenSinkItem = uiManager.kitchenSink.add({
            label: "Q&A",
            expandMode: expandMode,
            renderIcon: () => <MenuIcon />,
            position: KitchenSinkPositions.Right,
            renderContent: this._renderKitchenSinkContent
        });
    }

    _renderKitchenSinkContent = (props: KitchenSinkContentRendererProps) => {
        if (!this._kitchenSinkMessages) {
            return <div />;
        }

        return (
            <KitchenSink
                {...props}
                dateFormat={this.config.dateFormat}
                threads={this._threads}
                hasError={this._hasError}
                loading={this._loading}
                onSubmit={this._chatMessagesAdapter.submitQuestion}
                onResend={this._chatMessagesAdapter.resendQuestion}
                onMassageRead={this._chatMessagesAdapter.onMessageRead}
            />
        );
    };
}

KalturaPlayer.core.registerPlugin(pluginName, QnaPlugin);
