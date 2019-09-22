import { Component, h } from "preact";
import * as styles from "./kitchenSink.scss";
import { QnaMessage, QnaMessageType } from "../../qnaMessage";
import { Thread } from "../thread";
import { Spinner } from "../spinner";
import { AutoExpandTextArea } from "../auto-expand-text-area";
import { Notification } from "../notification";

export interface KitchenSinkProps {
    onClose: () => void;
    threads: QnaMessage[];
    dateFormat: string;
    hasError: boolean;
    loading: boolean;
    onSubmit: (text: string, thread?: QnaMessage) => void;
    onResend: (qnaMessage: QnaMessage) => void;
}

interface KitchenSinkState {}

export class KitchenSink extends Component<KitchenSinkProps, KitchenSinkState> {
    // Default values only when values not been sent.
    static defaultProps = {
        hasError: false,
        loading: false,
        onSubmit: (text: string, thread?: QnaMessage) => {},
        OnResend: (qnaMessage: QnaMessage) => {}
    };

    state = {};

    handleOnSubmit = (text: string, thread?: QnaMessage) => {
        this.props.onSubmit(text, thread);
    };

    handleOnResend = (qnaMessage: QnaMessage) => {
        this.props.onResend(qnaMessage);
    };

    private _generateContent(props: KitchenSinkProps) {
        if (props.loading) {
            return <Spinner />;
        } else if (props.hasError || props.threads.length === 0) {
            return (
                <div className={styles.noQuestionWrapper}>
                    <div
                        className={`
                                    ${styles.emptyListImgProperties}
                                    ${
                                        props.hasError
                                            ? styles.whoopseErrorImage
                                            : styles.noQuestionYetImage
                                    }                               
                                   `}
                    />
                    <div className={styles.emptyListTitle}>
                        {props.hasError ? "Whoops!" : "No Question Yet"}
                    </div>
                    <div className={styles.emptyListSubTitle}>
                        {props.hasError
                            ? "We couldn’t retrieve your messages. Please try again later"
                            : "Type your first question below"}
                    </div>
                </div>
            );
        } else {
            return props.threads.map((qnaMessage: QnaMessage) => {
                if (
                    qnaMessage.type === QnaMessageType.Announcement ||
                    qnaMessage.type === QnaMessageType.AnswerOnAir
                ) {
                    return (
                        <Notification
                            qnaMessage={qnaMessage}
                            dateFormat={props.dateFormat}
                            key={qnaMessage.id}
                        />
                    );
                } else {
                    return (
                        <Thread
                            thread={qnaMessage}
                            dateFormat={props.dateFormat}
                            key={qnaMessage.id}
                            onReply={this.handleOnSubmit}
                            onResend={this.handleOnResend}
                        />
                    );
                }
            });
        }
    }

    render(props: KitchenSinkProps, state: any) {
        const { onClose } = props;
        let renderedContent = this._generateContent(props);

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
                    className={` ${styles.flexibleMain}
                                ${(props.loading || props.hasError || props.threads.length === 0) &&
                                    styles.noContent} 
                            `}
                >
                    {renderedContent}
                </div>

                {/* footer */}
                <div className={styles.footer}>
                    <AutoExpandTextArea
                        onSubmit={this.handleOnSubmit}
                        placeholder={"Type a private question"}
                    />
                </div>
            </div>
        );
    }
}
