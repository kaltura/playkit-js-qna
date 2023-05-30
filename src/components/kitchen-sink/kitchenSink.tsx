import {Component, h} from 'preact';
import {A11yWrapper, OnClick} from '@playkit-js/common/dist/hoc/a11y-wrapper';
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
const {withText, Text} = KalturaPlayer.ui.preacti18n;

const translates = {
  announcementsLabel: (
    <Text id="qna.announcement" plural={2}>
      Announcements
    </Text>
  ),
  errorTitle: <Text id="qna.error_title">Whoops!</Text>,
  errorDescription: <Text id="qna.error_description">We couldn’t retrieve your messages. Please try again later</Text>,
  emptyEnnouncements: <Text id="qna.empty_announcements">No Announcements Yet</Text>,
  emptyQuestions: <Text id="qna.empty_questions">No Questions Yet</Text>,
  typeQuestion: <Text id="qna.type_question">Type your first question below</Text>,
  qnaLabel: <Text id="qna.qna">Q&A</Text>,
  hidePlugin: <Text id="qna.hide_plugin">Hide QnA</Text>
};

interface KitchenSinkTranslates {
  announcementsLabel?: string;
  qnaLabel?: string;
  errorTitle?: string;
  errorDescription?: string;
  emptyEnnouncements?: string;
  emptyQuestions?: string;
  typeQuestion?: string;
  hidePlugin?: string;
}

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

interface KitchenSinkState {
  autoScroll: boolean;
}

@withText(translates)
export class KitchenSink extends Component<KitchenSinkProps & KitchenSinkTranslates, KitchenSinkState> {
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
            {props.hasError ? this.props.errorTitle : props.announcementsOnly ? this.props.emptyEnnouncements : this.props.emptyQuestions}
          </div>
          <div className={styles.emptyListSubTitle}>
            {props.hasError ? this.props.errorDescription : props.announcementsOnly ? '' : this.props.typeQuestion}
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
      <div className={styles.root} aria-live="polite" data-testid={'qna_root'} onKeyUp={this._handleClose}>
        {/* header */}
        <div className={styles.headerContainer}>
          <div className={styles.header}>
            <div className={styles.title}>{props.announcementsOnly ? this.props.announcementsLabel : this.props.qnaLabel}</div>
            <A11yWrapper onClick={onClose}>
              <button
                data-testid={'qna_closeButton'}
                className={styles.closeButton}
                aria-label={this.props.hidePlugin}
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
