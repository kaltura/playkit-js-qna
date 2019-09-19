import { Component, h } from "preact";
import * as styles from "./_answeredOnAirIcon.scss";

export class AnsweredOnAirIcon extends Component {
    render() {
        return (
            <div className={styles.ovalContainer}>
                <div className={styles.iconImage} />
            </div>
        );
    }
}
