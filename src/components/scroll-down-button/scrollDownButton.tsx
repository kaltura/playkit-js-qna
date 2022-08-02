import {Component, h} from 'preact';
import * as styles from './scrollDownButton.scss';
import {DownIcon} from './down-icon';

export interface ScrollDownButtonProps {
  onClick: () => void;
}

export class ScrollDownButton extends Component<ScrollDownButtonProps> {
  render(props: ScrollDownButtonProps) {
    const {onClick} = props;
    return (
      <button className={styles.ovalContainer} onClick={onClick}>
        <div className={styles.iconImage}>
          <DownIcon />
        </div>
      </button>
    );
  }
}
