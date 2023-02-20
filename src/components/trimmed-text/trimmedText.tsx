import {h, Component} from 'preact';
import {A11yWrapper} from '@playkit-js/common';
import * as styles from './trimmedText.scss';
import {LinkifyString} from '@playkit-js/common';
import {Utils} from '../../utils';

interface TrimmedTextProps {
  maxLength: number;
  text: string | undefined;
}

interface TrimmedTextState {
  isTrimmed: boolean;
}

export class TrimmedText extends Component<TrimmedTextProps, TrimmedTextState> {
  static defaultProps = {};

  state = {
    isTrimmed: true
  };

  onTrimmedTextClick = () => {
    this.setState({isTrimmed: !this.state.isTrimmed});
  };

  render() {
    const {maxLength, text} = this.props;
    const {isTrimmed} = this.state;

    return text && text.length > maxLength ? (
      <span>
        <span className={styles.text}>
          <LinkifyString text={isTrimmed ? `${Utils.wordBoundaryTrim(text, maxLength)}...` : text} />
        </span>
        <A11yWrapper onClick={this.onTrimmedTextClick}>
          <button className={styles.showMoreOrLess} tabIndex={0}>
            {isTrimmed ? 'Show more' : 'Show less'}
          </button>
        </A11yWrapper>
      </span>
    ) : (
      <span className={styles.text}>
        <LinkifyString text={text || ''} />
      </span>
    );
  }
}
