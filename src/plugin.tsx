import { ComponentChild, h } from "preact";
import {
  KitchenSinkContentRendererProps,
  KitchenSinkExpandModes,
  KitchenSinkItem,
  KitchenSinkPositions,
  ToastSeverity,
  ManagedComponent,
  KitchenSinkEventTypes,
  ItemActiveStateChangeEvent
} from "@playkit-js-contrib/ui";
import {
  ContribPluginManager,
  CorePlugin,
  OnMediaLoad,
  OnMediaUnload,
  OnPluginSetup,

  ContribServices,
  ContribPluginData,
  ContribPluginConfigs
} from "@playkit-js-contrib/plugin";
import { KitchenSink } from "./components/kitchen-sink";
import { MenuIcon } from "./components/menu-icon";
import { QnaMessage } from "./qnaMessageFactory";
import { getContribLogger, KalturaLiveServices } from "@playkit-js-contrib/common";
import {
  PushNotificationEventTypes,
  QnaPushNotification,
  ModeratorSettings,
  SettingsNotificationsEvent
} from "./qnaPushNotification";
import { AoaAdapter } from "./aoaAdapter";
import { AnnouncementsAdapter } from "./announcementsAdapter";
import { ChatMessagesAdapter } from "./chatMessagesAdapter";
import {
  KitchenSinkPluginEventTypes,
  KitchenSinkMessages,
  MessagesUpdatedEvent
} from "./kitchenSinkMessages";

export type DisplayToast = (options: {
  text: string;
  icon: ComponentChild;
  severity: ToastSeverity;
}) => void;

const pluginName = `qna`;
const DefaultBannerDuration: number = 60 * 1000;
const DefaultToastDuration: number = 5 * 1000;
const MinBannerDuration: number = 5 * 1000;
const MinToastDuration: number = 5 * 1000;

const logger = getContribLogger({
  class: "QnaPlugin",
  module: "qna-plugin"
});

interface QnaPluginConfig {
  bannerDuration: number;
  toastDuration: number;
  dateFormat: string;
  expandMode: KitchenSinkExpandModes;
  expandOnFirstPlay: boolean;
  userRole: string;
}

export interface QnaTheme {
  message: MessageTheme;
}

export interface MessageTheme {
  backgroundColor: string;
}

enum UserRole {
  anonymousRole = "anonymousRole",
  unmoderatedAdminRole = "unmoderatedAdminRole"
}

const DefaultAnonymousPrefix = 'Guest';

export class QnaPlugin implements OnMediaLoad, OnPluginSetup, OnMediaUnload {
  private _kitchenSinkItem: KitchenSinkItem | null = null;
  private _threads: QnaMessage[] | [] = [];
  private _hasError: boolean = false;
  private _loading: boolean = true;
  private _qnaPushNotification: QnaPushNotification;
  private _aoaAdapter: AoaAdapter;
  private _announcementAdapter: AnnouncementsAdapter;
  private _chatMessagesAdapter: ChatMessagesAdapter;
  private _kitchenSinkMessages: KitchenSinkMessages;
  private _showMenuIconIndication: boolean = false;
  private _menuIconRef: ManagedComponent | null = null;
  private _toastsDuration: number;
  private _qnaSettings: ModeratorSettings = {
    createdAt: new Date(-8640000000000000), //oldest date
    qnaEnabled: true,
    announcementOnly: false
  };

  public static readonly LOADING_TIME_END = 3000;

  constructor(
    private _corePlugin: CorePlugin,
    private _contribServices: ContribServices,
    private _configs: ContribPluginConfigs<QnaPluginConfig>
  ) {
    let bannerDuration =
      this._corePlugin.config.bannerDuration &&
      this._corePlugin.config.bannerDuration >= MinBannerDuration
        ? this._corePlugin.config.bannerDuration
        : DefaultBannerDuration;
    this._toastsDuration =
      this._corePlugin.config.toastDuration &&
      this._corePlugin.config.toastDuration >= MinToastDuration
        ? this._corePlugin.config.toastDuration
        : DefaultToastDuration;
    //adapters
    this._qnaPushNotification = new QnaPushNotification(this._corePlugin.player);
    this._kitchenSinkMessages = new KitchenSinkMessages({
      kitchenSinkManager: this._contribServices.kitchenSinkManager
    });
    this._aoaAdapter = new AoaAdapter({
      kitchenSinkMessages: this._kitchenSinkMessages,
      qnaPushNotification: this._qnaPushNotification,
      bannerManager: this._contribServices.bannerManager,
      kalturaPlayer: this._corePlugin.player as any,
      delayedEndTime: bannerDuration,
      isKitchenSinkActive: this._isKitchenSinkActive,
      updateMenuIcon: this._updateMenuIcon,
      displayToast: this._displayToast
    });
    this._announcementAdapter = new AnnouncementsAdapter({
      kitchenSinkMessages: this._kitchenSinkMessages,
      qnaPushNotification: this._qnaPushNotification,
      isKitchenSinkActive: this._isKitchenSinkActive,
      updateMenuIcon: this._updateMenuIcon,
      displayToast: this._displayToast
    });
    this._chatMessagesAdapter = new ChatMessagesAdapter({
      kitchenSinkMessages: this._kitchenSinkMessages,
      qnaPushNotification: this._qnaPushNotification,
      isKitchenSinkActive: this._isKitchenSinkActive,
      updateMenuIcon: this._updateMenuIcon,
      displayToast: this._displayToast
    });
    //listeners
    this._constructPluginListener();
  }

