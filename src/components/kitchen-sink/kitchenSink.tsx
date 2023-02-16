import {Component, h} from 'preact';
import {A11yWrapper, OnClick} from '@playkit-js/common';
import * as styles from './kitchenSink.scss';
import {QnaMessage, QnaMessageType} from '../../qnaMessageFactory';
import {Thread} from '../thread';
import {Spinner} from '../spinner';
import {AutoExpandTextArea} from '../auto-expand-text-area';
import {Notification} from '../notification';
import {ScrollDownButton} from '../scroll-down-button';
import classNames from 'classnames';
import {QnaTheme} from '../../qna-plugin';
import {CloseIcon} from '../icons/close-icon';
import {WhoopseErrorIcon} from '../icons/whoopse-error';
import {NoAnnouncementsYetImage} from '../icons/no-announcements';
import {NoQuestionsYetImage} from '../icons/no-questions';

const {KeyMap} = KalturaPlayer.ui.utils;

export interface KitchenSinkProps {
  onClose: OnClick;
  threads: QnaMessage[];
  dateFormat: string;
  hasError: boolean;
  loading: boolean;
  onSubmit: (text: string, parentId: string | null) => void;
  onResend: (qnaMessage: QnaMessage, parentId: string | null) => void;
  onMassageRead: (id: string) => void;
  announcementsOnly: boolean;
  theme: QnaTheme;
  toggledByKeyboard: boolean;
  kitchenSinkActive: boolean;
}

interface KitchenSinkState {}

export class KitchenSink extends Component<KitchenSinkProps, KitchenSinkState> {
  // Default values only when values not been sent.
  static defaultProps = {
    hasError: false,
    loading: false,
    onSubmit: (text: string, parentId: string | null) => {},
    OnResend: (qnaMessage: QnaMessage, parentId: string | null) => {}
  };

  state = {
    autoScroll: true
  };

  private _closeButtonRef: HTMLButtonElement | null = null;
  private _messagesEnd: any;
  private _scrollingTimeoutId: any = null;
  private _animationInterval: any = null;

  componentDidMount() {
    this._scrollToBottom();
  }

  componentDidUpdate(previousProps: KitchenSinkProps) {
    if (this.state.autoScroll) {
      this._scrollToBottom();
    }
    if (!previousProps.kitchenSinkActive && this.props.kitchenSinkActive && this.props.toggledByKeyboard) {
      this._closeButtonRef?.focus();
    }
  }

  private _handleOnSubmit = (text: string, parentId?: string | null) => {
    this.props.onSubmit(text, parentId ? parentId : null);
  };

  handleOnResend = (qnaMessage: QnaMessage, parentId: string | null) => {
    this.props.onResend(qnaMessage, parentId);
  };

  private _getCurrentScrollPosition = () => {
    // we should round down value to avoid inconsistent result when browser zoom is active
    const rounded = Math.floor(this._messagesEnd.scrollHeight - this._messagesEnd.scrollTop);
    // current scroll position should not be more than clientHeight to avoid "pin to bottom" effect
    return rounded < this._messagesEnd.clientHeight ? this._messagesEnd.clientHeight : rounded;
  };

  private _scrollToBottom = () => {
    clearInterval(this._animationInterval);
    if (this._messagesEnd) {
      this._animationInterval = setInterval(() => {
        // check if ref still exists during intervals and test if scroll ended
        if (this._messagesEnd && this._messagesEnd.clientHeight >= this._getCurrentScrollPosition()) {
          clearInterval(this._animationInterval);
          this._messagesEnd.scrollTop = this._messagesEnd.scrollHeight;
          // again check ref still exists during intervals
        } else if (this._messagesEnd) {
          this._messagesEnd.scrollTop += 30;
        }
      }, 20);
    }
  };

  private _trackScrolling = () => {
    clearTimeout(this._scrollingTimeoutId);
    this._scrollingTimeoutId = setTimeout(() => {
      this.setState({autoScroll: this._isBottom()});
    });
  };

  private _isBottom(): boolean {
    return this._messagesEnd && this._getCurrentScrollPosition() <= this._messagesEnd.clientHeight;
  }

