import { Component, h } from "preact";
import * as styles from "./kitchenSink.scss";
import { QnaMessage, QnaMessageType } from "../../qnaMessageFactory";
import { Thread } from "../thread";
import { Spinner } from "../spinner";
import { AutoExpandTextArea } from "../auto-expand-text-area";
import { Notification } from "../notification";
import { ScrollDownButton } from "../scroll-down-button";
import classNames from "classnames";

export interface KitchenSinkProps {
    onClose: () => void;
    threads: QnaMessage[];
    dateFormat: string;
    hasError: boolean;
    loading: boolean;
    onSubmit: (text: string, parentId: string | null) => void;
    onResend: (qnaMessage: QnaMessage, parentId: string | null) => void;
    onMassageRead: (id: string) => void;
}

interface KitchenSinkState {}

export class KitchenSink extends Component<KitchenSinkProps, KitchenSinkState> {
    // Default values only when values not been sent.
    static defaultProps = {
        hasError: false,
        loading: false,
        onSubmit: (text: string, parentId: string | null) => {},
        OnResend: (qnaMessage: QnaMessage, parentId: string | null) => {}
    };

    state = {
        autoScroll: true
    };

    private _messagesEnd: any;
    private _scrollingTimeoutId: any = null;

    componentDidMount() {
        this._scrollToBottom();
    }

    componentDidUpdate() {
        if (this.state.autoScroll) this._scrollToBottom();
    }

    private _handleOnSubmit = (text: string, parentId?: string | null) => {
        this.props.onSubmit(text, parentId ? parentId : null);
    };

    handleOnResend = (qnaMessage: QnaMessage, parentId: string | null) => {
        this.props.onResend(qnaMessage, parentId);
    };

    private _scrollToBottom = () => {
        if (this._messagesEnd) {
            this._messagesEnd.scrollIntoView({ behavior: "smooth" });
        }
    };

    private _trackScrolling = () => {
        clearTimeout(this._scrollingTimeoutId);
        this._scrollingTimeoutId = setTimeout(() => {
            this.setState({ autoScroll: this._isBottom() });
        });
    };

    private _isBottom(): boolean {
        const el = document.getElementsByClassName(styles.flexibleMain)[0];
        return el && el.scrollHeight - el.scrollTop === el.clientHeight;
    }

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
                            onReply={this._handleOnSubmit}
                            onResend={this.handleOnResend}
                            onMassageRead={props.onMassageRead}
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
                    onScroll={this._trackScrolling}
                >
                    {renderedContent}

                    <div
                        className={styles.messagesEndAnchor}
                        ref={el => {
                            this._messagesEnd = el;
                        }}
                    />
                </div>

                {/* footer */}
                <div className={styles.footer}>
                    <div
                        className={classNames(styles.scrollDownButton, {
                            [styles.scrollDownButtonHidden]: state.autoScroll
                        })}
                    >
                        <ScrollDownButton onClick={this._scrollToBottom} />
                    </div>
                    <AutoExpandTextArea
                        onSubmit={this._handleOnSubmit}
                        placeholder={"Type a private question"}
                        enableAnimation={true}
                    />
                </div>
            </div>
        );
    }
}
