import { h, Component } from "preact";
import * as styles from "./kitchenSink.scss";
import { QnaMessage } from "../../QnaMessage";
import { ThreadItem } from "../thread-item";

export interface KitchenSinkProps {
    onClose: () => void;
    threads: QnaMessage[];
}

interface KitchenSinkState {}

export class KitchenSink extends Component<KitchenSinkProps, KitchenSinkState> {
    static defaultProps = {};

    state = {};

    render(props: KitchenSinkProps) {
        const { onClose } = props;
        return (
            <div className={styles.root}>
                {/* header */}
                <div className={styles.headerContainer}>
                    <div className={styles.header}>
                        <div className={styles.title}>Notifications</div>
                        <button className={styles.closeButton} onClick={onClose} />
                    </div>
                </div>

                {/* body */}
                <div className={styles.flexibleMain}>
                    {props.threads.map((qnaMessage: QnaMessage) => {
                        return <ThreadItem thread={qnaMessage} key={qnaMessage.id} />;
                    })}
                </div>

                {/* footer */}
                <div className={styles.footer} />
            </div>
        );
    }
}
