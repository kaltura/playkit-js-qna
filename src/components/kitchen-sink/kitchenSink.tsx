import { Component, h } from "preact";
import * as styles from "./kitchenSink.scss";
import { QnaMessage, QnaMessageType } from "../../qnaMessageFactory";
import { Thread } from "../thread";
import { Spinner } from "../spinner";
import { AutoExpandTextArea } from "../auto-expand-text-area";
import { Notification } from "../notification";
import { ScrollDownButton } from "../scroll-down-button";
import classNames from "classnames";
import { QnaTheme } from "../../qna-plugin";

export interface KitchenSinkProps {
    onClose: () => void;
    threads: QnaMessage[];
    dateFormat: string;
    hasError: boolean;
    loading: boolean;
    onSubmit: (text: string, parentId: string | null) => void;
    onResend: (qnaMessage: QnaMessage, parentId: string | null) => void;
    onMassageRead: (id: string) => void;
    announcementsOnly: boolean;
    theme: QnaTheme;
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

    private _messagesEnd: any;
    private _scrollingTimeoutId: any = null;
    private _animationInterval: any = null;

    componentDidMount() {
        this._scrollToBottom();
    }

    componentDidUpdate() {
        if (this.state.autoScroll) this._scrollToBottom();
    }

    private _handleOnSubmit = (text: string, parentId?: string | null) => {
        this.props.onSubmit(text, parentId ? parentId : null);
    };

    handleOnResend = (qnaMessage: QnaMessage, parentId: string | null) => {
        this.props.onResend(qnaMessage, parentId);
    };

    private _scrollToBottom = () => {
        clearInterval(this._animationInterval);
        if (this._messagesEnd) {
            this._animationInterval = setInterval(() => {
                // check if ref still exists during intervals and test if scroll ended
                if (
                    this._messagesEnd &&
                    this._messagesEnd.clientHeight >=
                        this._messagesEnd.scrollHeight - this._messagesEnd.scrollTop
                ) {
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
            this.setState({ autoScroll: this._isBottom() });
        });
    };

    private _isBottom(): boolean {
        const el = document.getElementsByClassName(styles.flexibleMain)[0];
        return el && el.scrollHeight - el.scrollTop <= el.clientHeight;
    }

    private _handleTextAreaFocusIn = (): void => {
      if(this.state.autoScroll) {
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
                    <div
                        className={`
                                    ${styles.emptyListImgProperties}
                                    ${
                                        props.hasError
                                            ? styles.whoopseErrorImage
                                            : props.announcementsOnly
                                            ? styles.noAnnouncementsYetImage
                                            : styles.noQuestionYetImage
                                    }                               
                                   `}
                    />
                    <div className={styles.emptyListTitle}>
                        {props.hasError
                            ? "Whoops!"
                            : `No ${props.announcementsOnly ? "Announcements" : "Questions"} Yet`}
                    </div>
                    <div className={styles.emptyListSubTitle}>
                        {props.hasError
                            ? "We couldn’t retrieve your messages. Please try again later"
                            : props.announcementsOnly
                            ? ""
                            : `Type your first question below`}
                    </div>
                </div>
            );
        } else {
            const messageTheme = this.props.theme.message;

            return props.threads.map((qnaMessage: QnaMessage) => {
                if (
                    qnaMessage.type === QnaMessageType.Announcement ||
                    qnaMessage.type === QnaMessageType.AnswerOnAir
                ) {
                    return (
                        <Notification
                            qnaMessage={qnaMessage}
                            dateFormat={props.dateFormat}
                            key={qnaMessage.id}
                            theme={messageTheme}
                        />
                    );
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

    render(props: KitchenSinkProps, state: any) {
        const { onClose } = props;
        let renderedContent = this._generateContent(props);

        return (
            <div className={styles.root}>
                {/* header */}
                <div className={styles.headerContainer}>
                    <div className={styles.header}>
                        <div className={styles.title}>
                            {props.announcementsOnly ? "Announcements" : "Q&A"}
                        </div>
                        <button className={styles.closeButton} onClick={onClose} />
                    </div>
                </div>

                {/* body */}
                <div
                    className={` ${styles.flexibleMain}
                                ${(props.loading || props.hasError || props.threads.length === 0) &&
                                    styles.noContent} 
                            `}
                    ref={el => {
                        this._messagesEnd = el;
                    }}
                    onScroll={this._trackScrolling}
                >
                    {renderedContent}

                    <div className={styles.messagesEndAnchor} />
                </div>

                {/* footer */}
                {!props.hasError && (
                    <div className={styles.footer}>
                        <div
                            className={classNames(styles.scrollDownButton, {
                                [styles.scrollDownButtonHidden]: state.autoScroll,
                            [styles.scrollDownButtonHiddenAnnouncementOnly]:
                                state.autoScroll && props.announcementsOnly
                        })}
                    >
                        <ScrollDownButton onClick={this._scrollToBottom} />
                    </div>
                    {!props.announcementsOnly && (
                        <AutoExpandTextArea
                            onSubmit={this._handleOnSubmit}
                            placeholder={"Type a private question"}
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
