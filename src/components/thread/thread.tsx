import {Component, h} from 'preact';
import {A11yWrapper} from '@playkit-js/common/dist/hoc/a11y-wrapper';
import * as styles from './thread.scss';
import {MessageDeliveryStatus, QnaMessage, QnaMessageType} from '../../qnaMessageFactory';
import {TimeDisplay} from '../time-display';
import classNames from 'classnames';
import {TrimmedText} from '../trimmed-text';
import {AutoExpandTextArea} from '../auto-expand-text-area';
import {AnsweredOnAirIcon} from '../answered-on-air-icon';
import {MessageTheme} from '../../qna-plugin';
import {ResendIcon} from '../icons/resend-icon';
import {ReplyIcon} from '../icons/reply-icon';
import {DownIcon} from '../icons/down-icon';

const {Text, withText} = KalturaPlayer.ui.preacti18n;

const translates = ({thread: {replies}}: ThreadProps) => ({
  show_less: <Text id="qna.show_less">Show less</Text>,
  show_replies: <Text id="qna.show_replies">Show replies</Text>,
  reply_in_thread: <Text id="qna.reply_in_thread">Reply in thread</Text>,
  reply: <Text id="qna.reply">Reply</Text>,
  resend: <Text id="qna.resend">Resend</Text>,
  new_messages: <Text id="qna.new_messages">Thread contains new messages</Text>,
  sending: <Text id="qna.sending">Sending...</Text>,
  replies: (
    <Text
      id="qna.replies"
      plural={replies.length}
      fields={{
        count: replies.length
      }}>
      {replies.length + (replies.length === 1 ? ' Reply' : ' Replies')}
    </Text>
  )
});
interface Translates {
  show_less?: string;
  show_replies?: string;
  reply_in_thread?: string;
  reply?: string;
  resend?: string;
  new_messages?: string;
  sending?: string;
  replies?: string;
}

interface ThreadProps {
  thread: QnaMessage;
  dateFormat: string;
  onReply: (text: string, parentId: string | null) => void;
  onResend: (qnaMessage: QnaMessage, parentId: string | null) => void;
  onMassageRead: (id: string) => void;
  onHeightChange: () => void;
  announcementsOnly: boolean;
  theme: MessageTheme;
}

interface ThreadState {
  isThreadOpen: boolean;
  showInputText: boolean;
}

@withText(translates)
export class Thread extends Component<ThreadProps & Translates, ThreadState> {
  private _autoExpandTextAreaRef: AutoExpandTextArea | null = null;

  static defaultProps = {};

  state = {
    isThreadOpen: false,
    showInputText: false
  };

  handleOnShowMoreClick = () => {
    if (this.props.thread.unRead) {
      this.handleThreadClick();
    }
    this.setState({isThreadOpen: !this.state.isThreadOpen});
    this.props.onHeightChange();
  };

  handleOnReplyButtonClick = () => {
    this.setState({showInputText: !this.state.showInputText}, () => {
      if (this._autoExpandTextAreaRef && this.state.showInputText) {
        this._autoExpandTextAreaRef.focus();
      }
    });
    this.props.onHeightChange();
  };

  handleReply = (text: string) => {
    this.setState({showInputText: false, isThreadOpen: true}, () => {
      this.props.onReply(text, this.props.thread.id);
    });
    this.props.onHeightChange();
  };

  handleResend = (qnaMessage: QnaMessage) => {
    this.props.onResend(qnaMessage, qnaMessage.parentId);
  };

  private showTimeOrStatus(qnaMessage: QnaMessage, dateFormat: string) {
    switch (qnaMessage.deliveryStatus) {
      case MessageDeliveryStatus.SENDING:
        return <span className={styles.sendingIndication}>{this.props.sending}</span>;
      case MessageDeliveryStatus.SEND_FAILED:
        return (
          <A11yWrapper onClick={this.handleResend.bind(this, qnaMessage)}>
            <button className={classNames(styles.clearStyledButton, styles.resendButton)} aria-label={this.props.resend}>
              <span className={styles.resendTitle}>{this.props.resend}</span>
              <span className={styles.resendIcon}>
                <ResendIcon />
              </span>
            </button>
          </A11yWrapper>
        );
      default:
        return <TimeDisplay className={styles.threadTime} time={qnaMessage.createdAt} dateFormat={dateFormat} />;
    }
  }

