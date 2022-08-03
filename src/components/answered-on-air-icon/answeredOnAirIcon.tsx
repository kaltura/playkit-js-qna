import {Component, h} from 'preact';
import * as styles from './_answeredOnAirIcon.scss';
import {AoAIcon} from './answer-on-air-icon';

export class AnsweredOnAirIcon extends Component {
  render() {
    return (
      <div className={styles.ovalContainer}>
        <div className={styles.iconImage}>
          <AoAIcon />
        </div>
      </div>
    );
  }
}
