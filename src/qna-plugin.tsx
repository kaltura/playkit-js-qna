import {h, ComponentChild} from 'preact';
import {getQnaUserId} from '@playkit-js/common/dist/utils-common/utils';
import {OnClickEvent} from '@playkit-js/common/dist/hoc/a11y-wrapper';
import {UpperBarManager, SidePanelsManager} from '@playkit-js/ui-managers';
import {KitchenSink} from './components/kitchen-sink';
import {QnaPluginButton} from './components/plugin-button';
import {QnaMessage} from './qnaMessageFactory';
import {AoaAdapter} from './aoaAdapter';
import {AnnouncementsAdapter} from './announcementsAdapter';
import {ChatMessagesAdapter} from './chatMessagesAdapter';
import {KitchenSinkPluginEventTypes, KitchenSinkMessages, MessagesUpdatedEvent} from './kitchenSinkMessages';
import {icons} from './components/icons';

import {PluginStates, QnaPluginConfig, TimedMetadataEvent, CuePoint, ModeratorSettings} from './types';
import {ui} from '@playkit-js/kaltura-player-js';
import {Utils} from './utils';
const {SidePanelModes, SidePanelPositions, ReservedPresetNames} = ui;

const {Text} = KalturaPlayer.ui.preacti18n;

type DisplayToastOptions = {text: string; icon: ComponentChild; severity: string};
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
  private _chatMessagesAdapter: ChatMessagesAdapter | undefined;
  private _kitchenSinkMessages: KitchenSinkMessages | undefined;
  private _showMenuIconIndication = false;
  private _toastsDuration: number = DefaultToastDuration;
  private _qnaSettings: ModeratorSettings = {
    createdAt: 0,
    qnaEnabled: true,
    announcementOnly: false
  };

  private _player: KalturaPlayerTypes.Player;
  private _pluginPanel = -1;
  private _pluginIcon = -1;
  private _pluginState: PluginStates | null = null;
  private _triggeredByKeyboard = false;
  private _pluginButtonRef: HTMLButtonElement | null = null;

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
  }

  get sidePanelsManager() {
    return this.player.getService('sidePanelsManager') as SidePanelsManager | undefined;
  }

  get upperBarManager() {
    return this.player.getService('upperBarManager') as UpperBarManager | undefined;
  }

  get cuePointManager() {
    return this._player.getService('kalturaCuepoints') as any;
  }

  get toastManager() {
    return this._player.getService('toastManager') as any;
  }

  get bannerManager() {
    return this._player.getService('bannerManager') as any;
  }

  static isValid(): boolean {
    return true;
  }

  init(): void {
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
      bannerManager: this.bannerManager,
      logger: this.logger,
      isKitchenSinkActive: this._isPluginActive,
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
      isKitchenSinkActive: this._isPluginActive,
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
      isKitchenSinkActive: this._isPluginActive,
      updateMenuIcon: this._updateMenuIcon,
      displayToast: this._displayToast,
      userId: getQnaUserId(this._player)
    });
    // register to kitchenSink updated qnaMessages array
    this._kitchenSinkMessages!.on(KitchenSinkPluginEventTypes.MessagesUpdatedEvent, this._onQnaMessage);
    this._delayedGiveUpLoading();
  }

  loadMedia(): void {
    if (!this.cuePointManager || !this.sidePanelsManager || !this.upperBarManager) {
      this.logger.warn("kalturaCuepoints, sidePanelsManager or upperBarManager haven't registered");
      return;
    }
    if (!this.player.isLive()) {
      this.logger.warn("QnA Plugin doesn't support non-live media");
      return;
    }

    this.init();
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
    this._createQnAPlugin();
    this._chatMessagesAdapter!.onMediaLoad(sources.id);
  }

  private _removeQnAPlugin = () => {
    if (Math.max(this._pluginPanel, this._pluginIcon) > 0) {
      this.sidePanelsManager!.remove(this._pluginPanel);
      this.upperBarManager!.remove(this._pluginIcon);
      this._pluginPanel = -1;
      this._pluginIcon = -1;
      this._pluginButtonRef = null;
    }
  };

  private _createQnAPlugin = () => {
    if (Math.max(this._pluginPanel, this._pluginIcon) > 0) {
      // plugin already added
      return;
    }
    this._pluginPanel = this.sidePanelsManager!.add({
      label: 'Q&A',
      panelComponent: () => {
        if (!this._kitchenSinkMessages) {
          return <div />;
        }
        const theme = this._getTheme();
        return (
          <KitchenSink
            onClose={this._handleClose}
            dateFormat={this.config.dateFormat}
            threads={this._threads}
            hasError={this._hasError}
            loading={this._loading}
            onSubmit={this._chatMessagesAdapter!.submitQuestion}
            onResend={this._chatMessagesAdapter!.resendQuestion}
            onMassageRead={this._chatMessagesAdapter!.onMessageRead}
            announcementsOnly={this._qnaSettings ? this._qnaSettings.announcementOnly : false}
            theme={theme}
            toggledByKeyboard={this._triggeredByKeyboard}
            kitchenSinkActive={this._isPluginActive()}
          />
        );
      },
      presets: [ReservedPresetNames.Playback, ReservedPresetNames.Live, ReservedPresetNames.Ads],
      position: this.config.position,
      expandMode: this.config.expandMode === SidePanelModes.ALONGSIDE ? SidePanelModes.ALONGSIDE : SidePanelModes.OVER,
      onDeactivate: this._deactivatePlugin
    }) as number;

    this._pluginIcon = this.upperBarManager!.add({
      label: 'Q&A',
      svgIcon: {path: icons.PLUGIN_ICON, viewBox: `0 0 ${icons.BigSize} ${icons.BigSize}`},
      onClick: this._handleClickOnPluginIcon as () => void,
      component: () => {
        return <QnaPluginButton showIndication={this._showMenuIconIndication} isActive={this._isPluginActive()} setRef={this._setPluginButtonRef} />;
      }
    }) as number;
  };

  private _handleClickOnPluginIcon = (e: OnClickEvent, byKeyboard?: boolean) => {
    if (this._isPluginActive()) {
      this._triggeredByKeyboard = false;
      this._deactivatePlugin();
    } else {
      this._activetePlugin();
      this._triggeredByKeyboard = Boolean(byKeyboard);
      this._updateMenuIcon(false);
    }
  };

  private _activetePlugin = () => {
    this.ready.then(() => {
      this.sidePanelsManager?.activateItem(this._pluginPanel);
      this._pluginState === PluginStates.OPENED;
      this.upperBarManager?.update(this._pluginIcon);
    });
  };

  private _deactivatePlugin = () => {
    this.ready.then(() => {
      this.sidePanelsManager?.deactivateItem(this._pluginPanel);
      this._pluginState = PluginStates.CLOSED;
      this.upperBarManager?.update(this._pluginIcon);
    });
  };

  private _isPluginActive = () => {
    return this.sidePanelsManager!.isItemActive(this._pluginPanel);
  };

  private _updateQnAPlugin = () => {
    if (this._pluginPanel > 0) {
      this.sidePanelsManager?.update(this._pluginPanel);
    }
  };

  private _setPluginButtonRef = (ref: HTMLButtonElement) => {
    this._pluginButtonRef = ref;
  };

  private _handleClose = (e: OnClickEvent, byKeyboard: boolean) => {
    if (byKeyboard) {
      this._pluginButtonRef?.focus();
    }
    this._deactivatePlugin();
  };

  reset(): void {
    this._triggeredByKeyboard = false;
    this._hasError = false;
    this._loading = true;
    this._threads = [];
    //reset managers
    this._kitchenSinkMessages?.reset();
    this._chatMessagesAdapter?.reset();
    this._removeQnAPlugin();
    this.eventManager.removeAll();
  }

  destroy(): void {
    this.reset();
    // destroy managers
    this._kitchenSinkMessages?.destroy();
    // remove kitchenSink listener
    this._kitchenSinkMessages?.off(KitchenSinkPluginEventTypes.MessagesUpdatedEvent, this._onQnaMessage);
  }

  private _addListeners(): void {
    this.eventManager.listen(this._player, this._player.Event.TIMED_METADATA_ADDED, this._onQnaSettings);
    this.eventManager.listen(this._player, this._player.Event.FIRST_PLAYING, () => {
      if ((this.config.expandOnFirstPlay && !this._pluginState) || this._pluginState === PluginStates.OPENED) {
        this._activetePlugin();
      }
    });
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
    if (this._qnaSettings.qnaEnabled) {
      this._createQnAPlugin();
      this._updateQnAPlugin();
    } else {
      this._removeQnAPlugin();
    }
  }

  private _activateKitchenSink = (): void => {
    if (this._pluginPanel > 0) {
      this.sidePanelsManager?.activateItem(this._pluginPanel);
    }
  };

  private _updateMenuIcon = (showIndication: boolean): void => {
    this._showMenuIconIndication = showIndication;
    this.upperBarManager?.update(this._pluginIcon);
  };

  private _displayToast = (options: DisplayToastOptions): void => {
    const {sources} = this._player.config;
    if (!sources || sources.type === this._player.MediaType.VOD) {
      return;
    }
    // display toast
    this.toastManager.add({
      title: (<Text id="qna.notifications">Notifications</Text>) as any,
      text: options.text,
      icon: options.icon,
      duration: this._toastsDuration,
      severity: options.severity || 'Info',
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
