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
import { DateFormats, KitchenSink } from "./components/kitchen-sink";
import { MenuIcon } from "./components/menu-icon";
import { QnaMessage } from "./QnaMessage";
import { getContribLogger } from "@playkit-js-contrib/common";
import { PushNotificationEventTypes, QnAPushNotification } from "./QnAPushNotification";
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
const MinBannerDuration: number = 5 * 1000;

const logger = getContribLogger({
    class: "QnaPlugin",
    module: "qna-plugin"
});

export class QnaPlugin extends PlayerContribPlugin
    implements OnMediaLoad, OnPluginSetup, OnRegisterUI, OnMediaUnload {
    static defaultConfig = {
        bannerDuration: DefaultBannerDuration
    };

    private _kitchenSinkItem: KitchenSinkItem | null = null;
    private _threads: QnaMessage[] | [] = [];
    private _hasError: boolean = false;
    private _loading: boolean = true;

    private _qnaPushNotification: QnAPushNotification | null = null;
    private _aoaAdapter: AoaAdapter | null = null;
    private _announcementAdapter: AnnouncementsAdapter | null = null;
    private _chatMessagesAdapter: ChatMessagesAdapter | null = null;
    private _kitchenSinkMessages: KitchenSinkMessages | null = null;

    public static readonly LOADING_TIME_END = 3000;

    onPluginSetup(config: ContribConfig): void {
        this._initPluginManagers();
    }

    onMediaLoad(config: OnMediaLoadConfig): void {
        const { server }: ContribConfig = this.getContribConfig();
        this._loading = true;
        this._hasError = false;
        //push notification event handlers were set during pluginSetup,
        //on each media load we need to register for relevant entryId / userId notifications
        if (this._qnaPushNotification) {
            this._qnaPushNotification.registerToPushServer(config.entryId, server.userId || "");
        }
        if (this._chatMessagesAdapter) {
            this._chatMessagesAdapter.onMediaLoad(server.userId || "", this.entryId);
        }
    }

    onMediaUnload(): void {
        this._hasError = false;
        this._loading = true;
        this._threads = [];
        //reset managers
        if (this._qnaPushNotification) this._qnaPushNotification.reset();
        if (this._aoaAdapter) this._aoaAdapter.reset();
        if (this._kitchenSinkMessages) this._kitchenSinkMessages.reset();
        if (this._chatMessagesAdapter) this._chatMessagesAdapter.reset();
    }

    //todo [sakal] add onPluginDestroy
    onPluginDestroy(): void {
        this._hasError = false;
        this._loading = true;
        this._threads = [];
        //destroy managers
        if (this._qnaPushNotification) this._qnaPushNotification.destroy();
        if (this._aoaAdapter) this._aoaAdapter.destroy();
        if (this._announcementAdapter) this._announcementAdapter.destroy();
        if (this._chatMessagesAdapter) this._chatMessagesAdapter.destroy();
        if (this._kitchenSinkMessages) {
            this._kitchenSinkMessages.destroy();
            //remove listeners
            this._kitchenSinkMessages.off(
                KitchenSinkEventTypes.MessagesUpdatedEvent,
                this._onQnaMessage
            );
        }
    }

    private _initPluginManagers(): void {
        const { server }: ContribConfig = this.getContribConfig();
        let bannerDuration =
            this.config.bannerDuration && this.config.bannerDuration >= MinBannerDuration
                ? this.config.bannerDuration
                : DefaultBannerDuration;
        // should be created once on pluginSetup (entryId/userId registration will be called onMediaLoad)
        this._qnaPushNotification = new QnAPushNotification({
            pushServerOptions: {
                ks: server.ks,
                serviceUrl: server.serviceUrl,
                clientTag: "QnaPlugin_V7", // todo: [am] Is this the clientTag we want
                playerAPI: {
                    kalturaPlayer: this.player,
                    eventManager: this.eventManager
                }
            },
            delayedEndTime: bannerDuration
        });

        this._qnaPushNotification.on(
            PushNotificationEventTypes.PushNotificationsError,
            this._onQnaError
        );

        this._kitchenSinkMessages = new KitchenSinkMessages({
            kitchenSinkManager: this.uiManager.kitchenSink
        });
        this._kitchenSinkMessages.init();
        //register to kitchenSink updated qnaMessages array
        this._kitchenSinkMessages.on(
            KitchenSinkEventTypes.MessagesUpdatedEvent,
            this._onQnaMessage
        );

        this._aoaAdapter = new AoaAdapter({
            kitchenSinkMessages: this._kitchenSinkMessages,
            qnaPushNotification: this._qnaPushNotification,
            bannerManager: this.uiManager.banner,
            playerApi: {
                kalturaPlayer: this.player,
                eventManager: this.eventManager
            }
        });
        this._aoaAdapter.init();

        this._announcementAdapter = new AnnouncementsAdapter({
            kitchenSinkMessages: this._kitchenSinkMessages,
            qnaPushNotification: this._qnaPushNotification
        });
        this._announcementAdapter.init();

        this._chatMessagesAdapter = new ChatMessagesAdapter({
            kitchenSinkMessages: this._kitchenSinkMessages,
            qnaPushNotification: this._qnaPushNotification,
            config: this.getContribConfig()
        });
        this._chatMessagesAdapter.init();

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

    onRegisterUI(uiManager: UIManager): void {
        this._kitchenSinkItem = uiManager.kitchenSink.add({
            label: "Q&A",
            expandMode: KitchenSinkExpandModes.OverTheVideo,
            renderIcon: () => <MenuIcon />,
            position: KitchenSinkPositions.Right,
            renderContent: this._renderKitchenSinkContent
        });
    }

    _renderKitchenSinkContent = (props: KitchenSinkContentRendererProps) => {
        if (!this._kitchenSinkMessages) {
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
                onSubmit={
                    this._chatMessagesAdapter
                        ? this._chatMessagesAdapter.submitQuestion
                        : (text: string, thread?: QnaMessage) => {}
                }
            />
        );
    };
}

KalturaPlayer.core.registerPlugin(pluginName, QnaPlugin);