  handleThreadClick = (): void => {
    this.props.onMassageRead(this.props.thread.id);
  };

  handleAutoExpandTextAreaFocusOut = () => {
    this.setState({showInputText: false});
    this.props.onHeightChange();
  };

  render() {
    const {thread, dateFormat} = this.props;
    const {replies} = thread;
    const {isThreadOpen, showInputText} = this.state;
    const {backgroundColor} = this.props.theme;

    const threadProps: Record<string, unknown> = {
      className: classNames(styles.thread, {
        [styles.unreadThread]: thread.unRead
      }),
      tabIndex: 0,
      role: 'listitem'
    };
    if (thread.unRead) {
      threadProps['aria-label'] = this.props.new_messages;
    }

    return (
      <div {...threadProps}>
        {
          /* if this master question will be answered on air - add an icon */
          thread.willBeAnsweredOnAir && (
            <div className={styles.aoaIconContainer}>
              <AnsweredOnAirIcon />
            </div>
          )
        }
        <div style={`background-color: ${backgroundColor};`} className={styles.messageContent}>
          <TrimmedText maxLength={120} text={thread.messageContent} />
        </div>

        <div
          style={`background-color: ${backgroundColor};`}
          className={classNames(styles.secondInfoLineContainer, {
            [styles.withReply]: replies.length > 0
          })}>
          <div className={styles.secondInfoLine}>
            {this.showTimeOrStatus(thread, dateFormat)}
            {
              /*    Show Number of Replies/Show Less button and thread time  */
              replies.length > 0 && (
                <A11yWrapper onClick={this.handleOnShowMoreClick}>
                  <button
                    className={styles.clearStyledButton}
                    aria-label={isThreadOpen ? this.props.show_less : this.props.show_replies}
                    tabIndex={0}>
                    <span
                      className={classNames(styles.numOfRepliesIcon, {
                        [styles.arrowLeft]: !isThreadOpen
                      })}>
                      <DownIcon />
                    </span>
                    <span className={styles.numOfReplies} aria-hidden={isThreadOpen}>
                      {isThreadOpen ? this.props.show_less : this.props.replies}
                    </span>
                  </button>
                </A11yWrapper>
              )
            }
          </div>
        </div>

        {
          /*    Replies Collapsed area  */
          isThreadOpen && (
            <div style={`background-color: ${backgroundColor};`} className={styles.collapsedArea}>
              {replies.map((reply: QnaMessage) => {
                return (
                  <div
                    key={reply.id}
                    className={classNames(styles.replyContainer, {
                      [styles.right]: reply.type === QnaMessageType.Question
                    })}>
                    <div>
                      <div
                        style={`background-color: ${backgroundColor};`}
                        className={classNames(styles.reply, {
                          [styles.autoReplay]: reply.isAoAAutoReply
                        })}>
                        {reply.type === QnaMessageType.Answer && <div className={styles.username}>{reply.userId}</div>}
                        <div className={styles.replyMessage}>
                          <TrimmedText maxLength={120} text={reply.messageContent} />
                        </div>
                      </div>
                      <div>{this.showTimeOrStatus(reply, dateFormat)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        }

        <div className={classNames({[styles.displayNone]: !showInputText})}>
          <AutoExpandTextArea
            ref={autoExpandTextAreaRef => (this._autoExpandTextAreaRef = autoExpandTextAreaRef)}
            onSubmit={this.handleReply}
            placeholder={this.props.reply}
            enableBlackInputTheme={true}
            initialFocus={true}
            alwaysOpen={true}
            disabled={thread.deliveryStatus !== MessageDeliveryStatus.CREATED}
            onFocusOut={this.handleAutoExpandTextAreaFocusOut}
          />
        </div>

        <div
          style={`background-color: ${backgroundColor};`}
          className={classNames(styles.lastInfoLine, {
            [styles.displayNone]: showInputText || this.props.announcementsOnly
          })}>
          <A11yWrapper onClick={this.handleOnReplyButtonClick}>
            <button className={styles.clearStyledButton} aria-label={this.props.reply_in_thread}>
              <span className={styles.replyIcon}>
                <ReplyIcon />
              </span>
              <span className={styles.replyText} aria-hidden="true">
                {this.props.reply}
              </span>
            </button>
          </A11yWrapper>
        </div>
      </div>
    );
  }
}
