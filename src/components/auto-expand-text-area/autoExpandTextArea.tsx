import { h, Component } from "preact";
import * as styles from "./autoExpandTextArea.scss";
import classNames from "classnames";
//import * as throttle from 'lodash.throttle';

interface AutoExpandTextAreaProps {
    onSubmit: (text: string) => void;
}

interface AutoExpandTextAreaState {
    text: string;
    isInFocus: boolean;
}

const MAX_NUM_OF_CHARS = 500;

export class AutoExpandTextArea extends Component<
    AutoExpandTextAreaProps,
    AutoExpandTextAreaState
> {
    private _textareaContainer: HTMLElement | null = null;
    private _textAreaRef: HTMLTextAreaElement | null = null;
    private _actionsContainer: HTMLElement | null = null;
    private _sendButtonRef: HTMLButtonElement | null = null;

    state: AutoExpandTextAreaState = { text: "", isInFocus: false };

    _handleOnInputChange = (event: any) => {
        this.setState({ text: event.target.value });
        this._resize();
    };

    private _resize = () => {
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

    private _toggleActionsContainer(isFocus: boolean) {
        this.setState({ isInFocus: isFocus });

        if (!this._actionsContainer) {
            return;
        }

        if (isFocus) {
            document.addEventListener("click", this._trackClickOutside);
        } else {
            document.removeEventListener("click", this._trackClickOutside);
        }
    }

    private _isElementOfComponent = (element: any) => {
        return (
            [
                this._textareaContainer,
                this._textAreaRef,
                this._sendButtonRef,
                this._actionsContainer
            ].indexOf(element) !== -1
        );
    };

    private _trackClickOutside = (e: any) => {
        if (this._isElementOfComponent(e.target)) {
            return;
        }

        this._toggleActionsContainer(false);
    };

    private _handleOnSend = () => {
        if (this.state.text === "") {
            return;
        }

        this.props.onSubmit(this.state.text);
        this._resetTextAreaAfterSend();
    };

    private _resetTextAreaAfterSend() {
        this.setState({ text: "" });

        if (!this._textAreaRef) {
            return;
        }

        this._textAreaRef.style.height = "auto";
        this._textAreaRef.focus();
    }

    render() {
        const { text } = this.state;

        return (
            <div
                className={styles.textareaContainer}
                tabIndex={0}
                ref={textareaContainer => (this._textareaContainer = textareaContainer)}
                onBlur={e => {
                    if (this._isElementOfComponent(e.relatedTarget)) {
                        return;
                    }
                    this._toggleActionsContainer(false);
                }}
            >
                <i className={classNames(styles.privateIcon, styles.ignoreClicks)} />
                <textarea
                    value={text}
                    className={styles.textarea}
                    ref={textArea => (this._textAreaRef = textArea)}
                    onInput={this._handleOnInputChange}
                    onFocus={() => {
                        this._toggleActionsContainer(true);
                    }}
                    onKeyDown={e => {
                        let key = e.key || e.keyCode;
                        if ((key === "Enter" || key == 13) && !e.shiftKey) {
                            this._handleOnSend();
                            e.preventDefault();
                            e.stopPropagation();
                            return false;
                        }
                        return true;
                    }}
                    placeholder={"Type a private question"}
                    rows={1}
                    maxLength={MAX_NUM_OF_CHARS}
                />
                <div
                    className={classNames(styles.inputActionsContainer, {
                        [styles.notVisible]: !this.state.isInFocus
                    })}
                    ref={element => (this._actionsContainer = element)}
                >
                    <span className={styles.ignoreClicks}>{`${
                        text.length
                    }/${MAX_NUM_OF_CHARS}`}</span>
                    <button
                        onClick={this._handleOnSend}
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
        document.removeEventListener("click", this._trackClickOutside);
    }
}