  onPluginSetup(): void {
    this._initPluginManagers();
  }

  onMediaLoad(): void {
    const {
      playerConfig: { sources }
    } = this._configs;
    const userId = this.getUserId();
    this._loading = true;
    this._hasError = false;
    //Q&A kitchenSink and push notifications are not available during VOD
    if (sources.type !== ("Vod" as any)) {
      this._addKitchenSinkItem();
      //push notification event handlers were set during pluginSetup,
      //on each media load we need to register for relevant entryId / userId notifications
      this._qnaPushNotification.registerToPushServer(sources.id, userId);
    }
    this._chatMessagesAdapter.onMediaLoad(userId, sources.id);
  }

  private _addKitchenSinkItem(): void {
    // todo [sakal] allow usage of KalturaPlayerTypes.PlayerConfig.EntryTypes.Vod
    const expandMode = this._parseExpandMode(this._corePlugin.config.expandMode);
    this._kitchenSinkItem = this._contribServices.kitchenSinkManager.add({
      label: "Q&A",
      expandMode: expandMode,
      renderIcon: this._renderMenuIcon,
      position: KitchenSinkPositions.Right,
      renderContent: this._renderKitchenSinkContent
    });

    if (this._corePlugin.config.expandOnFirstPlay) {
      this._kitchenSinkItem.activate();
    }
  }

  private getUserId(): string {
    const { session } = this._configs.playerConfig;

    if (this._corePlugin.config.userRole === UserRole.anonymousRole || !session.userId) {
      return KalturaLiveServices.getAnonymousUserId(session.userId || DefaultAnonymousPrefix);
    }

    return session.userId;
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
    //todo [sa] remove kitchenSink item
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
    this._qnaPushNotification.off(
      PushNotificationEventTypes.CodeNotifications,
      this._onQnaSettings
    );
    this._qnaPushNotification.destroy();
    this._aoaAdapter.destroy();
    this._announcementAdapter.destroy();
    this._chatMessagesAdapter.destroy();
    this._kitchenSinkMessages.destroy();
    //remove listeners
    this._kitchenSinkMessages.off(
      KitchenSinkPluginEventTypes.MessagesUpdatedEvent,
      this._onQnaMessage
    );
    this._contribServices.kitchenSinkManager.off(
      KitchenSinkEventTypes.ItemActiveStateChangeEvent,
      this._onKitchenSinkStateChange
    );
  }

  private _constructPluginListener(): void {
    this._qnaPushNotification.on(
      PushNotificationEventTypes.PushNotificationsError,
      this._onQnaError
    );
    this._qnaPushNotification.on(
      PushNotificationEventTypes.CodeNotifications,
      this._onQnaSettings
    );
    //register to kitchenSink updated qnaMessages array
    this._kitchenSinkMessages.on(
      KitchenSinkPluginEventTypes.MessagesUpdatedEvent,
      this._onQnaMessage
    );
    this._contribServices.kitchenSinkManager.on(
      KitchenSinkEventTypes.ItemActiveStateChangeEvent,
      this._onKitchenSinkStateChange
    );
  }

