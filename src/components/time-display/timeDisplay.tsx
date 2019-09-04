import { h, Component } from "preact";
import * as styles from "./timeDisplay.scss";
import { Utils } from "../../utils";
import classNames from "classnames";
import { DateTimeFormatting } from "../kitchen-sink";

interface TimeDisplayProps {
    time: Date;
    formatting: DateTimeFormatting;
    className: string;
}

interface TimeDisplayState {}

export class TimeDisplay extends Component<TimeDisplayProps, TimeDisplayState> {
    render() {
        const { time, formatting, className } = this.props;

        return (
            <span className={className}>
                {Utils.isDateOlderThan24Hours(time) && (
                    <span className={classNames(styles.dateTimeProp, styles.date)}>
                        {Utils.getDisplayDate(time, formatting)}
                    </span>
                )}
                <span className={classNames(styles.dateTimeProp, styles.time)}>
                    {Utils.getDisplayTime(time)}
                </span>
            </span>
        );
    }
}
