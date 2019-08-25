import { h, Component } from "preact";
import * as styles from "./thread.scss";
import { QnaMessage, QnaMessageType } from "../../QnaMessage";
import { DateTimeFormatting } from "../kitchen-sink";
import { TimeDisplay } from "../time-display";
import classNames from "classnames";
import { TrimmedText } from "../trimmed-text";
import { AutoExpandTextArea } from "../auto-expand-text-area";

interface ThreadProps {
    thread: QnaMessage;
    formatting: DateTimeFormatting;
}

interface ThreadState {
    isThreadOpen: boolean;
    showInputText: boolean;
}

export class Thread extends Component<ThreadProps, ThreadState> {
    static defaultProps = {};

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

    handleOnSubmit = (text: string) => {
        console.log(text);
    };

    render() {
        const { thread, formatting } = this.props;
        const { replies } = thread;
        const { isThreadOpen, showInputText } = this.state;

        return (
            <div className={styles.thread}>
                <div className={styles.messageContent}>
                    <TrimmedText maxLength={120} text={thread.messageContent} />
                </div>
                <div className={styles.secondInfoLine}>
                    {/*    Show More/Less button and thread time  */
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
                    <TimeDisplay
                        className={styles.threadTime}
                        time={thread.time}
                        formatting={formatting}
                    />
                </div>
                {/*    Replies collapsed area  */
                isThreadOpen && (
                    <div className={styles.collapsedArea}>
                        {replies.map((reply: QnaMessage) => {
                            return (
                                <div
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
                                                formatting={formatting}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/*  Reply button and Input  */
                showInputText ? (
                    <AutoExpandTextArea
                        onSubmit={this.handleOnSubmit}
                        placeholder={"Reply"}
                        enableBlackInputTheme={true}
                        enableFocusOut={false}
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
