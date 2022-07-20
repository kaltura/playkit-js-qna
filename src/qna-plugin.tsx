import {h, ComponentChild} from 'preact';
import {ToastSeverity} from '@playkit-js-contrib/ui';
import {KitchenSink} from './components/kitchen-sink';
import {QnaPluginButton} from './components/plugin-button';
import {QnaMessage} from './qnaMessageFactory';
import {KalturaLiveServices} from '@playkit-js-contrib/common';
import {PushNotificationEventTypes, QnaPushNotification, ModeratorSettings, SettingsNotificationsEvent} from './qnaPushNotification';
import {AoaAdapter} from './aoaAdapter';
import {AnnouncementsAdapter} from './announcementsAdapter';
import {ChatMessagesAdapter} from './chatMessagesAdapter';
import {KitchenSinkPluginEventTypes, KitchenSinkMessages, MessagesUpdatedEvent} from './kitchenSinkMessages';

import {PluginStates, QnaPluginConfig} from './types';
import {ui} from 'kaltura-player-js';
const {useState} = KalturaPlayer.ui.preactHooks;
const {SidePanelModes, SidePanelPositions, ReservedPresetNames} = ui;

type DisplayToastOptions = {text: string; icon: ComponentChild; severity: ToastSeverity};
export type DisplayToast = (options: DisplayToastOptions) => void;

const DefaultBannerDuration: number = 60 * 1000;
const DefaultToastDuration: number = 5 * 1000;
const MinBannerDuration: number = 5 * 1000;
const MinToastDuration: number = 5 * 1000;

export interface QnaTheme {
  message: MessageTheme;
}

export interface MessageTheme {
  backgroundColor: string;
}

enum UserRole {
  anonymousRole = 'anonymousRole',
  unmoderatedAdminRole = 'unmoderatedAdminRole'
}

const DefaultAnonymousPrefix = 'Guest';

export class QnaPlugin extends KalturaPlayer.core.BasePlugin {
  private _threads: QnaMessage[] | [] = [];
  private _hasError: boolean = false;
  private _loading: boolean = true;
  private _qnaPushNotification: QnaPushNotification;
  private _aoaAdapter: AoaAdapter;
  private _announcementAdapter: AnnouncementsAdapter;
  private _chatMessagesAdapter: ChatMessagesAdapter;
  private _kitchenSinkMessages: KitchenSinkMessages;
  private _setShowMenuIconIndication = (value: boolean) => {};
  private _toastsDuration: number;
  private _qnaSettings: ModeratorSettings = {
    createdAt: new Date(-8640000000000000), //oldest date
    qnaEnabled: true,
    announcementOnly: false
  };

  private _player: KalturaPlayerTypes.Player;
  private _pluginPanel = null;
  private _pluginState: PluginStates | null = null;

  static defaultConfig: QnaPluginConfig = {
    bannerDuration: DefaultBannerDuration,
    toastDuration: DefaultToastDuration,
    dateFormat: 'dd/mm/yyyy',
    position: SidePanelPositions.RIGHT,
    expandMode: SidePanelModes.ALONGSIDE,
    expandOnFirstPlay: false,
    userRole: UserRole.anonymousRole
  };

  public static readonly LOADING_TIME_END = 3000;

