import { h, Component } from "preact";
import * as styles from "./thread.scss";
import { QnaMessage, QnaMessageType } from "../../QnaMessage";
import { TimeDisplay } from "../time-display";
import classNames from "classnames";
import { TrimmedText } from "../trimmed-text";
import { AutoExpandTextArea } from "../auto-expand-text-area";

interface ThreadProps {
    thread: QnaMessage;
    dateFormat: string;
    onReply: (text: string, thread?: QnaMessage) => void;
}

interface ThreadState {
    isThreadOpen: boolean;
    showInputText: boolean;
}

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

    render() {
        const { thread, dateFormat } = this.props;
        const { replies } = thread;
        const { isThreadOpen, showInputText } = this.state;

        return (
            <div className={styles.thread}>
                <div className={styles.messageContent}>
                    <TrimmedText maxLength={120} text={thread.messageContent} />
                </div>
                <div className={styles.secondInfoLine}>
                    <TimeDisplay
                        className={styles.threadTime}
                        time={thread.time}
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
                                        <div className={styles.reply}>
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
                                                time={reply.time}
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
