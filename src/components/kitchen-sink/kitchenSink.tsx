import { h, Component } from "preact";
import * as styles from "./kitchenSink.scss";
import { QnaMessage } from "../../QnaMessage";
import { Thread } from "../thread";

export interface DateTimeFormatting {
    dateFormatting: DateFormats;
}

export enum DateFormats {
    American = "American",
    European = "European"
}

export interface KitchenSinkProps {
    onClose: () => void;
    threads: QnaMessage[];
    formatting: DateTimeFormatting;
    hasError: boolean;
    loading: boolean;
}

interface KitchenSinkState {}

export class KitchenSink extends Component<KitchenSinkProps, KitchenSinkState> {
    // Default values only when values not been sent.
    static defaultProps = {
        hasError: false,
        loading: false
    };

    state = {};

    private _generateThreadList(props: KitchenSinkProps) {
        if (props.loading) {
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
            return props.threads.map((masterQuestion: QnaMessage) => {
                return (
                    <Thread
                        thread={masterQuestion}
                        formatting={props.formatting}
                        key={masterQuestion.id}
                    />
                );
            });
        }
    }

    render(props: KitchenSinkProps, state: any) {
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
                    className={` ${styles.flexibleMain}
                                ${(props.loading || props.hasError || props.threads.length === 0) &&
                                    styles.noContent} 
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
