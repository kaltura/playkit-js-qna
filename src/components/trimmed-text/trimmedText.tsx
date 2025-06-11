import {h, Component} from 'preact';
import {A11yWrapper} from '@playkit-js/common/dist/hoc/a11y-wrapper';
import {LinkifyString} from '@playkit-js/common/dist/ui-common/linkify-string';
import * as styles from './trimmedText.scss';
import {Utils} from '../../utils';

const {Text} = KalturaPlayer.ui.preacti18n;

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
        <span className={`${styles.text} no-copy`}>
          <LinkifyString text={isTrimmed ? `${Utils.wordBoundaryTrim(text, maxLength)}...` : text} />
        </span>
        <A11yWrapper onClick={this.onTrimmedTextClick}>
          <button className={styles.showMoreOrLess} tabIndex={0}>
            {isTrimmed ? <Text id="qna.show_more">Show more</Text> : <Text id="qna.show_less">Show less</Text>}
          </button>
        </A11yWrapper>
      </span>
    ) : (
      <span className={`${styles.text} no-copy`}>
        <LinkifyString text={text || ''} />
      </span>
    );
  }
}