  private _initPluginManagers(): void {
    const ks = this._contribServices.getPlayerKS();
    if(!ks) {
      logger.warn('Warn: Q&A Failed to initialize.' +
        'Failed to retrieve ks from configuration ' +
        '(both providers and session objects returned with an undefined KS),' +
        ' please check your configuration file.', {
        method: '_initPluginManagers'
      });
      return;
    }

    const { playerConfig: { provider } } = this._configs;
    // should be created once on pluginSetup (entryId/userId registration will be called onMediaLoad)
    this._qnaPushNotification.init({
      ks: ks,
      serviceUrl: provider.env.serviceUrl,
      clientTag: "QnaPlugin_V7",
      kalturaPlayer: this._corePlugin.player
    });
    this._aoaAdapter.init();
    this._announcementAdapter.init();
    this._chatMessagesAdapter.init(ks, provider.env.serviceUrl);
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

  private _onQnaSettings = ({ settings }: SettingsNotificationsEvent): void => {
    // settings received are out of date
    if (this._qnaSettings.createdAt.getTime() > settings.createdAt.getTime())
      return;
    this._qnaSettings = { ...settings };
    this._handleQnaSettingsChange();
  };

  private _handleQnaSettingsChange(): void {
    //remove kitchenSink
    if(this._kitchenSinkItem && !this._qnaSettings.qnaEnabled) {
      this._contribServices.kitchenSinkManager.remove(this._kitchenSinkItem);
      this._kitchenSinkItem = null;
    }
    //add kitchenSink
    if(!this._kitchenSinkItem && this._qnaSettings.qnaEnabled) {
      this._addKitchenSinkItem();
    }

    this._updateKitchenSink();
  }

  private _isKitchenSinkActive = (): boolean => {
    if (!this._kitchenSinkItem) return false;
    return this._kitchenSinkItem.isActive();
  };

  private _activateKitchenSink = (): void => {
    if (this._kitchenSinkItem) {
      this._kitchenSinkItem.activate();
    }
  };

  private _updateMenuIcon = (showIndication: boolean): void => {
    this._showMenuIconIndication = showIndication;
    if (this._menuIconRef) {
      this._menuIconRef.update();
    }
  };

  private _onKitchenSinkStateChange = ({ item }: ItemActiveStateChangeEvent) => {
    if (!this._kitchenSinkItem || this._kitchenSinkItem !== item) return;
    this._updateMenuIcon(false);
  };

  private _parseExpandMode(value: string): KitchenSinkExpandModes {
    switch (value) {
      case "AlongSideTheVideo":
        return KitchenSinkExpandModes.AlongSideTheVideo;
      default:
        return KitchenSinkExpandModes.OverTheVideo;
    }
  }

  private _displayToast = (options: {
    text: string;
    icon: ComponentChild;
    severity: ToastSeverity;
  }): void => {
    const {
      playerConfig: { sources }
    } = this._configs;
    // todo [sakal] allow usage of KalturaPlayerTypes.PlayerConfig.EntryTypes.Vod
    if (!sources || sources.type === ("Vod" as any)) return;
    //display toast
    this._contribServices.toastManager.add({
      title: "Notifications",
      text: options.text,
      icon: options.icon,
      duration: this._toastsDuration,
      severity: options.severity || ToastSeverity.Info,
      onClick: this._activateKitchenSink
    });
  };



  private _renderMenuIcon = (): ComponentChild => {
    return (
      <ManagedComponent
        label={"qna-menu-icon"}
        renderChildren={() => <MenuIcon showIndication={this._showMenuIconIndication} />}
        isShown={() => true}
        ref={ref => (this._menuIconRef = ref)}
      />
    );
  };

  _renderKitchenSinkContent = (props: KitchenSinkContentRendererProps) => {
    if (!this._kitchenSinkMessages) {
      return <div />;
    }

    const theme = this._getTheme();

    return (
      <KitchenSink
        {...props}
        dateFormat={this._corePlugin.config.dateFormat}
        threads={this._threads}
        hasError={this._hasError}
        loading={this._loading}
        onSubmit={this._chatMessagesAdapter.submitQuestion}
        onResend={this._chatMessagesAdapter.resendQuestion}
        onMassageRead={this._chatMessagesAdapter.onMessageRead}
        announcementsOnly={this._qnaSettings ? this._qnaSettings.announcementOnly : false}
        theme={theme}
      />
    );
  };

  private _getTheme(): QnaTheme {
    const expandMode = this._parseExpandMode(this._corePlugin.config.expandMode);

    switch (expandMode) {
      case KitchenSinkExpandModes.AlongSideTheVideo:
        return { message: { backgroundColor: "rgba(255,255,255, 0.24)" } };
      default:
        return { message: { backgroundColor: "rgba(255,255,255, 0.16)" } };
    }
  }
}

ContribPluginManager.registerPlugin(
  "qna",
  (data: ContribPluginData<QnaPluginConfig>) => {
    return new QnaPlugin(data.corePlugin, data.contribServices, data.configs);
  },
  {
    defaultConfig: {
      bannerDuration: DefaultBannerDuration,
      toastDuration: DefaultToastDuration,
      dateFormat: "dd/mm/yyyy",
      expandMode: KitchenSinkExpandModes.OverTheVideo,
      expandOnFirstPlay: false,
      userRole: UserRole.anonymousRole
    }
  }
);
