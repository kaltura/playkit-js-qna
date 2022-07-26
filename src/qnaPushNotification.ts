import {EventsManager} from '@playkit-js-contrib/common';
import {
  PrepareRegisterRequestConfig,
  PushNotifications,
  PushNotificationsOptions,
  PushNotificationsProvider
} from '@playkit-js-contrib/push-notifications';
import {QnaMessage} from './qnaMessageFactory';
import {Utils} from './utils';

export enum PushNotificationEventTypes {
  PublicNotifications = 'PUBLIC_QNA_NOTIFICATIONS'
}

export interface PublicQnaNotificationsEvent {
  type: PushNotificationEventTypes.PublicNotifications;
  qnaMessages: QnaMessage[];
}

/**
 * handles push notification registration and results.
 */
export class QnaPushNotification {
  private _pushServerInstance: PushNotifications | null = null;

  private _registeredToQnaMessages = false;

  private _events: EventsManager<PublicQnaNotificationsEvent> = new EventsManager<PublicQnaNotificationsEvent>();

  private _initialized = false;

  on: EventsManager<PublicQnaNotificationsEvent>['on'] = this._events.on.bind(this._events);
  off: EventsManager<PublicQnaNotificationsEvent>['off'] = this._events.off.bind(this._events);

  constructor(private _player: KalturaPlayerTypes.Player) {}

  public init(pushServerOptions: PushNotificationsOptions) {
    if (this._initialized) return;

    this._initialized = true;
    this._pushServerInstance = PushNotificationsProvider.get(this._player, pushServerOptions);
  }

  /**
   * should be called on mediaUnload
   */
  public reset() {
    //todo [sa] once implemented - unregister from current entryId / userId push-notifications on mediaUnload
    this._registeredToQnaMessages = false;
  }

  /**
   * should be called on pluginDestroy
   */
  public destroy() {
    //todo [sa] once implemented better - add destroy method to kill push-server etc...
  }

  /**
   * registering push server notifications for retrieving user/public qna messages for current entry id and userId
   * note: should be registered on mediaLoad to get relevant notification data.
   * @param entryId
   * @param userId
   */
  public registerToPushServer(entryId: string, userId: string) {
    if (this._registeredToQnaMessages) {
      throw new Error('Already register to push server');
    }
    if (!this._pushServerInstance) {
      return;
    }

    let registrationConfigs = [
      this._createPublicQnaRegistration(entryId) // notifications objects
    ]; // user related QnA objects

    this._pushServerInstance
      .registerNotifications({
        prepareRegisterRequestConfigs: registrationConfigs,
        onSocketReconnect: () => {}
      })
      .then(
        () => {
          this._registeredToQnaMessages = true;
        },
        (err: any) => {}
      );
  }

  private _createPublicQnaRegistration(entryId: string): PrepareRegisterRequestConfig {
    return {
      eventName: PushNotificationEventTypes.PublicNotifications,
      eventParams: {
        entryId: entryId
      },
      onMessage: (response: any[]) => {
        this._events.emit({
          type: PushNotificationEventTypes.PublicNotifications,
          qnaMessages: Utils.createQnaMessagesArray(response)
        });
      }
    };
  }
}
