import { Component, h } from "preact";
import { QnaMessage, QnaMessageType } from "../../QnaMessage";
import { DateTimeFormatting } from "../kitchen-sink";
import * as styles from "./notification.scss";
import { TrimmedText } from "../trimmed-text";
import { TimeDisplay } from "../time-display";
import classNames from "classnames";

export interface NotificationProps {
    qnaMessage: QnaMessage;
    formatting: DateTimeFormatting;
}

export class Notification extends Component<NotificationProps> {
    render(props: NotificationProps) {
        const { qnaMessage, formatting } = this.props;

        return (
            <div className={styles.notification}>
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
                            time={qnaMessage.time}
                            formatting={formatting}
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
