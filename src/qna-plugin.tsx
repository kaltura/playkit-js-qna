import {h, ComponentChild} from 'preact';
import {ContribServices, ToastSeverity} from '@playkit-js/common';
import {KitchenSink} from './components/kitchen-sink';
import {QnaPluginButton} from './components/plugin-button';
import {QnaMessage} from './qnaMessageFactory';
import {AoaAdapter} from './aoaAdapter';
import {AnnouncementsAdapter} from './announcementsAdapter';
import {ChatMessagesAdapter} from './chatMessagesAdapter';
import {KitchenSinkPluginEventTypes, KitchenSinkMessages, MessagesUpdatedEvent} from './kitchenSinkMessages';

import {PluginStates, QnaPluginConfig, TimedMetadataEvent, CuePoint, ModeratorSettings} from './types';
import {ui} from 'kaltura-player-js';
import {Utils} from './utils';
const {useState} = KalturaPlayer.ui.preactHooks;
const {SidePanelModes, SidePanelPositions, ReservedPresetNames} = ui;

type DisplayToastOptions = {text: string; icon: ComponentChild; severity: ToastSeverity};
export type DisplayToast = (options: DisplayToastOptions) => void;

const DefaultToastDuration: number = 5 * 1000;
const MinToastDuration: number = 5 * 1000;

export interface QnaTheme {
  message: MessageTheme;
}

export interface MessageTheme {
  backgroundColor: string;
}

export class QnaPlugin extends KalturaPlayer.core.BasePlugin {
  private _threads: QnaMessage[] | [] = [];
  private _hasError: boolean = false;
  private _loading: boolean = true;
  private _chatMessagesAdapter: ChatMessagesAdapter;
  private _kitchenSinkMessages: KitchenSinkMessages;
  private _setShowMenuIconIndication = (value: boolean) => {};
  private _toastsDuration: number;
  private _qnaSettings: ModeratorSettings = {
    createdAt: 0,
    qnaEnabled: true,
    announcementOnly: false
  };

  private _player: KalturaPlayerTypes.Player;
  private _pluginPanel = null;
  private _pluginState: PluginStates | null = null;
  private _contribServices: ContribServices;

  static defaultConfig: QnaPluginConfig = {
    toastDuration: DefaultToastDuration,
    dateFormat: 'dd/mm/yyyy',
    position: SidePanelPositions.RIGHT,
    expandMode: SidePanelModes.ALONGSIDE,
    expandOnFirstPlay: false
  };

  public static readonly LOADING_TIME_END = 3000;

  constructor(name: string, player: KalturaPlayerTypes.Player, config: QnaPluginConfig) {
    super(name, player, config);
    this._player = player;
    this._contribServices = ContribServices.get({kalturaPlayer: this._player});
    this._toastsDuration =
      this.config.toastDuration && this.config.toastDuration >= MinToastDuration ? this.config.toastDuration : DefaultToastDuration;
    //adapters
    this._kitchenSinkMessages = new KitchenSinkMessages();
    // AoA
    new AoaAdapter({
      kitchenSinkMessages: this._kitchenSinkMessages,
      onCuesBecomeActive: (cb: (timedMetadata: TimedMetadataEvent) => void) => {
        this.eventManager.listen(this._player, this._player.Event.TIMED_METADATA_CHANGE, cb);
      },
      setDataListener: (cb: (timedMetadata: TimedMetadataEvent) => void) => {
        this.eventManager.listen(this._player, this._player.Event.TIMED_METADATA_ADDED, cb);
      },
      bannerManager: this._contribServices.bannerManager,
      logger: this.logger,
      isKitchenSinkActive: this._isKitchenSinkActive,
      updateMenuIcon: this._updateMenuIcon,
      displayToast: this._displayToast
    });
    // announcements
    new AnnouncementsAdapter({
      kitchenSinkMessages: this._kitchenSinkMessages,
      setDataListener: (cb: (timedMetadata: TimedMetadataEvent) => void) => {
        this.eventManager.listen(this._player, this._player.Event.TIMED_METADATA_ADDED, cb);
      },
      // TODO: move filterFn from AnnouncementsAdapter here
      isKitchenSinkActive: this._isKitchenSinkActive,
      updateMenuIcon: this._updateMenuIcon,
      displayToast: this._displayToast
    });
    // messages
    this._chatMessagesAdapter = new ChatMessagesAdapter({
      player: this._player,
      logger: this.logger,
      kitchenSinkMessages: this._kitchenSinkMessages,
      setDataListener: (cb: (timedMetadata: TimedMetadataEvent) => void) => {
        this.eventManager.listen(this._player, this._player.Event.TIMED_METADATA_ADDED, cb);
      },
      // TODO: move filterFn from ChatMessagesAdapter here
      isKitchenSinkActive: this._isKitchenSinkActive,
      updateMenuIcon: this._updateMenuIcon,
      displayToast: this._displayToast
    });
    // register to kitchenSink updated qnaMessages array
    this._kitchenSinkMessages.on(KitchenSinkPluginEventTypes.MessagesUpdatedEvent, this._onQnaMessage);
    this._initPluginManagers();
  }

