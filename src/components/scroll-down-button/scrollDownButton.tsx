import {Component, h} from 'preact';
import {A11yWrapper} from '@playkit-js/common/dist/hoc/a11y-wrapper';
import * as styles from './scrollDownButton.scss';
import {DownIcon} from './down-icon';

const {withText, Text} = KalturaPlayer.ui.preacti18n;

const translates = {
  autoScrollLabel: <Text id="qna.resume_autoscroll">Resume Auto-Scroll</Text>
};

export interface ScrollDownButtonProps {
  onClick: () => void;
  autoScrollLabel?: string;
}

@withText(translates)
export class ScrollDownButton extends Component<ScrollDownButtonProps> {
  render(props: ScrollDownButtonProps) {
    const {onClick, autoScrollLabel} = props;
    return (
      <A11yWrapper onClick={onClick}>
        <button className={styles.ovalContainer} aria-label={autoScrollLabel}>
          <div className={styles.iconImage}>
            <DownIcon />
          </div>
        </button>
      </A11yWrapper>
    );
  }
}
