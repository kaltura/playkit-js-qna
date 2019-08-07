import { h, Component } from "preact";
import * as styles from "./autoExpandTextArea.scss";
import classNames from "classnames";

interface AutoExpandTextAreaProps {
    onSubmit: (text: string) => void;
}

interface AutoExpandTextAreaState {
    text: string;
    isInFocus: boolean;
}

const MAX_NUM_OF_CHARS = 500;
const MAX_HEIGHT = 103;

export class AutoExpandTextArea extends Component<
    AutoExpandTextAreaProps,
    AutoExpandTextAreaState
> {
    private _textareaContainer: any = null;
    private _textAreaRef: HTMLTextAreaElement | null = null;
    private _actionsContainer: HTMLElement | null = null;
    private _sendButtonRef: HTMLButtonElement | null = null;

    state: AutoExpandTextAreaState = { text: "", isInFocus: false };

    componentDidMount(): void {
        if (!this._textareaContainer) {
            return;
        }

        this._textareaContainer.addEventListener("focusin", this._handleOnFocusIn);
        this._textareaContainer.addEventListener("focusout", this._handleOnFocusOut);
    }

    private _handleOnFocusIn = () => {
        this._toggleActionsContainer(true);
    };

    private _handleOnFocusOut = (e: any) => {
        if (this._isElementOfComponent(e.relatedTarget)) {
            return;
        }

        this._toggleActionsContainer(false);
    };

    private _toggleActionsContainer(isFocus: boolean) {
        this.setState({ isInFocus: isFocus });
    }

    _handleOnInputChange = (event: any) => {
        this.setState({ text: event.target.value });
        this._resize();
    };

    private _resize = () => {
        if (!this._textAreaRef) {
            return;
        }

        this._textAreaRef.style.height = "auto";
        const isTooBig = this._textAreaRef.scrollHeight > MAX_HEIGHT;
        if (isTooBig) {
            this._textAreaRef.style.height = MAX_HEIGHT + "px";
            this._textAreaRef.style.overflow = "auto";
        } else {
            this._textAreaRef.style.height = this._textAreaRef.scrollHeight + "px";
        }
    };

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

    private _handleNewLineOrSubmit = (e: any) => {
        let key = e.key || e.which || e.keyCode;
        if ((key === "Enter" || key == 13) && !e.shiftKey) {
            this._handleOnSend();
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
        return true;
    };

    render() {
        const { text, isInFocus } = this.state;

        return (
            <div
                className={styles.textareaContainer}
                ref={textareaContainer => (this._textareaContainer = textareaContainer)}
            >
                <i className={classNames(styles.privateIcon, styles.ignoreClicks)} />
                <textarea
                    value={text}
                    className={styles.textarea}
                    ref={textArea => (this._textAreaRef = textArea)}
                    onInput={this._handleOnInputChange}
                    onKeyDown={this._handleNewLineOrSubmit}
                    placeholder={"Type a private question"}
                    rows={1}
                    maxLength={MAX_NUM_OF_CHARS}
                />
                <div
                    className={classNames(styles.inputActionsContainer, {
                        [styles.notVisible]: !isInFocus
                    })}
                    ref={element => (this._actionsContainer = element)}
                >
                    <span>{`${text.length}/${MAX_NUM_OF_CHARS}`}</span>
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
        this._textareaContainer.removeEventListener("focusin", this._handleOnFocusIn);
        this._textareaContainer.removeEventListener("focusout", this._handleOnFocusOut);
    }
}