  private _handleTextAreaFocusIn = (): void => {
    if (this.state.autoScroll) {
      this._scrollToBottom();
    }
    this._trackScrolling();
  };

  private _generateContent(props: KitchenSinkProps) {
    if (props.loading) {
      return <Spinner />;
    } else if (props.hasError || props.threads.length === 0) {
      return (
        <div className={styles.noQuestionWrapper}>
          <div className={styles.emptyListImgProperties}>
            {props.hasError ? <WhoopseErrorIcon /> : props.announcementsOnly ? <NoAnnouncementsYetImage /> : <NoQuestionsYetImage />}
          </div>
          <div className={styles.emptyListTitle}>
            {props.hasError ? 'Whoops!' : `No ${props.announcementsOnly ? 'Announcements' : 'Questions'} Yet`}
          </div>
          <div className={styles.emptyListSubTitle}>
            {props.hasError
              ? 'We couldn’t retrieve your messages. Please try again later'
              : props.announcementsOnly
              ? ''
              : `Type your first question below`}
          </div>
        </div>
      );
    } else {
      const messageTheme = this.props.theme.message;

      return props.threads.map((qnaMessage: QnaMessage) => {
        if (qnaMessage.type === QnaMessageType.Announcement || qnaMessage.type === QnaMessageType.AnswerOnAir) {
          return <Notification qnaMessage={qnaMessage} dateFormat={props.dateFormat} key={qnaMessage.id} theme={messageTheme} />;
        } else {
          return (
            <Thread
              thread={qnaMessage}
              dateFormat={props.dateFormat}
              key={qnaMessage.pendingMessageId || qnaMessage.id}
              onReply={this._handleOnSubmit}
              onResend={this.handleOnResend}
              onMassageRead={props.onMassageRead}
              onHeightChange={this._trackScrolling}
              announcementsOnly={props.announcementsOnly}
              theme={messageTheme}
            />
          );
        }
      });
    }
  }

  private _handleClose = (event: KeyboardEvent) => {
    if (event.keyCode === KeyMap.ESC) {
      this.props.onClose(event, true);
    }
  };

  render(props: KitchenSinkProps, state: any) {
    const {onClose} = props;
    let renderedContent = this._generateContent(props);

    return (
      <div className={styles.root} aria-live="polite" onKeyUp={this._handleClose}>
        {/* header */}
        <div className={styles.headerContainer}>
          <div className={styles.header}>
            <div className={styles.title}>{props.announcementsOnly ? 'Announcements' : 'Q&A'}</div>
            <A11yWrapper onClick={onClose}>
              <button
                className={styles.closeButton}
                aria-label={'Hide QnA'}
                tabIndex={0}
                ref={node => {
                  this._closeButtonRef = node;
                }}>
                <CloseIcon />
              </button>
            </A11yWrapper>
          </div>
        </div>

        {/* body */}
        <div
          className={` ${styles.flexibleMain}
                                ${(props.loading || props.hasError || props.threads.length === 0) && styles.noContent} 
                            `}
          ref={el => {
            this._messagesEnd = el;
          }}
          onScroll={this._trackScrolling}>
          {renderedContent}

          <div className={styles.messagesEndAnchor} />
        </div>

        {/* footer */}
        {!props.hasError && (
          <div className={styles.footer}>
            <div
              className={classNames(styles.scrollDownButton, {
                [styles.scrollDownButtonHidden]: state.autoScroll,
                [styles.scrollDownButtonHiddenAnnouncementOnly]: state.autoScroll && props.announcementsOnly
              })}>
              <ScrollDownButton onClick={this._scrollToBottom} />
            </div>
            {!props.announcementsOnly && (
              <AutoExpandTextArea
                onSubmit={this._handleOnSubmit}
                placeholder={'Type a private question'}
                enableAnimation={true}
                onFocusIn={this._handleTextAreaFocusIn}
                onFocusOut={this._trackScrolling}
              />
            )}
          </div>
        )}
      </div>
    );
  }
}
