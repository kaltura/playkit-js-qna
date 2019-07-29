import { h, Component } from "preact";
import * as styles from "./autoExpandTextArea.scss";
import classNames from "classnames";
//import * as throttle from 'lodash.throttle';

interface AutoExpandTextAreaProps {
    onSubmit: (text: string) => void;
}

interface AutoExpandTextAreaState {
    text: string;
}

export class AutoExpandTextArea extends Component<
    AutoExpandTextAreaProps,
    AutoExpandTextAreaState
> {
    private textArea: HTMLTextAreaElement | null = null;
    private inputActionsContainer: any = null;
    private _focusBlurEffectTime: any = null;

    public static readonly MAX_NUM_OF_CHARS = 500;

    state: AutoExpandTextAreaState = { text: "" };

    handleChange = (event: any) => {
        this.setState({ text: event.target.value });
        this.resize();
        //event.preventDefault();
    };

    handleDelayedChange = (event: any) => {
        setTimeout(() => {
            this.setState({ text: event.target.value });
            this.resize();
        });
        //event.preventDefault();
    };

    resize = () => {
        if (!this.textArea) {
            return;
        }

        this.textArea.style.height = "auto";
        const isTooBig = this.textArea.scrollHeight > 103;
        if (isTooBig) {
            this.textArea.style.height = 103 + "px";
            this.textArea.style.overflow = "auto";
        } else {
            this.textArea.style.height = this.textArea.scrollHeight + "px";
        }
    };

    toggleActionsContainer(isFocus: boolean) {
        if (!this.inputActionsContainer) {
            return;
        }

        if (this._focusBlurEffectTime) {
            clearTimeout(this._focusBlurEffectTime);
        }

        this._focusBlurEffectTime = setTimeout(() => {
            if (isFocus) {
                this.inputActionsContainer.classList.remove(styles.notVisible);
            } else {
                this.inputActionsContainer.classList.add(styles.notVisible);
            }
        }, 150);
    }

    onSendClick = () => {
        this.props.onSubmit(this.state.text);
    };

    render({ onSubmit }: AutoExpandTextAreaProps, { text }: AutoExpandTextAreaState) {
        //const { text } = this.state;

        return (
            <div
                onClick={() => {
                    this.toggleActionsContainer(true);
                }}
                onBlur={() => {
                    this.toggleActionsContainer(false);
                }}
                className={styles.textareaContainer}
                tabIndex={0}
            >
                <i className={styles.privateIcon} />
                <textarea
                    value={text}
                    className={styles.textarea}
                    ref={textArea => (this.textArea = textArea)}
                    onChange={this.handleChange}
                    onCut={this.handleDelayedChange}
                    onPaste={this.handleDelayedChange}
                    onKeyDown={this.handleDelayedChange}
                    onFocus={() => {
                        this.toggleActionsContainer(true);
                    }}
                    onBlur={() => {
                        this.toggleActionsContainer(false);
                    }}
                    placeholder={"Type a private question"}
                    rows={1}
                    maxLength={AutoExpandTextArea.MAX_NUM_OF_CHARS}
                />
                <div
                    className={classNames(styles.inputActionsContainer, styles.notVisible)}
                    ref={element => (this.inputActionsContainer = element)}
                >
                    <span>{`${text.length}/${AutoExpandTextArea.MAX_NUM_OF_CHARS}`}</span>
                    <button
                        onClick={this.onSendClick}
                        className={styles.sendButton}
                        type={"button"}
                    >
                        {"Send"}
                    </button>
                </div>
            </div>
        );
    }
}