  constructor(name: string, player: KalturaPlayerTypes.Player, config: QnaPluginConfig) {
    super(name, player, config);
    this._player = player;
    let bannerDuration =
      this.config.bannerDuration && this.config.bannerDuration >= MinBannerDuration ? this.config.bannerDuration : DefaultBannerDuration;
    this._toastsDuration =
      this.config.toastDuration && this.config.toastDuration >= MinToastDuration ? this.config.toastDuration : DefaultToastDuration;
    //adapters
    this._qnaPushNotification = new QnaPushNotification(this._player);
    this._kitchenSinkMessages = new KitchenSinkMessages();
    this._aoaAdapter = new AoaAdapter({
      kitchenSinkMessages: this._kitchenSinkMessages,
      qnaPushNotification: this._qnaPushNotification,
      // bannerManager: this._contribServices.bannerManager, // TODO
      bannerManager: {
        add: (data: any) => console.log('>> bannerManager add ', data),
        remove: (data: any) => console.log('>> bannerManager remove ', data)
      } as any,
      kalturaPlayer: this._player as any,
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

    this._initPluginManagers();
  }

  get sidePanelsManager() {
    return this._player.getService('sidePanelsManager') as any;
  }

  static isValid(): boolean {
    return true;
  }

  loadMedia(): void {
    if (!this.sidePanelsManager) {
      this.logger.warn("sidePanelsManager haven't registered");
      return;
    }
    const {sources} = this._player.config;
    const userId = this.getUserId();
    this._loading = true;
    this._hasError = false;
    //Q&A kitchenSink and push notifications are not available during VOD
    if (sources.type !== this._player.MediaType.VOD) {
      this._createQnAPlugin();
      //push notification event handlers were set during pluginSetup,
      //on each media load we need to register for relevant entryId / userId notifications
      this._qnaPushNotification.registerToPushServer(sources.id, userId);
    }
    this._chatMessagesAdapter.onMediaLoad(userId, sources.id);
  }

  private _createQnAPlugin = () => {
    if (this._pluginPanel) {
      return;
    }
    this._pluginPanel = this.sidePanelsManager.addItem({
      label: 'Q&A',
      panelComponent: () => {
        if (!this._kitchenSinkMessages) {
          return <div />;
        }

        const theme = this._getTheme();
        const props: any = {};

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
            announcementsOnly={this._qnaSettings ? this._qnaSettings.announcementOnly : false}
            theme={theme}
          />
        );
      },
      iconComponent: ({isActive}: {isActive: boolean}) => {
        const [showMenuIconIndication, setShowMenuIconIndication] = useState(false);
        this._setShowMenuIconIndication = value => {
          setShowMenuIconIndication(value);
        };
        return (
          <QnaPluginButton
            showIndication={showMenuIconIndication}
            isActive={isActive}
            onClick={() => {
              if (this.sidePanelsManager.isItemActive(this._pluginPanel)) {
                this._pluginState = PluginStates.CLOSED;
                this.sidePanelsManager.deactivateItem(this._pluginPanel);
              } else {
                this.sidePanelsManager.activateItem(this._pluginPanel);
              }
            }}
          />
        );
      },
      presets: [ReservedPresetNames.Playback, ReservedPresetNames.Live, ReservedPresetNames.Ads],
      position: this.config.position,
      expandMode: this.config.expandMode,
      onActivate: () => {
        this._pluginState = PluginStates.OPENED;
        this._updateMenuIcon(false);
      }
    });

    if (this._shouldExpandOnFirstPlay()) {
      this.ready.then(() => {
        this.sidePanelsManager.activateItem(this._pluginPanel);
      });
    }
  };

  private _updateQnAPlugin = () => {
    if (this._pluginPanel) {
      this.sidePanelsManager.update(this._pluginPanel);
    }
  };

  private _shouldExpandOnFirstPlay = () => {
    return (this.config.expandOnFirstPlay && !this._pluginState) || this._pluginState === PluginStates.OPENED;
  };

  private getUserId(): string {
    const {session} = this._player.config;
    // @ts-ignore
    if (this.config.userRole === UserRole.anonymousRole || !session.userId) {
      // @ts-ignore
      return KalturaLiveServices.getAnonymousUserId(session.userId || DefaultAnonymousPrefix);
    }
    // @ts-ignore
    return session.userId;
  }

  reset(): void {
    this._hasError = false;
    this._loading = true;
    this._threads = [];
    //reset managers
    this._qnaPushNotification.reset();
    this._aoaAdapter.reset();
    this._kitchenSinkMessages.reset();
    this._chatMessagesAdapter.reset();
    this._pluginPanel = null;
  }

  destroy(): void {
    this._hasError = false;
    this._loading = true;
    this._threads = [];
    //destroy managers
    this._qnaPushNotification.off(PushNotificationEventTypes.PushNotificationsError, this._onQnaError);
    this._qnaPushNotification.off(PushNotificationEventTypes.CodeNotifications, this._onQnaSettings);
    this._qnaPushNotification.destroy();
    this._aoaAdapter.destroy();
    this._announcementAdapter.destroy();
    this._chatMessagesAdapter.destroy();
    this._kitchenSinkMessages.destroy();
    //remove listeners
    this._kitchenSinkMessages.off(KitchenSinkPluginEventTypes.MessagesUpdatedEvent, this._onQnaMessage);
  }

  private _constructPluginListener(): void {
    this._qnaPushNotification.on(PushNotificationEventTypes.PushNotificationsError, this._onQnaError);
    this._qnaPushNotification.on(PushNotificationEventTypes.CodeNotifications, this._onQnaSettings);
    //register to kitchenSink updated qnaMessages array
    this._kitchenSinkMessages.on(KitchenSinkPluginEventTypes.MessagesUpdatedEvent, this._onQnaMessage);
  }

  private _initPluginManagers(): void {
    const ks = this._player.config.provider.ks;
    if (!ks) {
      // logger.warn('Warn: Q&A Failed to initialize.' +
      //   'Failed to retrieve ks from configuration ' +
      //   '(both providers and session objects returned with an undefined KS),' +
      //   ' please check your configuration file.', {
      //   method: '_initPluginManagers'
      // });
      return;
    }

    const {provider} = this._player.config;
    // should be created once on pluginSetup (entryId/userId registration will be called onMediaLoad)
    this._qnaPushNotification.init({
      ks: ks,
      serviceUrl: provider.env.serviceUrl,
      clientTag: 'QnaPlugin_V7',
      kalturaPlayer: this._player
    });
    this._aoaAdapter.init();
    this._announcementAdapter.init();
    this._chatMessagesAdapter.init(ks, provider.env.serviceUrl);
    this._delayedGiveUpLoading();
  }

  private _delayedGiveUpLoading() {
    setTimeout(() => {
      this._loading = false;
      this._updateQnAPlugin();
    }, QnaPlugin.LOADING_TIME_END);
  }

  private _onQnaMessage = ({messages}: MessagesUpdatedEvent) => {
    this._hasError = false;
    this._loading = false;
    this._threads = messages;
    this._updateQnAPlugin();
  };

  private _onQnaError = () => {
    this._loading = false;
    this._hasError = true;
    this._updateQnAPlugin();
  };

  private _onQnaSettings = ({settings}: SettingsNotificationsEvent): void => {
    // settings received are out of date
    if (this._qnaSettings.createdAt.getTime() > settings.createdAt.getTime()) return;
    this._qnaSettings = {...settings};
    this._handleQnaSettingsChange();
  };

  private _handleQnaSettingsChange(): void {
    //remove kitchenSink
    if (this._pluginPanel && !this._qnaSettings.qnaEnabled) {
      this.sidePanelsManager.removeItem(this._pluginPanel);
      this._pluginPanel = null;
    }
    //add kitchenSink
    if (!this._pluginPanel && this._qnaSettings.qnaEnabled) {
      this._createQnAPlugin();
    }

    this._updateQnAPlugin();
  }

  private _isKitchenSinkActive = (): boolean => {
    if (!this._pluginPanel) return false;
    return this.sidePanelsManager.isItemActive(this._pluginPanel);
  };

  private _activateKitchenSink = (): void => {
    if (this._pluginPanel) {
      this.sidePanelsManager.activateItem(this._pluginPanel);
    }
  };

  private _updateMenuIcon = (showIndication: boolean): void => {
    this._setShowMenuIconIndication(showIndication);
  };

  private _displayToast = (options: DisplayToastOptions): void => {
    const {sources} = this._player.config;
    if (!sources || sources.type === this._player.MediaType.VOD) {
      return;
    }
    // display toast
    console.log('>> display toast');
    // this._contribServices.toastManager.add({
    //   title: 'Notifications',
    //   text: options.text,
    //   icon: options.icon,
    //   duration: this._toastsDuration,
    //   severity: options.severity || ToastSeverity.Info,
    //   onClick: this._activateKitchenSink
    // });
  };

  private _getTheme(): QnaTheme {
    switch (this.config.expandMode) {
      case SidePanelModes.ALONGSIDE:
        return {message: {backgroundColor: 'rgba(255,255,255, 0.24)'}};
      default:
        return {message: {backgroundColor: 'rgba(255,255,255, 0.16)'}};
    }
  }
}
