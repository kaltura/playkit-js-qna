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
    private _actionsContainer: any = null;
    private _textAreaRef: HTMLTextAreaElement | null = null;
    private _sendButtonRef: HTMLTextAreaElement | null = null;

    public static readonly MAX_NUM_OF_CHARS = 500;

    state: AutoExpandTextAreaState = { text: "" };

    handleChange = (event: any) => {
        this.setState({ text: event.target.value });
        this.resize();
    };

    handleDelayedChange = (event: any) => {
        setTimeout(() => {
            this.setState({ text: event.target.value });
            this.resize();
        });
        //event.preventDefault();
    };

    resize = () => {
        if (!this._textAreaRef) {
            return;
        }

        this._textAreaRef.style.height = "auto";
        const isTooBig = this._textAreaRef.scrollHeight > 103;
        if (isTooBig) {
            this._textAreaRef.style.height = 103 + "px";
            this._textAreaRef.style.overflow = "auto";
        } else {
            this._textAreaRef.style.height = this._textAreaRef.scrollHeight + "px";
        }
    };

    _toggleActionsContainer(isFocus: boolean) {
        if (!this._actionsContainer) {
            return;
        }

        if (isFocus) {
            document.addEventListener("mousedown", this._trackClickOutside);
            this._actionsContainer.classList.remove(styles.notVisible);
        } else {
            document.removeEventListener("mousedown", this._trackClickOutside);
            this._actionsContainer.classList.add(styles.notVisible);
        }
    }

    _trackClickOutside = (e: any) => {
        if (
            [this._textAreaRef, this._sendButtonRef, this._actionsContainer].indexOf(e.target) !==
            -1
        ) {
            return;
        }

        this._toggleActionsContainer(false);
    };

    onSendClick = () => {
        if (this.state.text === "") {
            return;
        }

        this.props.onSubmit(this.state.text);
        this.setState({ text: "" });
    };

    render({ onSubmit }: AutoExpandTextAreaProps, { text }: AutoExpandTextAreaState) {
        return (
            <div className={styles.textareaContainer} tabIndex={0}>
                <i className={classNames(styles.privateIcon, styles.ignoreClicks)} />
                <textarea
                    value={text}
                    className={styles.textarea}
                    ref={textArea => (this._textAreaRef = textArea)}
                    onChange={this.handleChange}
                    onCut={this.handleDelayedChange}
                    onPaste={this.handleDelayedChange}
                    onKeyDown={this.handleDelayedChange}
                    onFocus={() => {
                        this._toggleActionsContainer(true);
                    }}
                    placeholder={"Type a private question"}
                    rows={1}
                    maxLength={AutoExpandTextArea.MAX_NUM_OF_CHARS}
                />
                <div
                    className={classNames(styles.inputActionsContainer, styles.notVisible)}
                    ref={element => (this._actionsContainer = element)}
                >
                    <span className={styles.ignoreClicks}>{`${text.length}/${
                        AutoExpandTextArea.MAX_NUM_OF_CHARS
                    }`}</span>
                    <button
                        onClick={this.onSendClick}
                        className={styles.sendButton}
                        type={"button"}
                        disabled={!text.length}
                        ref={button => (this._sendButtonRef = button)}
                    >
                        {"Send"}
                    </button>
                </div>
            </div>
        );
    }

    componentWillUnmount(): void {
        document.removeEventListener("mousedown", this._trackClickOutside);
    }
}
