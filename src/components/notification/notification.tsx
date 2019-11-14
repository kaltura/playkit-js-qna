import { Component, h } from "preact";
import { QnaMessage, QnaMessageType } from "../../qnaMessageFactory";
import * as styles from "./notification.scss";
import { TrimmedText } from "../trimmed-text";
import { TimeDisplay } from "../time-display";
import classNames from "classnames";
import { MessageTheme } from "../../qna-plugin";

export interface NotificationProps {
    qnaMessage: QnaMessage;
    dateFormat: string;
    theme: MessageTheme;
}

export class Notification extends Component<NotificationProps> {
    render(props: NotificationProps) {
        const { qnaMessage, dateFormat } = this.props;
        const { backgroundColor } = this.props.theme;

        return (
            <div style={`background-color: ${backgroundColor};`} className={styles.notification}>
                <div className={styles.leftContainer}>
                    <div className={styles.iconWrapper}>
                        <div
                            className={classNames(styles.iconImage, {
                                [styles.announcementIconImage]:
                                    qnaMessage.type === QnaMessageType.Announcement,
                                [styles.aoaIconImage]:
                                    qnaMessage.type === QnaMessageType.AnswerOnAir
                            })}
                        />
                    </div>
                </div>

                <div className={styles.rightContainer}>
                    <div className={styles.title}>{this.getTitle(qnaMessage.type)}</div>
                    <div className={styles.messageContent}>
                        <TrimmedText maxLength={120} text={qnaMessage.messageContent} />
                    </div>
                    <div className={styles.secondInfoLine}>
                        <TimeDisplay
                            className={styles.threadTime}
                            time={qnaMessage.createdAt}
                            dateFormat={dateFormat}
                        />
                    </div>
                </div>
            </div>
        );
    }

    private getTitle(messageType: string): string {
        return messageType === QnaMessageType.Announcement ? "Announcement" : "Someone asks:";
    }
}
