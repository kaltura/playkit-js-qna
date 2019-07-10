import { h, Component } from "preact";
import * as styles from "./thread.scss";
import { QnaMessage } from "../../QnaMessage";
import { Utils } from "../../utils";
import { DateTimeFormatting } from "../kitchen-sink";

interface ThreadProps {
    thread: QnaMessage;
    formatting: DateTimeFormatting;
}

interface ThreadState {}

export class Thread extends Component<ThreadProps, ThreadState> {
    static defaultProps = {};

    state = {};

    render(props: ThreadProps) {
        const { thread: QnaMessage } = props;
        return (
            <div className={styles.thread}>
                <div className={styles.messageContent}>{props.thread.messageContent}</div>
                <div className={styles.secondLineInfo}>
                    {Utils.isDateOlderThan24Hours(props.thread.time) && (
                        <span className={`${styles.dateTimeProp} ${styles.date}`}>
                            {Utils.getDisplayDate(props.thread.time, props.formatting)}
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