  get sidePanelsManager() {
    return this._player.getService('sidePanelsManager') as any;
  }

  get cuePointManager() {
    return this._player.getService('kalturaCuepoints') as any;
  }

  // TODO: remove once contribServices migrated to BasePlugin
  getUIComponents(): any[] {
    return this._contribServices.register();
  }

  static isValid(): boolean {
    return true;
  }

  loadMedia(): void {
    if (!this.sidePanelsManager || !this.cuePointManager) {
      this.logger.warn("sidePanelsManager or cuePointManager haven't registered");
      return;
    }
    const {sources} = this._player.config;
    if (sources.type !== this._player.MediaType.LIVE) {
      this.logger.warn('Q&A notifications are not available during VOD');
      return;
    }
    this._addListeners();
    this.cuePointManager.registerTypes([
      this.cuePointManager.CuepointType.PUBLIC_QNA,
      this.cuePointManager.CuepointType.USER_QNA,
      this.cuePointManager.CuepointType.CODE_QNA
    ]);

    this._loading = true;
    this._hasError = false;
    this._createQnAPlugin();
    this._chatMessagesAdapter.onMediaLoad(sources.id);
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
        return (
          <KitchenSink
            onClose={() => {
              this.sidePanelsManager.deactivateItem(this._pluginPanel);
            }}
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
      expandMode: this.config.expandMode === SidePanelModes.ALONGSIDE ? SidePanelModes.ALONGSIDE : SidePanelModes.OVER,
      onActivate: () => {
        this._pluginState = PluginStates.OPENED;
        this._updateMenuIcon(false);
      }
    });
  };

  private _updateQnAPlugin = () => {
    if (this._pluginPanel) {
      this.sidePanelsManager.update(this._pluginPanel);
    }
  };

  private _shouldExpandOnFirstPlay = () => {
    return (this.config.expandOnFirstPlay && !this._pluginState) || this._pluginState === PluginStates.OPENED;
  };

  reset(): void {
    this._hasError = false;
    this._loading = true;
    this._threads = [];
    //reset managers
    this._kitchenSinkMessages.reset();
    this._chatMessagesAdapter.reset();
    this._pluginPanel = null;
    this.eventManager.removeAll();
    this._contribServices.reset();
  }

  destroy(): void {
    this._hasError = false;
    this._loading = true;
    this._threads = [];
    // destroy managers
    this._kitchenSinkMessages.destroy();
    // remove kitchenSink listener
    this._kitchenSinkMessages.off(KitchenSinkPluginEventTypes.MessagesUpdatedEvent, this._onQnaMessage);
  }

  private _addListeners(): void {
    this.eventManager.listen(this._player, this._player.Event.TIMED_METADATA_ADDED, this._onQnaSettings);
    this.eventManager.listen(this._player, this._player.Event.FIRST_PLAYING, () => {
      if (this._shouldExpandOnFirstPlay()) {
        this.ready.then(() => {
          this.sidePanelsManager.activateItem(this._pluginPanel);
        });
      }
    });
  }

  private _initPluginManagers(): void {
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

  private _onQnaSettings = ({payload}: TimedMetadataEvent): void => {
    const filterFn = (metadata: any) => metadata?.cuePointType === 'codeCuePoint.Code' && metadata?.tags === 'player-qna-settings-update';
    const qnaSettings: CuePoint[] = Utils.prepareCuePoints(payload.cues, filterFn);
    if (qnaSettings.length) {
      const newSettings = Utils.getLastSettingsObject(qnaSettings);
      if (newSettings) {
        // settings received are out of date
        if (this._qnaSettings.createdAt > newSettings.createdAt) {
          return;
        }
        this._qnaSettings = {...newSettings};
        this._handleQnaSettingsChange();
      }
    }
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
    this._contribServices.toastManager.add({
      title: 'Notifications',
      text: options.text,
      icon: options.icon,
      duration: this._toastsDuration,
      severity: options.severity || ToastSeverity.Info,
      onClick: this._activateKitchenSink
    });
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
