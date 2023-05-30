import {h, Component} from 'preact';
import {A11yWrapper} from '@playkit-js/common/dist/hoc/a11y-wrapper';
import * as styles from './autoExpandTextArea.scss';
import classNames from 'classnames';

const {withText, Text} = KalturaPlayer.ui.preacti18n;

const translates = {
  placeholder: <Text id="qna.type_private_question">Type a private question</Text>,
  sendTitle: <Text id="qna.send">Send</Text>
};

interface AutoExpandTextAreaProps {
  placeholder?: string;
  sendTitle?: string;
  onSubmit: (text: string) => void;
  enableBlackInputTheme?: boolean;
  initialFocus?: boolean;
  alwaysOpen?: boolean;
  disabled?: boolean;
  enableAnimation?: boolean;
  onFocusOut?: () => void;
  onFocusIn?: () => void;
}

interface AutoExpandTextAreaState {
  text: string;
  open: boolean;
}

const MAX_NUM_OF_CHARS = 500;
const MAX_HEIGHT = 103;

@withText(translates)
export class AutoExpandTextArea extends Component<AutoExpandTextAreaProps, AutoExpandTextAreaState> {
  private _textareaContainer: any = null;
  private _textAreaRef: HTMLTextAreaElement | null = null;
  private _actionsContainer: HTMLElement | null = null;
  private _sendButtonRef: HTMLButtonElement | null = null;
  private _allowClickTimeout: ReturnType<typeof setTimeout> | null = null;

  static defaultProps = {
    enableBlackInputTheme: false,
    disabled: false,
    enableAnimation: false
  };

  state: AutoExpandTextAreaState = {text: '', open: false};

  componentDidMount(): void {
    if (this.props.alwaysOpen) {
      this.setState({open: true});
    }

    if (!this._textareaContainer) {
      return;
    }

    this._textareaContainer.addEventListener('focusin', this._handleFocusIn);
    this._textareaContainer.addEventListener('focusout', this._handleFocusOut);

    if (this.props.initialFocus) {
      this.focus();
    }
  }

  private _handleFocusIn = () => {
    if (this._allowClickTimeout) {
      clearTimeout(this._allowClickTimeout);
      this._allowClickTimeout = null;
    }

    this.setState({open: true});

    if (this.props.onFocusOut) this._textareaContainer.removeEventListener('transitionend', this.props.onFocusOut);

    if (this.props.onFocusIn) {
      if (this.props.enableAnimation) {
        this._textareaContainer.addEventListener('transitionend', this.props.onFocusIn);
      } else {
        this.props.onFocusIn();
      }
    }
  };

  private _handleFocusOut = (e: any) => {
    if (this._isElementOfComponent(e.relatedTarget)) {
      return;
    }

    if (!this.props.alwaysOpen) {
      // this helps to catch the click on an outside element (like, button) when clicking outsides the element.
      // otherwise the click is missed and swallowed.
      this._allowClickTimeout = setTimeout(() => {
        this.setState(() => ({open: false}));
      }, 200);
    }

    if (this.props.onFocusIn) this._textareaContainer.removeEventListener('transitionend', this.props.onFocusIn);

    if (this.props.onFocusOut) {
      if (this.props.enableAnimation) {
        this._textareaContainer.addEventListener('transitionend', this.props.onFocusOut);
      } else {
        this.props.onFocusOut();
      }
    }
  };

  focus = () => {
    if (this._textAreaRef) {
      this._textAreaRef.focus();
    }
  };

  private _handleOnInputChange = (event: any) => {
    this.setState({text: event.target.value});
    this._resize();
  };

  private _resize = () => {
    if (!this._textAreaRef) {
      return;
    }

    this._textAreaRef.style.height = 'auto';
    const isTooBig = this._textAreaRef.scrollHeight > MAX_HEIGHT;
    if (isTooBig) {
      this._textAreaRef.style.height = MAX_HEIGHT + 'px';
      this._textAreaRef.style.overflow = 'auto';
    } else {
      this._textAreaRef.style.height = this._textAreaRef.scrollHeight + 'px';
    }
  };

  private _isElementOfComponent = (element: any) => {
    return [this._textareaContainer, this._textAreaRef, this._sendButtonRef, this._actionsContainer].indexOf(element) !== -1;
  };

  private _handleOnSend = () => {
    if (this.state.text === '') {
      return;
    }

    this.props.onSubmit(this.state.text);
    this._resetTextAreaAfterSend();
  };

  private _resetTextAreaAfterSend() {
    this.setState({text: ''});

    if (!this._textAreaRef) {
      return;
    }

    this._textAreaRef.style.height = 'auto';
    this._textAreaRef.focus();
  }

  private _handleNewLineOrSubmit = (e: any) => {
    let key = e.key || e.which || e.keyCode;
    if ((key === 'Enter' || key == 13) && !e.shiftKey) {
      this._handleOnSend();
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    return true;
  };

  render() {
    const {text, open} = this.state;
    const {enableBlackInputTheme, placeholder, disabled, enableAnimation} = this.props;

    return (
      <div className={styles.textareaContainer} ref={textareaContainer => (this._textareaContainer = textareaContainer)}>
        <textarea
          value={text}
          className={classNames(styles.textarea, {
            [styles.blackInputTheme]: enableBlackInputTheme
          })}
          ref={textArea => (this._textAreaRef = textArea)}
          onInput={this._handleOnInputChange}
          onKeyDown={this._handleNewLineOrSubmit}
          placeholder={placeholder}
          aria-label={placeholder}
          rows={1}
          maxLength={MAX_NUM_OF_CHARS}
          data-testid={'qna_textArea'}
        />
        <div
          className={classNames({
            [styles.inputActionsContainer]: open,
            [styles.inputActionsContainerAnimation]: open && enableAnimation,
            [styles.hide]: !open,
            [styles.hideAnimation]: !open && enableAnimation
          })}
          ref={element => (this._actionsContainer = element)}>
          <span>{`${text.length}/${MAX_NUM_OF_CHARS}`}</span>
          <A11yWrapper onClick={this._handleOnSend}>
            <button className={styles.sendButton} disabled={!text.length || disabled} ref={button => (this._sendButtonRef = button)}>
              {this.props.sendTitle}
            </button>
          </A11yWrapper>
        </div>
      </div>
    );
  }

  componentWillUnmount(): void {
    this._textareaContainer.removeEventListener('focusin', this._handleFocusIn);
    this._textareaContainer.removeEventListener('focusout', this._handleFocusOut);
    if (this.props.onFocusOut) this._textareaContainer.removeEventListener('transitionend', this.props.onFocusOut);
    if (this.props.onFocusIn) this._textareaContainer.removeEventListener('transitionend', this.props.onFocusIn);

    if (this._allowClickTimeout) {
      clearTimeout(this._allowClickTimeout);
      this._allowClickTimeout = null;
    }
  }
}
