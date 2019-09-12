import { h, Component } from "preact";
import * as styles from "./timeDisplay.scss";
import { Utils } from "../../utils";
import classNames from "classnames";

interface TimeDisplayProps {
    time: Date;
    dateFormat: string;
    className: string;
}

interface TimeDisplayState {}

export class TimeDisplay extends Component<TimeDisplayProps, TimeDisplayState> {
    render() {
        const { time, dateFormat, className } = this.props;
        const isDateOlderThan24Hours = Utils.isDateOlderThan24Hours(time);

        return (
            <div
                className={classNames(className, {
                    [styles.timeDisplayNewlineDrop]: isDateOlderThan24Hours
                })}
            >
                <div className={classNames(styles.dateTimeProp, styles.timeContainer)}>
                    <span>{Utils.getDisplayTime(time)}</span>
                </div>
                {isDateOlderThan24Hours && (
                    <div className={classNames(styles.dateTimeProp, styles.dateContainer)}>
                        <span>{Utils.getDisplayDate(time, dateFormat)}</span>
                    </div>
                )}
            </div>
        );
    }
}
