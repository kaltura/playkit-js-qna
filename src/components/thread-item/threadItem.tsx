import { h, Component } from "preact";
import * as styles from "./threadItem.scss";
import { QnaMessage } from "../../QnaMessage";
import { Utils } from "../../utils";

interface ThreadItemProps {
    thread: QnaMessage;
}

interface ThreadItemState {}

export class ThreadItem extends Component<ThreadItemProps, ThreadItemState> {
    static defaultProps = {};

    state = {};

    render(props: ThreadItemProps) {
        const { thread: QnaMessage } = props;
        return (
            <div className={styles.threadItem}>
                <div className={styles.messageContent}>{props.thread.messageContent}</div>
                <div className={styles.secondLineInfo}>
                    {Utils.isDateOlderThan24Hours(props.thread.time) && (
                        <span className={`${styles.dateTimeProp} ${styles.date}`}>
                            {Utils.getDisplayDate(props.thread.time)}
                        </span>
                    )}
                    <span className={`${styles.dateTimeProp} ${styles.time}`}>
                        {Utils.getDisplayTime(props.thread.time)}
                    </span>
                </div>
            </div>
        );
    }
}
