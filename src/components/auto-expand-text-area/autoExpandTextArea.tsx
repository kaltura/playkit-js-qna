import { h, Component } from "preact";
import * as styles from "./autoExpandTextArea.scss";
import classNames from "classnames";

interface AutoExpandTextAreaProps {
    placeholder?: string;
    onSubmit: (text: string) => void;
    enableBlackInputTheme?: boolean;
    initialFocus?: boolean;
    alwaysOpen?: boolean;
    disabled?: boolean;
    showLockIcon?: boolean;
    enableAnimation?: boolean;
    onFocusOut?: () => void;
}

interface AutoExpandTextAreaState {
    text: string;
    open: boolean;
    bleepingAnimation: boolean;
}

const MAX_NUM_OF_CHARS = 500;
const MAX_HEIGHT = 103;
const AnimationDuration = 700;

export class AutoExpandTextArea extends Component<
    AutoExpandTextAreaProps,
    AutoExpandTextAreaState
> {
    private _textareaContainer: any = null;
    private _textAreaRef: HTMLTextAreaElement | null = null;
    private _actionsContainer: HTMLElement | null = null;
    private _sendButtonRef: HTMLButtonElement | null = null;
    private _allowClickTimeout: ReturnType<typeof setTimeout> | null = null;

    static defaultProps = {
        placeholder: "",
        enableBlackInputTheme: false,
        disabled: false,
        showLockIcon: true,
        enableAnimation: false
    };

    state: AutoExpandTextAreaState = { text: "", open: false, bleepingAnimation: false };

    componentDidMount(): void {
        if (this.props.alwaysOpen) {
            this.setState({ open: true });
        }

        if (!this._textareaContainer) {
            return;
        }

        this._textareaContainer.addEventListener("focusin", this._handleFocusIn);
        this._textareaContainer.addEventListener("focusout", this._handleFocusOut);

        if (this.props.initialFocus) {
            this.focus();
        }
    }

    private _handleFocusIn = () => {
        if (this._allowClickTimeout) {
            clearTimeout(this._allowClickTimeout);
            this._allowClickTimeout = null;
        }

        this.setState({ open: true, bleepingAnimation: true });
        setTimeout(() => {
            this.setState({ bleepingAnimation: false });
        }, AnimationDuration);
    };

    private _handleFocusOut = (e: any) => {
        if (this._isElementOfComponent(e.relatedTarget)) {
            return;
        }

        if (!this.props.alwaysOpen) {
            // this helps to catch the click on an outside element (like, button) when clicking outsides the element.
            // otherwise the click is missed and swallowed.
            this._allowClickTimeout = setTimeout(() => {
                this.setState(() => ({ open: false, bleepingAnimation: false }));
            }, 200);
        }

        if (this.props.onFocusOut) {
            this.props.onFocusOut();
        }
    };

    focus = () => {
        if (this._textAreaRef) {
            this._textAreaRef.focus();
        }
    };

    private _handleOnInputChange = (event: any) => {
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
        const { text, open, bleepingAnimation } = this.state;
        const {
            enableBlackInputTheme,
            placeholder,
            disabled,
            showLockIcon,
            enableAnimation
        } = this.props;

        return (
            <div
                className={styles.textareaContainer}
                ref={textareaContainer => (this._textareaContainer = textareaContainer)}
            >
                {showLockIcon && (
                    <i
                        className={classNames(styles.ignoreClicks, {
                            [styles.privateIcon]: open,
                            [styles.beatingPrivateIcon]: bleepingAnimation
                        })}
                    />
                )}
                <textarea
                    value={text}
                    className={classNames(styles.textarea, {
                        [styles.blackInputTheme]: enableBlackInputTheme
                    })}
                    ref={textArea => (this._textAreaRef = textArea)}
                    onInput={this._handleOnInputChange}
                    onKeyDown={this._handleNewLineOrSubmit}
                    placeholder={placeholder}
                    rows={1}
                    maxLength={MAX_NUM_OF_CHARS}
                />
                <div
                    className={classNames({
                        [styles.inputActionsContainer]: open,
                        [styles.inputActionsContainerAnimation]: open && enableAnimation,
                        [styles.hide]: !open,
                        [styles.hideAnimation]: !open && enableAnimation
                    })}
                    ref={element => (this._actionsContainer = element)}
                >
                    <span>{`${text.length}/${MAX_NUM_OF_CHARS}`}</span>
                    <button
                        onClick={this._handleOnSend}
                        className={styles.sendButton}
                        type={"button"}
                        disabled={!text.length || disabled}
                        ref={button => (this._sendButtonRef = button)}
                    >
                        {"Send"}
                    </button>
                </div>
            </div>
        );
    }

    componentWillUnmount(): void {
        this._textareaContainer.removeEventListener("focusin", this._handleFocusIn);
        this._textareaContainer.removeEventListener("focusout", this._handleFocusOut);

        if (this._allowClickTimeout) {
            clearTimeout(this._allowClickTimeout);
            this._allowClickTimeout = null;
        }
    }
}
