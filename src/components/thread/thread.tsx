import { h, Component } from "preact";
import * as styles from "./thread.scss";
import { QnaMessage, QnaMessageType } from "../../QnaMessage";
import { DateTimeFormatting } from "../kitchen-sink";
import { TimeDisplay } from "../time-display";
import classNames from "classnames";

interface ThreadProps {
    thread: QnaMessage;
    formatting: DateTimeFormatting;
}

interface ThreadState {
    isThreadOpen: boolean;
}

export class Thread extends Component<ThreadProps, ThreadState> {
    static defaultProps = {};

    state = {
        isThreadOpen: false
    };

    onCollapsedClick = () => {
        this.setState({ isThreadOpen: !this.state.isThreadOpen });
    };

    render() {
        const { thread, formatting } = this.props;
        const { replies } = thread;
        const { isThreadOpen } = this.state;

        return (
            <div className={styles.thread}>
                <div className={styles.messageContent}>{thread.messageContent}</div>
                <div className={styles.secondInfoLine}>
                    {/*    Show More/Less button and thread time  */
                    replies.length > 0 && (
                        <button
                            className={styles.clearStyledButton}
                            onClick={this.onCollapsedClick}
                            type={"button"}
                        >
                            <span
                                className={classNames(styles.numOfRepliesIcon, {
                                    [styles.arrowLeft]: !isThreadOpen
                                })}
                            />
                            <span className={styles.numOfReplies}>
                                {isThreadOpen ? "Show less" : `${replies.length} Replies`}
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
                                                {reply.messageContent}
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

                {/*    Reply button and Input  */}
                <div className={styles.lastInfoLine}>
                    <button type={"button"} className={styles.clearStyledButton}>
                        <span className={styles.replyIcon} />
                        <span className={styles.replyText}>{"Reply"}</span>
                    </button>
                </div>
            </div>
        );
    }
}
