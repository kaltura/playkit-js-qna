import { h, Component } from "preact";
import * as styles from "./thread.scss";
import { QnaMessage, QnaMessageType } from "../../QnaMessage";
import { DateTimeFormatting } from "../kitchen-sink";
import { TimeDisplay } from "../time-display";
import classNames from "classnames";
import { TrimmedText } from "../trimmed-text";
import { AutoExpandTextArea } from "../auto-expand-text-area";
import { AnsweredOnAirIcon } from "../answered-on-air-icon";

interface ThreadProps {
    thread: QnaMessage;
    formatting: DateTimeFormatting;
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

    private _isAOAAutoReply(reply: QnaMessage) {
        //todo [sa] uncomment next line and remove the one after
        //return reply.tags.indexOf(AutoReplyTag) > -1;
        if (reply.messageContent) {
            return reply.messageContent.indexOf("on-air") > -1;
        }
        return false;
    }

    private _willBeAnsweredOnAir(replies: QnaMessage[]): boolean {
        return (
            (replies || []).findIndex((reply: QnaMessage) => {
                return this._isAOAAutoReply(reply);
            }) > -1
        );
    }

    render() {
        const { thread, formatting } = this.props;
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
                    <TimeDisplay
                        className={styles.threadTime}
                        time={thread.time}
                        formatting={formatting}
                    />
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
                                                formatting={formatting}
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
