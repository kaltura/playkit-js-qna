import {Component, h} from 'preact';
import {A11yWrapper} from '@playkit-js/common/dist/hoc/a11y-wrapper';
import * as styles from './scrollDownButton.scss';
import {DownIcon} from './down-icon';

export interface ScrollDownButtonProps {
  onClick: () => void;
}

export class ScrollDownButton extends Component<ScrollDownButtonProps> {
  render(props: ScrollDownButtonProps) {
    const {onClick} = props;
    return (
      <A11yWrapper onClick={onClick}>
        <button className={styles.ovalContainer} aria-label={'Resume AutoScroll'}>
          <div className={styles.iconImage}>
            <DownIcon />
          </div>
        </button>
      </A11yWrapper>
    );
  }
}
