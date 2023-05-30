import {h, Component} from 'preact';
import * as styles from './spinner.scss';

const {withText, Text} = KalturaPlayer.ui.preacti18n;

const translates = {
  loadingText: <Text id="qna.loading">Loading...</Text>
};

interface SpinnerProps {
  loadingText?: string;
}

@withText(translates)
export class Spinner extends Component<SpinnerProps> {
  render() {
    return (
      <div className={styles.spinnerBall} aria-label={this.props.loadingText} data-testid={'qna_spinner'}>
        <div className={styles.doubleBounce1} />
        <div className={styles.doubleBounce2} />
      </div>
    );
  }
}
