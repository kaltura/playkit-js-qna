import { h, Component } from "preact";
import * as styles from "./thread.scss";
import { QnaMessage, QnaMessageType } from "../../qnaMessage";
import { TimeDisplay } from "../time-display";
import classNames from "classnames";
import { TrimmedText } from "../trimmed-text";
import { AutoExpandTextArea } from "../auto-expand-text-area";
import { AnsweredOnAirIcon } from "../answered-on-air-icon";

interface ThreadProps {
    thread: QnaMessage;
    dateFormat: string;
    onReply: (text: string, thread?: QnaMessage) => void;
}

interface ThreadState {
    isThreadOpen: boolean;
    showInputText: boolean;
}

const AutoReplyTag = "aoa_auto_reply";

export class Thread extends Component<ThreadProps, ThreadState> {
    static defaultProps = {
        onReply: (text: string, parentId?: string) => {}
    };

    state = {
        isThreadOpen: false,
        showInputText: false
    };

    handleOnShowMoreClick = () => {
        this.setState({ isThreadOpen: !this.state.isThreadOpen });
    };

    handleOnReplyButtonClick = () => {
        this.setState({ showInputText: !this.state.showInputText });
    };

    handleReply = (text: string) => {
        this.setState({ showInputText: false });
        this.props.onReply(text, this.props.thread);
    };

    private _isAOAAutoReply(reply: QnaMessage) {
        return reply.tags.indexOf(AutoReplyTag) > -1;
    }

    private _willBeAnsweredOnAir(replies: QnaMessage[]): boolean {
        return (
            (replies || []).findIndex((reply: QnaMessage) => {
                return this._isAOAAutoReply(reply);
            }) > -1
        );
    }

    render() {
        const { thread, dateFormat } = this.props;
        const { replies } = thread;
        const { isThreadOpen, showInputText } = this.state;

        return (
            <div className={styles.thread}>
                {/* if this master question will be answered on air - add an icon */
                this._willBeAnsweredOnAir(replies) && (
                    <div className={styles.aoaIconContainer}>
                        <AnsweredOnAirIcon />
                    </div>
                )}
                <div className={styles.messageContent}>
                    <TrimmedText maxLength={120} text={thread.messageContent} />
                </div>
                <div className={styles.secondInfoLine}>
                    <TimeDisplay
                        className={styles.threadTime}
                        time={thread.createdAt}
                        dateFormat={dateFormat}
                    />
                    {/*    Show Number of Replies/Show Less button and thread time  */
                    replies.length > 0 && (
                        <button
                            className={styles.clearStyledButton}
                            onClick={this.handleOnShowMoreClick}
                            type={"button"}
                        >
                            <span
                                className={classNames(styles.numOfRepliesIcon, {
                                    [styles.arrowLeft]: !isThreadOpen
                                })}
                            />
                            <span className={styles.numOfReplies}>
                                {isThreadOpen
                                    ? "Show less"
                                    : replies.length +
                                      (replies.length === 1 ? " Reply" : " Replies")}
                            </span>
                        </button>
                    )}
                </div>

                {/*    Replies Collapsed area  */
                isThreadOpen && (
                    <div className={styles.collapsedArea}>
                        {replies.map((reply: QnaMessage) => {
                            return (
                                <div
                                    key={reply.id}
                                    className={classNames(styles.replyContainer, {
                                        [styles.right]: reply.type === QnaMessageType.Question
                                    })}
                                >
                                    <div>
                                        <div
                                            className={classNames(styles.reply, {
                                                [styles.autoReplay]: this._isAOAAutoReply(reply)
                                            })}
                                        >
                                            {reply.type === QnaMessageType.Answer && (
                                                <div className={styles.username}>
                                                    {reply.userId}
                                                </div>
                                            )}
                                            <div className={styles.replyMessage}>
                                                <TrimmedText
                                                    maxLength={120}
                                                    text={reply.messageContent}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <TimeDisplay
                                                className={styles.threadTime}
                                                time={reply.createdAt}
                                                dateFormat={dateFormat}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/*  Reply Button and Input  */
                showInputText ? (
                    <AutoExpandTextArea
                        onSubmit={this.handleReply}
                        placeholder={"Reply"}
                        enableBlackInputTheme={true}
                        initialFocus={true}
                        open={true}
                    />
                ) : (
                    <div className={styles.lastInfoLine}>
                        <button
                            onClick={this.handleOnReplyButtonClick}
                            className={styles.clearStyledButton}
                            type={"button"}
                        >
                            <span className={styles.replyIcon} />
                            <span className={styles.replyText}>{"Reply"}</span>
                        </button>
                    </div>
                )}
            </div>
        );
    }
}
