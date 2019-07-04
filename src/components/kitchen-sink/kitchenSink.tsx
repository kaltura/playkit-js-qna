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

    private _generateThreadList(props: KitchenSinkProps) {
        if (!props.threads || props.threads.length === 0) {
            return (
                <div className={styles.noQuestionWrapper}>
                    <div
                        className={`
                                    ${styles.emptyListImgProperties}
                                    ${
                                        !props.threads
                                            ? styles.whoopseErrorImage
                                            : styles.noQuestionYetImage
                                    }                               
                                    `}
                    />
                    <div className={styles.emptyListTitle}>
                        {!props.threads ? "Whoops!" : "No Question Yet"}
                    </div>
                    <div className={styles.emptyListSubTitle}>
                        {!props.threads
                            ? "We couldn’t retrieve your messages. No worries, we’ll try again in few seconds"
                            : "Type your first question below"}
                    </div>
                </div>
            );
        } else {
            return props.threads.map((qnaMessage: QnaMessage) => {
                return <ThreadItem thread={qnaMessage} key={qnaMessage.id} />;
            });
        }
    }

    render(props: KitchenSinkProps) {
        const { onClose } = props;
        let renderedThreads = this._generateThreadList(props);

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
                <div
                    className={`
                                ${styles.flexibleMain}
                                ${
                                    !props.threads || props.threads.length === 0
                                        ? styles.noContent
                                        : ""
                                }
                                `}
                >
                    {renderedThreads}
                </div>

                {/* footer */}
                <div className={styles.footer} />
            </div>
        );
    }
}
