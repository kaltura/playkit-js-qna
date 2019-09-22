import { Component, h } from "preact";
import * as styles from "./_toastIcon.scss";
import classNames from "classnames";

export enum ToastsType {
    ANNOUNCEMENT = "ANNOUNCEMENT",
    AOA = "AOA",
    REPLY = "REPLY"
}

export interface ToastIconProps {
    type: ToastsType;
}

export class ToastIcon extends Component<ToastIconProps> {
    render() {
        return (
            <div className={styles.container}>
                <div
                    className={classNames(styles.iconWrapper, {
                        [styles.announcementIcon]: this.props.type === ToastsType.ANNOUNCEMENT,
                        [styles.aoaIcon]: this.props.type === ToastsType.AOA,
                        [styles.replyIcon]: this.props.type === ToastsType.REPLY
                    })}
                />
            </div>
        );
    }
}
