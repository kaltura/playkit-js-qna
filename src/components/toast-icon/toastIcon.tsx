import {Component, h} from 'preact';
import * as styles from './_toastIcon.scss';
import {AoAIcon} from './aoa-icon';
import {ErrorIcon} from './error-icon';
import {AnnouncementIcon} from './announcement-icon';
import {ReplyIcon} from './reply-icon';

export enum ToastsType {
  Announcement = 'Announcement',
  AOA = 'AOA',
  Reply = 'Reply',
  Error = 'Error'
}

export interface ToastIconProps {
  type: ToastsType;
}

export class ToastIcon extends Component<ToastIconProps> {
  render() {
    return (
      <div className={styles.container}>
        <div className={styles.iconWrapper}>
          {this.props.type === ToastsType.AOA && <AoAIcon />}
          {this.props.type === ToastsType.Announcement && <AnnouncementIcon />}
          {this.props.type === ToastsType.Reply && <ReplyIcon />}
          {this.props.type === ToastsType.Error && <ErrorIcon />}
        </div>
      </div>
    );
  }
}
