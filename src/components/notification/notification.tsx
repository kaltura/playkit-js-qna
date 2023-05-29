import {Component, h, VNode} from 'preact';
import {QnaMessage, QnaMessageType} from '../../qnaMessageFactory';
import * as styles from './notification.scss';
import {TrimmedText} from '../trimmed-text';
import {TimeDisplay} from '../time-display';
import {MessageTheme} from '../../qna-plugin';
import {AnnouncementIcon} from './announcement-icon';
import {AoAIcon} from './aoa-icon';

const {Text} = KalturaPlayer.ui.preacti18n;

export interface NotificationProps {
  qnaMessage: QnaMessage;
  dateFormat: string;
  theme: MessageTheme;
}

export class Notification extends Component<NotificationProps> {
  render(props: NotificationProps) {
    const {qnaMessage, dateFormat} = this.props;
    const {backgroundColor} = this.props.theme;

    return (
      <div style={`background-color: ${backgroundColor};`} className={styles.notification} tabIndex={0}>
        <div className={styles.leftContainer}>
          <div className={styles.iconWrapper}>
            <div className={styles.iconImage}>
              {qnaMessage.type === QnaMessageType.Announcement && <AnnouncementIcon />}
              {qnaMessage.type === QnaMessageType.AnswerOnAir && <AoAIcon />}
            </div>
          </div>
        </div>

        <div className={styles.rightContainer}>
          <div className={styles.title}>{this.getTitle(qnaMessage.type)}</div>
          <div className={styles.messageContent}>
            <TrimmedText maxLength={120} text={qnaMessage.messageContent} />
          </div>
          <div className={styles.secondInfoLine}>
            <TimeDisplay className={styles.threadTime} time={qnaMessage.createdAt} dateFormat={dateFormat} />
          </div>
        </div>
      </div>
    );
  }

  private getTitle(messageType: string): VNode {
    return messageType === QnaMessageType.Announcement ? (
      <Text id="qna.announcement" plural={1}>
        Announcement
      </Text>
    ) : (
      <Text id="qna.someone_asks">Someone asks:</Text>
    );
  }
}
